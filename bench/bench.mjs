#!/usr/bin/env node
// Benchmark lean against vanilla Claude Code, and lean against itself with a candidate feature.
//
//   node bench/bench.mjs --arms base,lean --runs 3
//   node bench/bench.mjs --arms lean,cand=readcache --runs 3 --tasks explore,edit
//
// Arms:
//   base / vanilla  vanilla Claude Code, no plugin (any name starting with either)
//   NAME            lean plugin with its default features (features.json)
//   NAME=f1+f2      lean plugin with exactly these features (LEAN_FEATURES)
//
// "Vanilla" means user settings, user plugins, user hooks and claude.ai connectors are all off
// (--setting-sources project,local + ENABLE_CLAUDEAI_MCP_SERVERS=false), in every arm.
// Each arm works in its own throwaway clone of the repo, reset after every run, and arms run
// in parallel so API drift hits them equally. Costs real money: tasks x arms x runs sessions,
// plus one unscored warm-up session per arm per repo (--warmup 0 to skip). The warm-up pays the
// cold prompt-cache write, which otherwise lands on whichever scored session happens to run first.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generate } from "./fixture.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const plugin = resolve(here, "../plugins/lean");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const repoSrc = resolve((args.repo ?? "~/Documents/GitHub/CommandConsole").replace(/^~/, homedir()));
const runs = Number(args.runs ?? 3);
const warmup = args.warmup !== "0";
// "name", "name=f1+f2", optionally "@task1+task2" to run only those tasks in that arm.
const arms = (args.arms ?? "base,lean").split(",").map((s) => {
  const [spec, only] = s.split("@");
  const [name, feats] = spec.split("=");
  return { name, plugin: !/^(base|vanilla)/.test(name), features: feats, only: only?.split("+") };
});
const allTasks = JSON.parse(readFileSync(join(here, "tasks.json"), "utf8"));
const tasks = args.tasks ? allTasks.filter((t) => args.tasks.split(",").includes(t.id)) : allTasks;

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(here, "results", `${stamp}_${arms.map((a) => a.name).join("-vs-")}`);
const work = join(tmpdir(), `lean-bench-${stamp}`); // repo clones stay out of the results folder
mkdirSync(outDir, { recursive: true });
mkdirSync(work, { recursive: true });

const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "pipe" }).toString().trim();
const commit = git(repoSrc, "rev-parse", "--short", "HEAD");
const fixtureSrc = join(work, "fixture-src");
if (tasks.some((t) => t.repo === "fixture")) generate(fixtureSrc);

function claude(arm, task, clone, tag) {
  const cli = ["-p", "--output-format", "json", "--setting-sources", "project,local", "--allowedTools", task.allowed];
  if (arm.plugin) cli.push("--plugin-dir", plugin);
  const env = {
    ...process.env,
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    LEAN_USAGE_LOG: join(outDir, `usage-${arm.name}.jsonl`),
    LEAN_SAVINGS_LOG: join(outDir, `savings-${arm.name}.jsonl`),
  };
  if (arm.features !== undefined) env.LEAN_FEATURES = arm.features;
  else delete env.LEAN_FEATURES;
  return new Promise((done) => {
    const child = spawn("claude", cli, { cwd: clone, env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), 15 * 60_000);
    child.on("close", () => {
      clearTimeout(timer);
      writeFileSync(join(outDir, `${tag}.json`), out);
      try {
        done(JSON.parse(out));
      } catch {
        done({ is_error: true, result: out.slice(0, 500) });
      }
    });
    child.stdin.end(task.prompt);
  });
}

async function runArm(arm) {
  const clones = {};
  const cloneFor = (task) => {
    const key = task.repo === "fixture" ? "fixture" : "main";
    if (!clones[key]) {
      clones[key] = join(work, `${arm.name}-${key}`);
      execFileSync("git", ["clone", "-q", "--local", key === "fixture" ? fixtureSrc : repoSrc, clones[key]]);
    }
    return clones[key];
  };
  const armTasks = arm.only ? tasks.filter((t) => arm.only.includes(t.id)) : tasks;
  const rows = [];
  if (warmup) {
    // One per repo: the fixture and the main repo get different repo maps, so different prompt prefixes.
    const firstPerRepo = [...new Map(armTasks.map((t) => [t.repo === "fixture" ? "fixture" : "main", t])).values()];
    for (const task of firstPerRepo) {
      const clone = cloneFor(task);
      const res = await claude(arm, task, clone, `${arm.name}-${task.id}-warmup`);
      git(clone, "reset", "-q", "--hard");
      git(clone, "clean", "-q", "-fd");
      warmupSpend += res.total_cost_usd ?? 0;
      console.error(`${arm.name}-${task.id}-warmup: unscored $${(res.total_cost_usd ?? 0).toFixed(3)}`);
    }
  }
  for (let r = 1; r <= runs; r++) {
    for (const task of armTasks) {
      const clone = cloneFor(task);
      const tag = `${arm.name}-${task.id}-${r}`;
      const res = await claude(arm, task, clone, tag);
      let pass = !res.is_error;
      const missing = pass ? (task.expect ?? []).filter((re) => !new RegExp(re, "i").test(res.result ?? "")) : [];
      if (missing.length) {
        pass = false;
        res.check_output = `answer missing: ${missing.join(", ")}`;
      }
      if (pass && task.check) {
        try {
          execFileSync("sh", ["-c", task.check], { cwd: clone, stdio: "pipe" });
        } catch (err) {
          pass = false;
          res.check_output = String(err.stdout ?? "").trim();
        }
      }
      git(clone, "reset", "-q", "--hard");
      git(clone, "clean", "-q", "-fd");
      rows.push({ arm: arm.name, task: task.id, run: r, pass, res });
      console.error(`${tag}: ${pass ? "ok" : "FAIL"} $${(res.total_cost_usd ?? 0).toFixed(3)} ${res.num_turns ?? "?"} turns${res.check_output ? " (" + res.check_output + ")" : ""}`);
    }
  }
  return rows;
}

let warmupSpend = 0;
console.error(`repo ${repoSrc} @ ${commit} · arms ${arms.map((a) => a.name).join(", ")} · ${tasks.length} tasks x ${runs} runs${warmup ? " + warm-up" : ""}\nresults: ${outDir}\n`);
const rows = (await Promise.all(arms.map(runArm))).flat();

// ---------- summary ----------
const u = (r) => r.usage ?? {};
const METRICS = [
  ["cost $", (r) => r.total_cost_usd ?? 0, 3],
  ["turns", (r) => r.num_turns ?? 0, 1],
  ["wall s", (r) => (r.duration_ms ?? 0) / 1000, 0],
  ["input tok", (r) => (u(r).input_tokens ?? 0) + (u(r).cache_creation_input_tokens ?? 0) + (u(r).cache_read_input_tokens ?? 0), 0],
  ["cache write tok", (r) => u(r).cache_creation_input_tokens ?? 0, 0],
  ["output tok", (r) => u(r).output_tokens ?? 0, 0],
];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs) => (xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1)) : 0);
const num = (v, d) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
const pct = (v, ref) => (ref ? `${v > ref ? "+" : ""}${(((v - ref) / ref) * 100).toFixed(0)}%` : "");

const ref = arms[0].name;
const lines = [
  `# Benchmark ${stamp}`,
  "",
  `Repo \`${repoSrc}\` @ \`${commit}\` · ${runs} runs per task per arm${warmup ? " after an unscored warm-up" : ""} · arms: ${arms.map((a) => (a.features !== undefined ? `${a.name} (${a.features || "no features"})` : a.name)).join(", ")} · % change vs **${ref}**`,
  "",
];
const section = (title, armList, pick) => {
  lines.push(`## ${title}`, "", `| arm | pass | ${METRICS.map((m) => m[0]).join(" | ")} |`, `|---|---|${METRICS.map(() => "---:").join("|")}|`);
  const refRows = pick(ref);
  for (const a of armList) {
    const rs = pick(a.name);
    const cells = METRICS.map(([, f, d]) => {
      const v = mean(rs.map((x) => f(x.res)));
      const extra = f === METRICS[0][1] ? ` ±${num(sd(rs.map((x) => f(x.res))), d)}` : "";
      const delta = a.name === ref ? "" : ` (${pct(v, mean(refRows.map((x) => f(x.res))))})`;
      return `${num(v, d)}${extra}${delta}`;
    });
    lines.push(`| ${a.name} | ${rs.filter((x) => x.pass).length}/${rs.length} | ${cells.join(" | ")} |`);
  }
  lines.push("");
};
// Each arm vs the reference arm, summed over the tasks both ran.
lines.push(`## Each arm vs ${ref} on the same tasks (sum of per-task means)`, "", "| arm | tasks | pass | cost | turns | wall | input tok | output tok |", "|---|---|---|---:|---:|---:|---:|---:|");
for (const a of arms.slice(1)) {
  const ts = [...new Set(rows.filter((x) => x.arm === a.name).map((x) => x.task))].filter((t) => rows.some((x) => x.arm === ref && x.task === t));
  const agg = (arm, f) => ts.reduce((s, t) => s + mean(rows.filter((x) => x.arm === arm && x.task === t).map((x) => f(x.res))), 0);
  const mine = rows.filter((x) => x.arm === a.name);
  const cells = [0, 1, 2, 3, 5].map((i) => pct(agg(a.name, METRICS[i][1]), agg(ref, METRICS[i][1])));
  lines.push(`| ${a.name} | ${ts.join(", ")} | ${mine.filter((x) => x.pass).length}/${mine.length} | ${cells.join(" | ")} |`);
}
lines.push("");
for (const t of tasks) {
  const armList = arms.filter((a) => rows.some((x) => x.arm === a.name && x.task === t.id));
  if (armList.length) section(`Task: ${t.id}`, armList, (arm) => rows.filter((x) => x.arm === arm && x.task === t.id));
}
lines.push(`Total spend: $${num(rows.reduce((a, x) => a + (x.res.total_cost_usd ?? 0), 0) + warmupSpend, 2)}${warmup ? ` (warm-up $${num(warmupSpend, 2)})` : ""}`);

const summary = lines.join("\n");
writeFileSync(join(outDir, "summary.md"), summary + "\n");
console.log(summary);
