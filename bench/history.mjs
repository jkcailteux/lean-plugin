#!/usr/bin/env node
// What actually drives cost in your Claude Code history? Uses the per-turn `usage` Claude Code
// records (cache reads/writes, output), not just tool output size, and looks for waste patterns:
// cache misses after idle gaps, long-context turns, failed tool calls, repeated identical calls,
// edit runs on one file, sequential single-read turns, and large writes.
//
//   node bench/history.mjs [projects-dir]
import { readdirSync, statSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const root = process.argv[2] ?? join(homedir(), ".claude", "projects");
// Relative prices (input = 1). Cache write 5m 1.25x, 1h 2x, cache read 0.1x, output 5x.
const W = { input: 1, cw5: 1.25, cw1h: 2, cr: 0.1, out: 5 };
const SKIP = /lean-bench|probe-repo|scratchpad/;
const READONLY = new Set(["Read", "Grep", "Glob", "mcp__plugin_woz_code__Search", "mcp__plugin_lean_tools__MultiRead"]);
const EDIT = new Set(["Edit", "MultiEdit"]);

const groups = new Map(); // group -> stats
const G = (name) => {
  if (!groups.has(name))
    groups.set(name, {
      sessions: 0, turns: 0, cost: { input: 0, cw5: 0, cw1h: 0, cr: 0, out: 0 },
      missTokens: { lt5m: 0, m5to60: 0, gt60: 0 }, missTurns: { lt5m: 0, m5to60: 0, gt60: 0 },
      bigCtxTurns: 0, bigCtxReadCost: 0, ctxSum: 0,
      errors: new Map(), errorCount: 0, toolCalls: 0,
      repeats: 0, repeatChars: 0, editRuns: 0, edits: 0, seqReadTurns: 0, readTurns: 0,
      writeChars: 0, editNewChars: 0, textChars: 0, attach: new Map(), compactions: 0,
    });
  return groups.get(name);
};

function normErr(t) {
  return t.replace(/<[^>]+>/g, "").replace(/\/[^\s:'"]+/g, "<path>").replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 70);
}

async function scan(file, g) {
  const seenMsg = new Set();
  const seenUse = new Set();
  const done = new Set();
  const uses = new Map();
  const callKeys = new Map();
  let lastT = null;
  let firstTurn = true;
  let prevTool = null; // {name, file}
  let prevTurnSingleRead = false;
  g.sessions++;
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.isCompactSummary) g.compactions++;
    if (e.type === "attachment" && e.attachment?.type) {
      const a = g.attach.get(e.attachment.type) ?? { n: 0, chars: 0 };
      a.n++;
      a.chars += JSON.stringify(e.attachment).length;
      g.attach.set(e.attachment.type, a);
    }
    if (e.isSidechain) continue;
    const content = Array.isArray(e.message?.content) ? e.message.content : [];
    if (e.type === "assistant" && e.message?.id && !seenMsg.has(e.message.id)) {
      seenMsg.add(e.message.id);
      const u = e.message.usage ?? {};
      const t = e.timestamp ? Date.parse(e.timestamp) : null;
      const cw1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      const cw = u.cache_creation_input_tokens ?? 0;
      g.turns++;
      g.cost.input += (u.input_tokens ?? 0) * W.input;
      g.cost.cw1h += cw1h * W.cw1h;
      g.cost.cw5 += (cw - cw1h) * W.cw5;
      g.cost.cr += (u.cache_read_input_tokens ?? 0) * W.cr;
      g.cost.out += (u.output_tokens ?? 0) * W.out;
      const ctx = (u.input_tokens ?? 0) + cw + (u.cache_read_input_tokens ?? 0);
      g.ctxSum += ctx;
      if (ctx > 120_000) {
        g.bigCtxTurns++;
        g.bigCtxReadCost += (u.cache_read_input_tokens ?? 0) * W.cr + cw * W.cw5;
      }
      // A cache miss: a large write after the session is warm. Bucket by idle gap.
      if (!firstTurn && cw > 15_000 && lastT && t) {
        const gap = (t - lastT) / 60_000;
        const b = gap < 5 ? "lt5m" : gap < 60 ? "m5to60" : "gt60";
        g.missTurns[b]++;
        g.missTokens[b] += cw;
      }
      firstTurn = false;
      if (t) lastT = t;
      const toolUses = content.filter((c) => c.type === "tool_use");
      const singleRead = toolUses.length === 1 && READONLY.has(toolUses[0].name);
      if (singleRead) {
        g.readTurns++;
        if (prevTurnSingleRead) g.seqReadTurns++;
      }
      prevTurnSingleRead = singleRead;
    }
    for (const c of content) {
      if (c.type === "text" && e.type === "assistant") g.textChars += c.text?.length ?? 0;
      if (c.type === "tool_use" && !seenUse.has(c.id)) {
        seenUse.add(c.id);
        g.toolCalls++;
        uses.set(c.id, c);
        const key = c.name + JSON.stringify(c.input);
        if (callKeys.has(key) && !EDIT.has(c.name) && c.name !== "Write") g.repeats++;
        callKeys.set(key, c.id);
        const file = c.input?.file_path;
        if (EDIT.has(c.name)) {
          g.edits++;
          if (prevTool && EDIT.has(prevTool.name) && prevTool.file === file) g.editRuns++;
          g.editNewChars += (c.input?.new_string ?? "").length;
        }
        if (c.name === "Write") g.writeChars += (c.input?.content ?? "").length;
        prevTool = { name: c.name, file };
      }
      if (c.type === "tool_result" && !done.has(c.tool_use_id)) {
        done.add(c.tool_use_id);
        const u = uses.get(c.tool_use_id);
        const text = typeof c.content === "string" ? c.content : (c.content ?? []).map((x) => x.text ?? "").join("");
        if (u && callKeys.get(u.name + JSON.stringify(u.input)) !== u.id) g.repeatChars += text.length;
        if (c.is_error && u) {
          g.errorCount++;
          const k = `${u.name}: ${normErr(text)}`;
          g.errors.set(k, (g.errors.get(k) ?? 0) + 1);
        }
      }
    }
  }
}

for (const p of readdirSync(root)) {
  const dir = join(root, p);
  if (SKIP.test(p) || !statSync(dir).isDirectory()) continue;
  const g = G(/observer/.test(p) ? "claude-mem observer" : "your sessions");
  for (const f of readdirSync(dir)) if (f.endsWith(".jsonl")) await scan(join(dir, f), g);
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);
const grand = [...groups.values()].reduce((s, g) => s + total(g.cost), 0);
for (const [name, g] of groups) {
  const c = total(g.cost);
  const pc = (x) => `${((100 * x) / c).toFixed(1)}%`;
  console.log(`\n# ${name}: ${g.sessions} sessions, ${fmt(g.turns)} turns, ${((100 * c) / grand).toFixed(1)}% of all spend`);
  console.log(`cost mix: cache reads ${pc(g.cost.cr)}, cache writes ${pc(g.cost.cw5 + g.cost.cw1h)} (1h ${pc(g.cost.cw1h)}), output ${pc(g.cost.out)}, uncached input ${pc(g.cost.input)}`);
  console.log(`avg context per turn: ${fmt(g.ctxSum / Math.max(1, g.turns))} tokens; turns over 120k context: ${g.bigCtxTurns} (${pc(g.bigCtxReadCost)} of spend); compactions: ${g.compactions}`);
  const mt = g.missTokens;
  console.log(`mid-session cache misses (>15k write): <5m idle ${g.missTurns.lt5m} turns/${fmt(mt.lt5m)} tok, 5-60m ${g.missTurns.m5to60}/${fmt(mt.m5to60)}, >60m ${g.missTurns.gt60}/${fmt(mt.gt60)} -> ${pc((mt.lt5m * W.cw5 + mt.m5to60 * W.cw1h + mt.gt60 * W.cw1h))} of spend`);
  console.log(`tool calls ${fmt(g.toolCalls)}; failed ${g.errorCount} (${((100 * g.errorCount) / Math.max(1, g.toolCalls)).toFixed(1)}%); identical repeat calls ${g.repeats} (${fmt(g.repeatChars / 4)} tok)`);
  console.log(`edits ${g.edits}, of which ${g.editRuns} directly follow an edit to the same file (batchable); single-read turns ${g.readTurns}, of which ${g.seqReadTurns} follow another single-read turn (parallelizable)`);
  console.log(`output written: Write ${fmt(g.writeChars / 4)} tok, Edit new_string ${fmt(g.editNewChars / 4)} tok, assistant text ${fmt(g.textChars / 4)} tok`);
  console.log("top failed calls:");
  for (const [k, n] of [...g.errors].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log("biggest attachments (fixed per-session context):");
  for (const [k, a] of [...g.attach].sort((a, b) => b[1].chars - a[1].chars).slice(0, 6)) console.log(`  ${k}: ${a.n}x, avg ${fmt(a.chars / a.n / 4)} tok`);
}
