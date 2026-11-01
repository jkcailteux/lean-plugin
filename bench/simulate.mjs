#!/usr/bin/env node
// Counterfactual: what would your real sessions have cost with earlier compaction?
// Replays each session's per-turn usage (context size, cache writes, output) and re-prices it
// as if the context had been compacted:
//   window W     compact whenever context passes W tokens (Claude Code's autoCompactWindow)
//   idle         compact when resuming after >60 min idle with context over 150k (a nudge that holds the prompt)
//   idle warning compact right after that resumed turn (a warning: the stale turn is paid in full first)
// A compaction costs one full read of the context (uncached, 1x), ~4k output tokens of summary
// (5x), and re-writing the smaller context (2x). Afterwards every turn carries ~SUMMARY tokens
// plus whatever the session added since, instead of the full history.
//
//   node bench/simulate.mjs
import { readdirSync, statSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const root = join(homedir(), ".claude", "projects");
const SKIP = /lean-bench|probe-repo|scratchpad|observer/;
const W = { input: 1, cw: 2, cr: 0.1, out: 5 };
const SUMMARY = 25_000; // context right after a compaction (system prompt + tools + summary)
const SUMMARY_OUT = 4_000;
// Re-reads after a compaction: the summary loses detail, so assume Claude reads this many tokens
// of files back in (written to cache at 2x, then carried). LEAN_SIM_REREAD overrides.
const REREAD = Number(process.env.LEAN_SIM_REREAD ?? 30_000);

async function turnsOf(file) {
  const seen = new Set();
  const turns = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type !== "assistant" || e.isSidechain || !e.message?.id || seen.has(e.message.id)) continue;
    seen.add(e.message.id);
    const u = e.message.usage ?? {};
    turns.push({
      t: e.timestamp ? Date.parse(e.timestamp) : null,
      ctx: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      cw: u.cache_creation_input_tokens ?? 0,
      out: u.output_tokens ?? 0,
    });
  }
  return turns;
}

// Price a session; `policy(turn, i, prev, simCtx)` returns true to compact before turn i.
function price(turns, policy) {
  let cost = 0;
  let offset = 0; // tokens removed from context by compactions so far
  let compactions = 0;
  turns.forEach((tu, i) => {
    const prev = turns[i - 1];
    const sim = Math.max(SUMMARY + REREAD, tu.ctx - offset);
    if (i > 0 && policy(tu, i, prev, sim, turns)) {
      cost += sim * W.input + SUMMARY_OUT * W.out + REREAD * W.cw; // summarize, then re-read files
      offset = Math.max(0, tu.ctx - SUMMARY - REREAD);
      compactions++;
    }
    const ctx = Math.max(SUMMARY + (compactions ? REREAD : 0), tu.ctx - offset);
    const write = Math.min(ctx, tu.cw > 0 && offset > 0 && tu.cw > ctx ? ctx : tu.cw); // a miss re-writes the (smaller) context
    cost += write * W.cw + (ctx - write) * W.cr + tu.out * W.out;
  });
  return { cost, compactions };
}

const sessions = [];
for (const p of readdirSync(root)) {
  const dir = join(root, p);
  if (SKIP.test(p) || !statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith(".jsonl")) sessions.push(await turnsOf(join(dir, f)));
}

const idle = (a, b) => a?.t && b?.t && b.t - a.t > 60 * 60_000;
const policies = {
  "as recorded": () => false,
  "idle nudge (resume >60m, ctx >150k)": (tu, i, prev, sim) => prev?.t && tu.t && tu.t - prev.t > 60 * 60_000 && sim > 150_000,
  "idle warning (compact after the resumed turn)": (tu, i, prev, sim, turns) => i > 1 && idle(turns[i - 2], prev) && sim > 150_000,
  "autoCompactWindow 400k": (tu, i, prev, sim) => sim > 400_000,
  "autoCompactWindow 300k": (tu, i, prev, sim) => sim > 300_000,
  "autoCompactWindow 200k": (tu, i, prev, sim) => sim > 200_000,
  "autoCompactWindow 150k": (tu, i, prev, sim) => sim > 150_000,
  "200k window + idle nudge": (tu, i, prev, sim) => sim > 200_000 || (prev?.t && tu.t && tu.t - prev.t > 60 * 60_000 && sim > 150_000),
  "200k window + idle warning": (tu, i, prev, sim, turns) => sim > 200_000 || (i > 1 && idle(turns[i - 2], prev) && sim > 150_000),
};
const base = sessions.reduce((s, t) => s + price(t, policies["as recorded"]).cost, 0);
console.log(`${sessions.length} sessions, ${sessions.reduce((s, t) => s + t.length, 0)} turns; re-read penalty ${REREAD.toLocaleString("en-US")} tokens per compaction\n`);
console.log("| policy | relative cost | change | compactions |\n|---|---:|---:|---:|");
for (const [name, pol] of Object.entries(policies)) {
  let cost = 0;
  let n = 0;
  for (const t of sessions) {
    const r = price(t, pol);
    cost += r.cost;
    n += r.compactions;
  }
  console.log(`| ${name} | ${(cost / base).toFixed(3)} | ${(((cost - base) / base) * 100).toFixed(1)}% | ${n} |`);
}
