// UsageStats: what this project's sessions cost, which tools filled the context, and what lean saved.
// Everything comes from the transcripts Claude Code already writes
// (~/.claude/projects/<project path with non-alphanumerics as "-">/*.jsonl) plus lean's savings log,
// so nothing runs per tool call.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// API list prices in $ per million tokens: [model id prefix, input, output, cache read].
// Cache read defaults to 0.1x input; cache writes are 1.25x input (5-minute) or 2x (1-hour).
// The longest matching prefix wins.
const PRICES = [
  ["claude-fable-5-1", 10, 50, 0.25],
  ["claude-mythos-5-1", 10, 50, 0.25],
  ["claude-fable-5", 10, 50],
  ["claude-mythos-5", 10, 50],
  ["claude-opus-5-5", 4, 20, 0.2],
  ["claude-opus-5", 5, 25],
  ["claude-opus-4", 5, 25],
  ["claude-opus-4-1", 15, 75],
  ["claude-opus-4-2", 15, 75], // claude-opus-4-20250514
  ["claude-sonnet-5-5", 2, 10, 0.2],
  ["claude-sonnet-5", 2, 10],
  ["claude-sonnet-4", 3, 15],
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-haiku-4", 1, 5],
  ["claude-3-5-haiku", 0.8, 4],
];
const DEFAULT_MODEL = "claude-opus-5-5";
const MATCH_MS = 120_000; // a savings record and its tool_result are written within this window
const MAX_LATENCY_MS = 10 * 60_000; // longer gaps are the user away, not the model working
const COMPACT_SUMMARY_TOKENS = 10_000; // output a /compact spends writing its summary

export function priceOf(model) {
  let best;
  for (const p of PRICES) if (model?.startsWith(p[0]) && (!best || p[0].length > best[0].length)) best = p;
  const [, inp, out, cr = inp * 0.1] = best ?? PRICES.find((p) => p[0] === DEFAULT_MODEL);
  return { in: inp / 1e6, out: out / 1e6, cr: cr / 1e6 };
}

function turnOf(u, model) {
  const p = priceOf(model);
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const w5m = Math.max(0, (u.cache_creation_input_tokens ?? 0) - w1h);
  const read = u.cache_read_input_tokens ?? 0;
  return {
    p,
    w: w1h > 0 ? 2 : 1.25, // what re-writing context costs, relative to input price
    ctx: (u.input_tokens ?? 0) + w5m + w1h + read,
    cost: (u.input_tokens ?? 0) * p.in + w5m * p.in * 1.25 + w1h * p.in * 2 + read * p.cr + (u.output_tokens ?? 0) * p.out,
  };
}

const chars = (content) =>
  typeof content === "string" ? content.length : (content ?? []).reduce((s, x) => s + (x.text?.length ?? 0), 0);

export function readLog(path, since) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (row.t >= since) rows.push(row);
    } catch {}
  }
  return rows;
}

export function scan(root, since) {
  const dir = join(homedir(), ".claude", "projects", root.replace(/[^a-zA-Z0-9]/g, "-"));
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => join(dir, f)).filter((f) => statSync(f).mtimeMs >= since);
  } catch {}
  const byTool = new Map();
  const latencies = [];
  const sessions = files.map((file) => {
    const s = { file, turns: [], lean: [], boundaries: [] };
    const uses = new Map();
    const done = new Set();
    const seen = new Set();
    let lastResult = 0;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.includes('"assistant"') && !line.includes('"tool_') && !line.includes("compact_boundary")) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      const t = Date.parse(e.timestamp);
      if (t < since) continue;
      if (e.subtype === "compact_boundary") s.boundaries.push(t);
      if (e.type === "assistant" && e.message?.usage && !e.isSidechain && !seen.has(e.message.id)) {
        seen.add(e.message.id);
        s.turns.push({ t, ...turnOf(e.message.usage, e.message.model) });
        if (lastResult && t - lastResult < MAX_LATENCY_MS) latencies.push(t - lastResult);
        lastResult = 0;
      }
      for (const c of Array.isArray(e.message?.content) ? e.message.content : []) {
        if (c.type === "tool_use") uses.set(c.id, c.name);
        else if (c.type === "tool_result" && !done.has(c.tool_use_id)) {
          done.add(c.tool_use_id);
          lastResult = t;
          const name = (uses.get(c.tool_use_id) ?? "?").replace(/^mcp__plugin_lean_tools__/, "lean:");
          const agg = byTool.get(name) ?? { calls: 0, chars: 0 };
          agg.calls++;
          agg.chars += chars(c.content);
          byTool.set(name, agg);
          if (name.startsWith("lean:")) s.lean.push({ id: c.tool_use_id, tool: name.slice(5), t });
        }
      }
    }
    s.cost = s.turns.reduce((sum, x) => sum + x.cost, 0);
    return s;
  });
  latencies.sort((a, b) => a - b);
  return { dir, byTool, sessions, turnMs: latencies.length ? latencies[latencies.length >> 1] : 0 };
}

// Turns from t until the next compaction (which drops everything that came before it).
function turnsAfter(s, t) {
  const end = s.boundaries.find((b) => b > t) ?? Infinity;
  return s.turns.filter((x) => x.t > t && x.t < end);
}

// What one lean tool call saved: the output it kept out of context (written once to the cache,
// then re-read on every later turn until compaction), plus each round trip it saved at this
// session's average turn cost and the median turn time.
function toolSaving(row, s, call, turnMs) {
  const after = turnsAfter(s, call.t);
  const next = after[0] ?? s.turns.at(-1);
  const tokens = Math.max(0, (row.baseline - row.sent) / 4);
  const trips = row.callsSaved ?? 0;
  const perTurn = s.turns.length ? s.cost / s.turns.length : 0;
  const tokenCost = next ? tokens * (next.p.in * next.w + next.p.cr * Math.max(0, after.length - 1)) : 0;
  return { tokens, trips, cost: tokenCost + trips * perTurn, ms: trips * turnMs };
}

// What a context-guard warning saved when the user compacted soon after. The resumed turn re-wrote the
// stale context either way, so the cache is warm: without the compaction every later turn re-reads the
// big context; with it, the compaction reads it once and later turns carry only the summary.
function guardSaving(row, s) {
  const boundary = s.boundaries.find((b) => b > row.t && b - row.t < 30 * 60_000);
  if (boundary === undefined) return null;
  const after = turnsAfter(s, boundary);
  if (!after.length) return null;
  const { p, w, ctx: small } = after[0];
  const big = row.ctx;
  const without = big * p.cr * after.length;
  const withIt = big * p.cr + COMPACT_SUMMARY_TOKENS * p.out + small * p.in * w + small * p.cr * (after.length - 1);
  return Math.max(0, without - withIt);
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const tok = (c) => fmt(c / 4);
const usd = (d) => `$${d < 10 ? d.toFixed(2) : fmt(d)}`;
const dur = (ms) => (ms < 90_000 ? `${Math.round(ms / 1000)}s` : ms < 5_400_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 3_600_000).toFixed(1)} h`);

export function usageStats(root, savingsLog, { sinceHours = 24, maxTools = Infinity } = {}) {
  const since = Date.now() - sinceHours * 3600_000;
  const { dir, byTool, sessions, turnMs } = scan(root, since);
  const out = [];
  const turns = sessions.reduce((n, s) => n + s.turns.length, 0);
  const spent = sessions.reduce((n, s) => n + s.cost, 0);

  out.push(`Last ${sinceHours}h · ${sessions.length} session(s) in this project`);
  if (turns) out.push(`Spent ≈ ${usd(spent)} at API list prices over ${fmt(turns)} turns · median turn ${dur(turnMs)}`);

  if (byTool.size) {
    const rows = [...byTool].sort((a, b) => b[1].chars - a[1].chars);
    const total = rows.reduce((n, [, a]) => n + a.chars, 0);
    // Fold the tail into one row so a short report stays short.
    if (rows.length > maxTools) {
      const rest = rows.splice(maxTools - 1);
      const sum = (k) => rest.reduce((n, [, a]) => n + a[k], 0);
      rows.push([`${rest.length} more tools`, { calls: sum("calls"), chars: sum("chars") }]);
    }
    out.push(
      "",
      "Tool output by tool (≈ tokens = chars / 4)",
      "| tool | calls | output chars | ≈ tokens | share |",
      "|---|---:|---:|---:|---:|",
      ...rows.map(([tool, a]) => `| ${tool} | ${a.calls} | ${fmt(a.chars)} | ${tok(a.chars)} | ${((100 * a.chars) / total).toFixed(1)}% |`)
    );
  } else {
    out.push(`No tool calls in the last ${sinceHours}h (${dir}).`);
  }

  // Match each savings record to its tool call in this project's transcripts: by tool_use id when the
  // record has one, otherwise the nearest call to the same tool. Records from other projects don't match.
  const calls = sessions.flatMap((s) => s.lean.map((c) => ({ ...c, s })));
  const byId = new Map(calls.map((c) => [c.id, c]));
  const used = new Set();
  const saved = new Map();
  const add = (key, d) => {
    const a = saved.get(key) ?? { uses: 0, tokens: 0, trips: 0, cost: 0, ms: 0, note: "" };
    for (const k of ["uses", "tokens", "trips", "cost", "ms"]) a[k] += d[k] ?? 0;
    saved.set(key, a);
    return a;
  };
  let warned = 0;
  let compacted = 0;
  for (const row of readLog(savingsLog, since)) {
    if (row.host === "cursor" || (row.root && row.root !== root)) continue;
    if (row.tool === "contextguard") {
      const s = sessions.find((x) => x.file === row.transcript);
      if (!s) continue;
      warned++;
      const cost = guardSaving(row, s);
      if (cost !== null) compacted++;
      add("context guard", { cost: cost ?? 0 });
      continue;
    }
    let call = row.id && byId.get(row.id);
    if (!call) {
      let best = MATCH_MS;
      for (const c of calls) {
        const gap = Math.abs(c.t - row.t);
        if (c.tool === row.tool && !used.has(c) && gap <= best) [call, best] = [c, gap];
      }
    }
    if (!call || used.has(call)) continue;
    used.add(call);
    add(`lean:${row.tool}`, { uses: 1, ...toolSaving(row, call.s, call, turnMs) });
  }
  if (warned) saved.get("context guard").uses = `${warned} warned, ${compacted} compacted`;

  if (saved.size) {
    const total = [...saved.values()].reduce((n, a) => ({ cost: n.cost + a.cost, ms: n.ms + a.ms, tokens: n.tokens + a.tokens, trips: n.trips + a.trips }), { cost: 0, ms: 0, tokens: 0, trips: 0 });
    out.push(
      "",
      "What lean saved (estimates)",
      "| source | uses | ≈ tokens kept out | round trips saved | ≈ $ saved | ≈ time saved |",
      "|---|---:|---:|---:|---:|---:|",
      ...[...saved].map(([k, a]) => `| ${k} | ${a.uses} | ${a.tokens ? fmt(a.tokens) : "–"} | ${a.trips || "–"} | ${usd(a.cost)} | ${a.ms ? dur(a.ms) : "–"} |`),
      `Total: ≈ ${usd(total.cost)}${spent ? ` (${Math.round((100 * total.cost) / (spent + total.cost))}% of what these sessions would have cost)` : ""}, ≈ ${dur(total.ms)} of model time, ${fmt(total.tokens)} tokens and ${total.trips} round trips.`
    );
  }
  out.push(
    "",
    "Not counted: the repo map's shorter exploration (measured overall in the benchmark: 18-28% cheaper, 25-28% faster). " +
      "$ are API list prices; on a subscription read them as usage-limit headroom. Measured A/B: node bench/bench.mjs."
  );
  return out.join("\n");
}

// Cursor's project folder is the path with punctuation as "-" and no leading dash.
function cursorSlug(root) {
  return root.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+/, "");
}

// The matching Cursor project, or, when the log's folder has none (the server was started above the
// workspace), every project directory nested under that folder.
function transcriptDirs(root) {
  const slug = cursorSlug(root);
  const base = join(homedir(), ".cursor", "projects");
  const exact = join(base, slug, "agent-transcripts");
  try {
    statSync(exact);
    return { dirs: [exact], nested: false };
  } catch {}
  let names;
  try {
    names = readdirSync(base, { withFileTypes: true });
  } catch {
    return { dirs: [], nested: false };
  }
  const dirs = names.filter((n) => n.isDirectory() && n.name.startsWith(`${slug}-`)).map((n) => join(base, n.name, "agent-transcripts"));
  return { dirs, nested: dirs.length > 0 };
}

function filesSince(dir, since) {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, n.name);
      if (n.isDirectory()) walk(p);
      else if (n.name.endsWith(".jsonl") && statSync(p).mtimeMs >= since) files.push(p);
    }
  };
  try {
    walk(dir);
  } catch {
    return null;
  }
  return files;
}

// Model calls that ran in this project's Cursor transcripts. Prompt timestamps are minute resolution,
// so they can't price a call; they can count the calls, which turns skipped round trips into a share.
function cursorCalls(root, since) {
  const { dirs, nested } = transcriptDirs(root);
  if (!dirs.length) return null;
  const files = [];
  let found = false;
  for (const dir of dirs) {
    const batch = filesSince(dir, since);
    if (!batch) continue;
    found = true;
    files.push(...batch);
  }
  if (!found) return null;
  let calls = 0;
  let prompts = 0;
  for (const file of files) {
    let open = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.includes('"user"') && !line.includes('"assistant"')) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (e.role !== "user") {
        if (open && e.role === "assistant") calls++;
        continue;
      }
      const content = e.message?.content;
      const text = typeof content === "string" ? content : content?.[0]?.text ?? "";
      const stamp = /<timestamp>([^<]+)<\/timestamp>/.exec(text);
      const t = stamp ? Date.parse(stamp[1]) : NaN;
      if (!Number.isFinite(t)) continue;
      open = t >= since;
      if (open) prompts++;
    }
  }
  return { calls, prompts, nested };
}

function callsObserved(roots, since) {
  let calls = 0;
  let prompts = 0;
  let nested = false;
  let found = false;
  for (const root of roots) {
    const a = cursorCalls(root, since);
    if (!a) continue;
    found = true;
    nested = nested || a.nested;
    calls += a.calls;
    prompts += a.prompts;
  }
  return found ? { calls, prompts, nested } : null;
}

// Cursor gives plugins no token counts. Savings come from lean's own log; the call ratio comes from
// transcripts Cursor already keeps on disk (~/.cursor/projects). There is no wall-clock figure.
export function savingsStats(root, savingsLog, { sinceHours = 24, allProjects = false } = {}) {
  const since = Date.now() - sinceHours * 3600_000;
  const rows = readLog(savingsLog, since).filter((r) => r.root && r.tool !== "contextguard" && (allProjects || r.root === root));
  const sum = (key) => {
    const m = new Map();
    for (const r of rows) {
      const a = m.get(key(r)) ?? { uses: 0, tokens: 0, trips: 0 };
      a.uses++;
      a.tokens += Math.max(0, (r.baseline - r.sent) / 4);
      a.trips += r.callsSaved ?? 0;
      m.set(key(r), a);
    }
    return [...m].sort((a, b) => b[1].tokens - a[1].tokens || b[1].trips - a[1].trips);
  };
  const table = (label, list) => [
    `| ${label} | uses | ≈ tokens kept out | round trips saved |`,
    "|---|---:|---:|---:|",
    ...list.map(([k, a]) => `| ${k} | ${a.uses} | ${a.tokens ? fmt(a.tokens) : "–"} | ${a.trips || "–"} |`),
  ];
  const where = allProjects ? "all projects" : basename(root) || root;
  const out = [`Last ${sinceHours}h · lean tool calls in ${where}`];
  if (!rows.length) {
    out.push(`No lean tool calls logged for ${allProjects ? "any project" : root} in the last ${sinceHours}h.`);
  } else {
    const byTool = sum((r) => r.tool);
    const total = byTool.reduce((n, [, a]) => ({ uses: n.uses + a.uses, tokens: n.tokens + a.tokens, trips: n.trips + a.trips }), { uses: 0, tokens: 0, trips: 0 });
    out.push("", "What lean saved (estimates; ≈ tokens = chars / 4)", ...table("tool", byTool));
    if (allProjects) out.push("", ...table("project", sum((r) => basename(r.root) || r.root)));
    out.push(`Total: ${total.uses} calls, ≈ ${fmt(total.tokens)} tokens kept out of context, ${total.trips} round trips saved.`);
    const observed = callsObserved([...new Set(rows.map((r) => r.root))], since);
    if (total.trips > 0 && observed?.prompts > 0) {
      const pct = Math.round((100 * total.trips) / (total.trips + observed.calls));
      const scope = observed.nested ? " in the Cursor projects under this folder" : "";
      out.push(`Speedup: skipped ${fmt(total.trips)} of ${fmt(total.trips + observed.calls)} model calls (${pct}%) across ${fmt(observed.prompts)} prompt(s)${scope}.`);
    } else if (total.trips > 0) {
      out.push("No prompts in this project's Cursor transcripts for this window, so the skipped calls aren't a share of the calls that ran.");
    }
  }
  out.push(
    "",
    "Cursor doesn't share token counts or cost with plugins, so spend isn't shown here: see Usage in the Cursor dashboard. " +
      "Each kept-out token is also not re-read on later turns, and each saved round trip skips a full model call. " +
      "Prompt timestamps are minute resolution, so the speedup counts model calls, not wall-clock time. " +
      "Not counted: the repo map's shorter exploration (measured in Claude Code: 18-28% cheaper, 25-28% faster)."
  );
  return out.join("\n");
}
