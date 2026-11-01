#!/usr/bin/env node
// Explain a benchmark run: which tools each arm called, how much output they produced, and how
// often files were read more than once. Reads the session transcripts Claude Code saved.
//
//   node bench/analyze.mjs bench/results/<run-folder>
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const dir = process.argv[2];
if (!dir) throw new Error("usage: analyze.mjs <results-folder>");
const projects = join(homedir(), ".claude", "projects");
const projectDirs = readdirSync(projects);

function transcript(sessionId) {
  for (const p of projectDirs) {
    const f = join(projects, p, `${sessionId}.jsonl`);
    if (existsSync(f)) return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
  return null;
}

const textLen = (c) =>
  typeof c === "string" ? c.length : Array.isArray(c) ? c.reduce((s, x) => s + (x.text?.length ?? 0), 0) : 0;
const short = (name) => name.replace(/^mcp__plugin_lean_tools__/, "lean:");
// Arm names may contain "-"; task ids may too (f-tests). Split "<arm>-<task>-<run>.json" using known task ids.
const taskIds = JSON.parse(readFileSync(new URL("./tasks.json", import.meta.url), "utf8")).map((t) => t.id);
function parseName(f) {
  const base = f.replace(/-\d+\.json$/, "");
  const task = taskIds.filter((t) => base.endsWith(`-${t}`)).sort((a, b) => b.length - a.length)[0];
  return task ? [base.slice(0, -task.length - 1), task] : base.split("-");
}

const stats = new Map(); // "arm/task" -> { sessions, tools: Map(name -> {calls, chars}), rereads, missing }
for (const f of readdirSync(dir).filter((f) => /^.+-.+-\d+\.json$/.test(f)).sort()) {
  const [arm, task] = parseName(f);
  let res;
  try {
    res = JSON.parse(readFileSync(join(dir, f), "utf8"));
  } catch {
    continue;
  }
  for (const key of [`${arm}/${task}`, `${arm}/ALL`]) {
    if (!stats.has(key)) stats.set(key, { sessions: 0, tools: new Map(), rereads: 0, missing: 0 });
  }
  const entries = res.session_id && transcript(res.session_id);
  const buckets = [stats.get(`${arm}/${task}`), stats.get(`${arm}/ALL`)];
  if (!entries) {
    buckets.forEach((b) => b.missing++);
    continue;
  }
  buckets.forEach((b) => b.sessions++);

  const uses = new Map(); // tool_use_id -> name
  const done = new Set(); // tool_use_ids whose result was counted
  const seen = new Set();
  let rereads = 0;
  for (const e of entries) {
    for (const c of Array.isArray(e.message?.content) ? e.message.content : []) {
      // Transcripts can log the same message more than once; count each tool call once.
      if (c.type === "tool_use") {
        if (uses.has(c.id)) continue;
        uses.set(c.id, c.name);
        const paths =
          c.name === "Read" ? [c.input?.file_path] : c.name.endsWith("MultiRead") ? (c.input?.files ?? []).map((x) => x.path) : [];
        for (const p of paths.filter(Boolean)) {
          const key = p.replace(/^.*?\/src\//, "src/");
          if (seen.has(key)) rereads++;
          seen.add(key);
        }
      } else if (c.type === "tool_result") {
        if (done.has(c.tool_use_id)) continue;
        done.add(c.tool_use_id);
        // Mark results that lean's hooks produced: denials with a summary, compacted command output.
        const body = typeof c.content === "string" ? c.content : (c.content ?? []).map((x) => x.text ?? "").join("");
        const tag = /lean: /.test(body) ? "[lean-hook]" : /^exit -?\d+ · \d+ lines →/.test(body) ? "[compacted]" : "";
        const name = short(uses.get(c.tool_use_id) ?? "?") + tag;
        for (const b of buckets) {
          const t = b.tools.get(name) ?? { calls: 0, chars: 0 };
          t.calls++;
          t.chars += textLen(c.content);
          b.tools.set(name, t);
        }
      }
    }
  }
  buckets.forEach((b) => (b.rereads += rereads));
}

const out = [];
for (const [key, s] of [...stats].sort(([a], [b]) => a.localeCompare(b))) {
  if (!s.sessions) {
    out.push(`${key}: no transcripts found (${s.missing})`);
    continue;
  }
  const tools = [...s.tools].sort((a, b) => b[1].chars - a[1].chars);
  const per = (n) => (n / s.sessions).toFixed(1);
  out.push(
    `${key} (${s.sessions} sessions) · re-reads/session ${per(s.rereads)} · ` +
      tools.map(([n, t]) => `${n} ${per(t.calls)}× ${Math.round(t.chars / s.sessions / 4).toLocaleString("en-US")}tok`).join(", ")
  );
}
console.log(out.join("\n"));
