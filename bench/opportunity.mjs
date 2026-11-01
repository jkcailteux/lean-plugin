#!/usr/bin/env node
// Size each token-saving idea against real Claude Code history: how much tool output in your
// actual sessions each feature could have removed. Reads ~/.claude/projects/**/*.jsonl locally.
//
//   node bench/opportunity.mjs [projects-dir]
import { readdirSync, statSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const root = process.argv[2] ?? join(homedir(), ".claude", "projects");
const files = [];
for (const p of readdirSync(root)) {
  const dir = join(root, p);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith(".jsonl")) files.push(join(dir, f));
}

const tok = (chars) => Math.round(chars / 4);
const textOf = (c) =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (x.type === "text" ? x.text : "")).join("") : "";
const DATA = /\.(json|jsonl|ndjson|csv|tsv|log|txt|xml)$/i;
const JUNK = /(\.min\.(js|css)|\.map|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|(^|\/)(dist|build|\.next|node_modules)\/)/;
const TESTCMD = /\b(npm (run )?test|pnpm test|yarn test|jest|vitest|pytest|go test|cargo (test|build)|tsc\b|npm run (build|lint|typecheck)|next build|node --test|mocha|eslint)\b/;
const EDITS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit", "mcp__plugin_woz_code__Edit"]);

const T = {
  sessions: 0,
  toolChars: new Map(),
  toolCalls: new Map(),
  rereadChars: 0,
  rereads: 0,
  reads: 0,
  readChars: 0,
  bigReadChars: 0, // reads of files >= 300 lines (outline / symbol candidates)
  dataReadChars: 0, // reads of big data files (json/csv/log...)
  grepChars: 0,
  grepJunkChars: 0, // grep output lines from lockfiles, minified, dist, or lines > 300 chars
  testChars: 0, // Bash output from test/build/lint commands
  testCalls: 0,
  editCalls: 0,
  editSessions: 0,
  toolMs: 0,
  wallMs: 0,
};
const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);

async function scan(file) {
  const uses = new Map(); // id -> {name, input, t}
  const done = new Set();
  const readState = new Map(); // path -> Set of range keys sent since last change
  let first = null;
  let last = null;
  let edits = 0;
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const t = e.timestamp ? Date.parse(e.timestamp) : null;
    if (t) {
      first ??= t;
      last = t;
    }
    if (e.isCompactSummary || e.type === "summary") readState.clear(); // context was compacted
    if (e.isSidechain) continue; // subagent turns have their own context
    for (const c of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (c.type === "tool_use" && !uses.has(c.id)) {
        uses.set(c.id, { name: c.name, input: c.input ?? {}, t });
        if (EDITS.has(c.name)) {
          edits++;
          const p = c.input?.file_path ?? c.input?.path;
          if (p) readState.delete(p);
          for (const ed of c.input?.edits ?? []) if (ed.file_path) readState.delete(ed.file_path.replace(/#.*/, ""));
        }
        if (c.name === "Bash" && /\b(sed -i|mv|rm|git (checkout|reset|stash|pull|merge|rebase)|>)/.test(c.input?.command ?? "")) readState.clear();
      } else if (c.type === "tool_result" && !done.has(c.tool_use_id) && uses.has(c.tool_use_id)) {
        done.add(c.tool_use_id);
        const u = uses.get(c.tool_use_id);
        const text = textOf(c.content);
        const n = text.length;
        add(T.toolChars, u.name, n);
        add(T.toolCalls, u.name, 1);
        if (u.t && t) T.toolMs += Math.max(0, Math.min(t - u.t, 10 * 60_000));
        if (u.name === "Read" && !c.is_error) {
          const p = u.input.file_path;
          const key = `${u.input.offset ?? 1}:${u.input.limit ?? ""}`;
          T.reads++;
          T.readChars += n;
          const seen = readState.get(p) ?? new Set();
          if (seen.has(key) && n > 200) {
            T.rereads++;
            T.rereadChars += n;
          }
          seen.add(key);
          readState.set(p, seen);
          if (text.split("\n").length >= 300) T.bigReadChars += n;
          if (DATA.test(p ?? "") && n > 8000) T.dataReadChars += n;
        }
        if (u.name === "Grep") {
          T.grepChars += n;
          for (const l of text.split("\n")) if (JUNK.test(l.split(":")[0]) || l.length > 300) T.grepJunkChars += l.length + 1;
        }
        if (u.name === "Bash" && TESTCMD.test(u.input.command ?? "")) {
          T.testCalls++;
          T.testChars += n;
        }
      }
    }
  }
  T.editCalls += edits;
  if (edits) T.editSessions++;
  if (first && last) T.wallMs += last - first;
}

for (const f of files) {
  T.sessions++;
  await scan(f);
}

const totalChars = [...T.toolChars.values()].reduce((a, b) => a + b, 0);
const pct = (x) => `${((100 * x) / totalChars).toFixed(1)}%`;
const row = (label, chars, note = "") => `| ${label} | ${tok(chars).toLocaleString("en-US")} | ${pct(chars)} | ${note} |`;
console.log(`# Opportunity sizing: ${T.sessions} sessions, ${tok(totalChars).toLocaleString("en-US")} tokens of tool output\n`);
console.log("## Tool output by tool (top 12)\n\n| tool | calls | tokens | share |\n|---|---:|---:|---:|");
for (const [name, chars] of [...T.toolChars].sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`| ${name} | ${T.toolCalls.get(name)} | ${tok(chars).toLocaleString("en-US")} | ${pct(chars)} |`);
console.log("\n## Addressable output per idea (upper bounds)\n\n| idea | tokens | share of all tool output | basis |\n|---|---:|---:|---|");
console.log(row("readcache: unchanged re-reads", T.rereadChars, `${T.rereads} of ${T.reads} Reads repeated an identical read of an unchanged file`));
console.log(row("outline / readsymbol: reads of 300+ line files", T.bigReadChars, "saving is a fraction of this"));
console.log(row("datapeek: reads of big data files", T.dataReadChars, ".json/.csv/.log etc over 8k chars"));
console.log(row("junk filter: grep lines from lock/min/dist or >300 chars", T.grepJunkChars, `of ${tok(T.grepChars).toLocaleString("en-US")} grep tokens`));
console.log(row("bash compaction: test/build/lint output", T.testChars, `${T.testCalls} commands`));
console.log(`\nEdits: ${T.editCalls} edit calls in ${T.editSessions} sessions (${(T.editCalls / Math.max(1, T.editSessions)).toFixed(1)} per editing session).`);
console.log(`Tool execution time: ${(T.toolMs / 3600_000).toFixed(1)}h of ${(T.wallMs / 3600_000).toFixed(1)}h session wall time (${((100 * T.toolMs) / Math.max(1, T.wallMs)).toFixed(1)}%), includes long-running commands.`);
