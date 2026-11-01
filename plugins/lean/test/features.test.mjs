// Mechanism tests for every lean feature. Hooks and the MCP server run as real subprocesses with
// the same JSON Claude Code sends them, against a freshly generated fixture repo.
//
//   node --test plugins/lean/test/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Child processes must not inherit the test runner's context, or the fixture's own
// `node --test` reports to this runner instead of exiting non-zero. Nor the caller's project dir:
// hooks prefer CLAUDE_PROJECT_DIR over the fixture cwd the tests pass in.
const ENV = { ...process.env };
delete ENV.NODE_TEST_CONTEXT;
delete ENV.CLAUDE_PROJECT_DIR;
const script = (p) => join(ROOT, p);
let fx; // fixture repo
let stateDir;

before(async () => {
  const { generate } = await import(join(ROOT, "../../bench/fixture.mjs"));
  fx = mkdtempSync(join(tmpdir(), "lean-fx-"));
  generate(fx);
  stateDir = mkdtempSync(join(tmpdir(), "lean-state-"));
});

let sid = 0;
function hook(file, input, features, extraEnv = {}) {
  const r = spawnSync("node", [script(file)], {
    input: JSON.stringify({ session_id: `s${sid}`, transcript_path: "/t", cwd: fx, ...input }),
    env: { ...ENV, LEAN_FEATURES: features, LEAN_STATE_DIR: stateDir, ...extraEnv },
    encoding: "utf8",
  });
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}
const pre = (tool, toolInput, features) => hook("scripts/pre-tool.mjs", { hook_event_name: "PreToolUse", tool_name: tool, tool_input: toolInput }, features);
const post = (tool, toolInput, features) => hook("scripts/post-tool.mjs", { hook_event_name: "PostToolUse", tool_name: tool, tool_input: toolInput, tool_response: "x" }, features);

function mcp(features, calls) {
  const lines = calls.map((c, i) => JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: c[0], params: c[1] ?? {} })).join("\n") + "\n";
  const r = spawnSync("node", [script("servers/tools-server.mjs")], {
    input: lines,
    cwd: fx,
    env: { ...ENV, LEAN_FEATURES: features, CLAUDE_PROJECT_DIR: fx, LEAN_SAVINGS_LOG: join(stateDir, "s.jsonl") },
    encoding: "utf8",
  });
  return r.stdout.trim().split("\n").map((l) => JSON.parse(l)).sort((a, b) => a.id - b.id);
}
const text = (res) => res.result.content[0].text;

// ---------- readcache ----------
test("readcache: denies an identical re-read of an unchanged file, then lets a repeat through", () => {
  sid++;
  const f = join(fx, "src/money.js");
  assert.equal(pre("Read", { file_path: f }, "readcache"), null, "first read allowed");
  post("Read", { file_path: f }, "readcache");
  const d = pre("Read", { file_path: f }, "readcache");
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /unchanged since you read it/);
  assert.equal(pre("Read", { file_path: f }, "readcache"), null, "safety valve: identical second attempt allowed");
});

test("readcache: sub-range of an earlier read is covered; a changed file is not", () => {
  sid++;
  const f = join(fx, "src/report.js");
  post("Read", { file_path: f }, "readcache");
  assert.equal(pre("Read", { file_path: f, offset: 2, limit: 3 }, "readcache").permissionDecision, "deny");
  const later = new Date(Date.now() + 5000);
  utimesSync(f, later, later);
  assert.equal(pre("Read", { file_path: f }, "readcache"), null, "file changed, so re-read allowed");
});

test("readcache: compaction forgets what was sent", () => {
  sid++;
  const f = join(fx, "src/orders.js");
  post("Read", { file_path: f }, "readcache");
  hook("scripts/post-tool.mjs", { hook_event_name: "PreCompact" }, "readcache");
  assert.equal(pre("Read", { file_path: f }, "readcache"), null);
});

test("readcache: off by default", () => {
  sid++;
  const f = join(fx, "src/money.js");
  post("Read", { file_path: f }, "");
  assert.equal(pre("Read", { file_path: f }, ""), null);
});

// ---------- bigread / ReadSymbol ----------
test("bigread: a full read of a 300+ line code file returns its outline instead", () => {
  sid++;
  const f = join(fx, "src/engine.js");
  const d = pre("Read", { file_path: f }, "bigread");
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /1967 lines/);
  assert.match(d.permissionDecisionReason, /1958-\d+\s+export function computeTotals/);
  assert.match(d.permissionDecisionReason, /function shippingFor/);
  assert.ok(d.permissionDecisionReason.length < readFileSync(f, "utf8").length / 3, "outline is much smaller than the file");
  assert.equal(pre("Read", { file_path: f }, "bigread"), null, "repeat goes through");
  assert.equal(pre("Read", { file_path: f, offset: 1950, limit: 20 }, "bigread"), null, "ranged reads untouched");
  assert.equal(pre("Read", { file_path: join(fx, "src/money.js") }, "bigread"), null, "small files untouched");
});

test("ReadSymbol: returns exactly one declaration with line numbers", () => {
  const [, res] = mcp("bigread", [["tools/list"], ["tools/call", { name: "ReadSymbol", arguments: { path: "src/engine.js", name: "computeTotals" } }]]);
  const t = text(res);
  assert.match(t, /^== src\/engine\.js:1958-1966/);
  assert.match(t, /1959\t  const subtotal/);
  assert.ok(!t.includes("rule001(order)"));
});

// ---------- datapeek ----------
test("datapeek: big JSON gets a summary with value counts", () => {
  sid++;
  const d = pre("Read", { file_path: join(fx, "data/orders.json") }, "datapeek");
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /array: 4000 records/);
  assert.match(d.permissionDecisionReason, /refunded=361/);
  assert.ok(d.permissionDecisionReason.length < 5000);
});

test("datapeek: big log gets level counts and top error lines with codes intact", () => {
  sid++;
  const d = pre("Read", { file_path: join(fx, "data/server.log") }, "datapeek");
  assert.match(d.permissionDecisionReason, /log: 30000 lines/);
  assert.match(d.permissionDecisionReason, /212x ERROR \[E2001\]/);
});

test("datapeek: small data files and ranged reads are untouched", () => {
  sid++;
  assert.equal(pre("Read", { file_path: join(fx, "package.json") }, "datapeek"), null);
  assert.equal(pre("Read", { file_path: join(fx, "data/orders.json"), offset: 1, limit: 50 }, "datapeek"), null);
});

// ---------- junkfilter ----------
test("junkfilter: adds an exclusion glob only when the caller set none", () => {
  const d = pre("Grep", { pattern: "formatCurrency" }, "junkfilter");
  assert.match(d.updatedInput.glob, /\*\*\/dist\/\*\*/);
  assert.equal(d.updatedInput.pattern, "formatCurrency");
  assert.equal(pre("Grep", { pattern: "x", glob: "*.ts" }, "junkfilter"), null);
  assert.equal(pre("Grep", { pattern: "x", path: "dist" }, "junkfilter"), null);
});

test("junkfilter: ripgrep honours the glob (dist/ hits disappear)", (t) => {
  const rg = spawnSync("rg", ["--version"]);
  if (rg.status !== 0) return t.skip("ripgrep not installed");
  const { updatedInput } = pre("Grep", { pattern: "formatCurrency" }, "junkfilter");
  // Explicit ".": with no path, rg reads stdin when stdin is a pipe.
  const plain = execFileSync("rg", ["-l", "formatCurrency", "."], { cwd: fx, encoding: "utf8" });
  const filtered = execFileSync("rg", ["-l", "--glob", updatedInput.glob, "formatCurrency", "."], { cwd: fx, encoding: "utf8" });
  assert.match(plain, /dist\/shopkit\.min\.js/);
  assert.doesNotMatch(filtered, /dist\//);
  assert.match(filtered, /src\/money\.js/);
});

// ---------- bashcompact ----------
test("bashcompact: rewrites test/build commands only", () => {
  assert.ok(pre("Bash", { command: "npm test" }, "bashcompact").updatedInput.command.includes("compact-run.mjs"));
  assert.ok(pre("Bash", { command: "cd app && CI=1 npx tsc --noEmit" }, "bashcompact"));
  assert.equal(pre("Bash", { command: "npm test | tail -5" }, "bashcompact"), null, "already filtered");
  assert.equal(pre("Bash", { command: "ls -la" }, "bashcompact"), null);
  assert.equal(pre("Bash", { command: "npm test" }, ""), null, "off by default");
});

test("bashcompact: rewritten command keeps the exit code and the failure, and is much shorter", () => {
  const raw = spawnSync("sh", ["-c", "npm test 2>&1"], { cwd: fx, encoding: "utf8", env: ENV });
  const { command } = pre("Bash", { command: "npm test" }, "bashcompact").updatedInput;
  const out = spawnSync("sh", ["-c", command], { cwd: fx, encoding: "utf8", env: ENV });
  assert.equal(raw.status, 1);
  assert.equal(out.status, 1, "exit code preserved");
  assert.match(out.stdout, /applyDiscount applies deep discounts exactly/);
  assert.match(out.stdout, /36 !== 40/);
  assert.ok(out.stdout.length < raw.stdout.length / 4, `${out.stdout.length} vs ${raw.stdout.length}`);
});

// ---------- BatchEdit ----------
test("BatchEdit: applies edits across files in one call; a failing file is left untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "lean-be-"));
  writeFileSync(join(dir, "a.js"), "const x = 1;\nconst y = 2;\n");
  writeFileSync(join(dir, "b.js"), "call();\ncall();\n");
  const r = spawnSync("node", [script("servers/tools-server.mjs")], {
    input:
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "BatchEdit",
          arguments: {
            edits: [
              { path: "a.js", old: "const x = 1;", new: "const x = 10;" },
              { path: "a.js", old: "const y = 2;", new: "const y = 20;" },
              { path: "b.js", old: "call();", new: "go();" },
            ],
          },
        },
      }) + "\n",
    env: { ...ENV, LEAN_FEATURES: "batchedit", CLAUDE_PROJECT_DIR: dir, LEAN_SAVINGS_LOG: join(stateDir, "s.jsonl") },
    encoding: "utf8",
  });
  const t = JSON.parse(r.stdout).result.content[0].text;
  assert.match(t, /^2 of 3 edits applied in 1 file/);
  assert.match(t, /matches 2 times/);
  assert.equal(readFileSync(join(dir, "a.js"), "utf8"), "const x = 10;\nconst y = 20;\n");
  assert.equal(readFileSync(join(dir, "b.js"), "utf8"), "call();\ncall();\n", "ambiguous edit wrote nothing");
});

// ---------- tool gating ----------
test("feature flags gate tools; slim hides the core tools", () => {
  const names = (f) => mcp(f, [["tools/list"]])[0].result.tools.map((t) => t.name).sort().join(",");
  assert.equal(names(""), "MultiRead,RunCompact,UsageStats");
  assert.equal(names("batchedit+bigread+outline"), "BatchEdit,MultiRead,Outline,ReadSymbol,RunCompact,UsageStats");
  assert.equal(names("slim"), "");
  assert.equal(mcp("", [["tools/call", { name: "BatchEdit", arguments: { edits: [] } }]])[0].error.code, -32602);
});

// ---------- contextguard ----------
function transcript(minutesAgo, ctx) {
  const f = join(mkdtempSync(join(tmpdir(), "lean-tr-")), "t.jsonl");
  const assistant = {
    type: "assistant",
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    message: { id: "m1", usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: ctx - 1002, output_tokens: 50 } },
  };
  writeFileSync(f, [JSON.stringify({ type: "user", message: { content: "hi" } }), JSON.stringify(assistant), JSON.stringify({ type: "attachment" })].join("\n") + "\n");
  return f;
}
function prompt(tp, features, text = "next step please") {
  sid++;
  const id = `g${sid}`;
  return () => {
    const r = spawnSync("node", [script("scripts/context-guard.mjs")], {
      input: JSON.stringify({ session_id: id, transcript_path: tp, hook_event_name: "UserPromptSubmit", prompt: text }),
      env: { ...ENV, LEAN_FEATURES: features, LEAN_STATE_DIR: stateDir, LEAN_SAVINGS_LOG: join(stateDir, "guard.jsonl") },
      encoding: "utf8",
    });
    return r.stdout.trim() ? JSON.parse(r.stdout) : null;
  };
}

test("contextguard: warns once, without holding the prompt, when resuming a big session after the cache expired", () => {
  const tp = transcript(120, 340_000);
  const send = prompt(tp, "contextguard");
  const first = send();
  assert.equal(first.decision, undefined, "the prompt is never blocked");
  assert.match(first.systemMessage, /~340k tokens .* idle 2\.0h.*\/compact after this reply/);
  assert.equal(send(), null, "once per idle gap");
  const logged = readFileSync(join(stateDir, "guard.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.transcript === tp);
  assert.deepEqual(logged.map((r) => [r.tool, r.ctx]), [["contextguard", 340_000]], "the warning is logged once for UsageStats");
});

test("contextguard: quiet for recent turns, small contexts, /compact, and when off", () => {
  assert.doesNotMatch(prompt(transcript(10, 340_000), "contextguard")()?.systemMessage ?? "", /idle/);
  assert.equal(prompt(transcript(120, 60_000), "contextguard")(), null);
  assert.equal(prompt(transcript(120, 340_000), "contextguard", "/compact")(), null);
  assert.equal(prompt(transcript(120, 340_000), "")(), null);
});

test("contextguard: one-time tip when context is large but warm", () => {
  const send = prompt(transcript(2, 300_000), "contextguard");
  assert.match(send().systemMessage, /~300k tokens .*autoCompactWindow/);
  assert.equal(send(), null, "shown once per session");
});

// ---------- repomap / session start ----------
test("repomap: map lists files with symbol:line and stays under budget", async () => {
  const { repoMap } = await import(script("scripts/repo-map.mjs"));
  const map = repoMap(fx);
  assert.match(map, /engine\.js: .*computeTotals:1958/);
  assert.match(map, /money\.js: roundCents:2, formatCurrency:6/);
  assert.doesNotMatch(map, /orders\.json:/, "data files listed without symbols");
  assert.ok(map.length <= 8000);
});

test("repomap: dirs full of data files collapse to a count line", async () => {
  const { repoMap } = await import(script("scripts/repo-map.mjs"));
  const dir = mkdtempSync(join(tmpdir(), "lean-map-"));
  mkdirSync(join(dir, "results"));
  for (let i = 0; i < 12; i++) writeFileSync(join(dir, "results", `run-${i}.json`), "{}");
  writeFileSync(join(dir, "results", "summary.md"), "#");
  writeFileSync(join(dir, "results", "load.mjs"), "export function load() {}\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: dir });
  const map = repoMap(dir);
  assert.match(map, /load\.mjs: load:1/);
  assert.match(map, /\(13 data files: 12 \.json, 1 \.md\)/);
  assert.doesNotMatch(map, /run-0\.json/);
});

test("session start: repomap and tips follow the flags; unstable adds a timestamp", () => {
  const ctx = (f) => hook("scripts/session-start.mjs", { hook_event_name: "SessionStart" }, f)?.additionalContext ?? "";
  assert.match(ctx("repomap"), /Repo map/);
  assert.doesNotMatch(ctx(""), /Repo map/);
  assert.match(ctx("batchedit"), /BatchEdit/);
  assert.equal(ctx("slim"), "");
  assert.match(ctx("unstable"), /Session started \d{4}-/);
});

test("session start: nothing is re-injected on resume", () => {
  const r = hook("scripts/session-start.mjs", { hook_event_name: "SessionStart", source: "resume" }, "repomap");
  assert.equal(r, null);
});

test("default hooks never run per tool call (no PreToolUse/PostToolUse overhead)", () => {
  const { hooks } = JSON.parse(readFileSync(script("hooks/hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(hooks).sort(), ["SessionStart", "UserPromptSubmit"]);
});

test("UsageStats: reads tool output per tool from this project's transcripts", () => {
  const home = mkdtempSync(join(tmpdir(), "lean-home-"));
  const proj = join(home, ".claude", "projects", fx.replace(/[^a-zA-Z0-9]/g, "-"));
  execFileSync("mkdir", ["-p", proj]);
  const now = new Date().toISOString();
  const lines = [
    { type: "assistant", timestamp: now, message: { content: [{ type: "tool_use", id: "a", name: "Read", input: {} }, { type: "tool_use", id: "b", name: "Grep", input: {} }] } },
    { type: "user", timestamp: now, message: { content: [{ type: "tool_result", tool_use_id: "a", content: "x".repeat(4000) }, { type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "y".repeat(400) }] }] } },
    { type: "user", timestamp: now, message: { content: [{ type: "tool_result", tool_use_id: "a", content: "duplicate log line" }] } },
  ];
  writeFileSync(join(proj, "s.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const r = spawnSync("node", [script("servers/tools-server.mjs")], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "UsageStats", arguments: {} } }) + "\n",
    env: { ...ENV, HOME: home, CLAUDE_PROJECT_DIR: fx, LEAN_SAVINGS_LOG: join(home, "s.jsonl") },
    encoding: "utf8",
  });
  const t = JSON.parse(r.stdout).result.content[0].text;
  assert.match(t, /1 session\(s\)/);
  assert.match(t, /\| Read \| 1 \| 4,000 \| 1,000 \| 90\.9% \|/);
  assert.match(t, /\| Grep \| 1 \| 400 \|/);
});

test("UsageStats: prices turns and credits lean tool calls and a guard-prompted /compact in $ and time", () => {
  const home = mkdtempSync(join(tmpdir(), "lean-home-"));
  const proj = join(home, ".claude", "projects", fx.replace(/[^a-zA-Z0-9]/g, "-"));
  execFileSync("mkdir", ["-p", proj]);
  const t0 = Date.now() - 3 * 3600_000;
  const at = (ms) => new Date(t0 + ms).toISOString();
  const model = "claude-opus-5-5"; // $4 in, $20 out, $0.20 cache read per MTok; 1h cache write 2x input
  const turn = (ms, id, usage, content = []) => ({ type: "assistant", timestamp: at(ms), message: { id, model, usage, content } });
  const w1h = (n) => ({ cache_creation_input_tokens: n, cache_creation: { ephemeral_1h_input_tokens: n } });
  // $0.10 + $0.028 + $0.0044 = $0.1324 over 3 turns; one tool round trip took 5s.
  writeFileSync(
    join(proj, "work.jsonl"),
    [
      turn(0, "m1", { input_tokens: 0, ...w1h(10_000), output_tokens: 1000 }, [{ type: "tool_use", id: "L", name: "mcp__plugin_lean_tools__MultiRead", input: {} }]),
      turn(0, "m1", { input_tokens: 0, ...w1h(10_000), output_tokens: 1000 }), // same message again: counted once
      { type: "user", timestamp: at(1000), message: { content: [{ type: "tool_result", tool_use_id: "L", content: "x".repeat(400) }] } },
      turn(6000, "m2", { input_tokens: 0, ...w1h(2000), cache_read_input_tokens: 10_000, output_tokens: 500 }),
      turn(20_000, "m3", { input_tokens: 0, cache_read_input_tokens: 12_000, output_tokens: 100 }),
    ].map((l) => JSON.stringify(l)).join("\n") + "\n"
  );
  // 300k-token session resumed after 2h; the guard warned, the resumed turn re-wrote 300k, the user
  // compacted to 30k, then 21 more turns.
  const guarded = join(proj, "guarded.jsonl");
  const H2 = 2 * 3600_000;
  writeFileSync(
    guarded,
    [
      turn(0, "g1", { input_tokens: 0, cache_read_input_tokens: 300_000, output_tokens: 0 }),
      turn(H2 + 5000, "g2", { input_tokens: 0, ...w1h(300_000), output_tokens: 0 }),
      { type: "system", subtype: "compact_boundary", timestamp: at(H2 + 60_000) },
      turn(H2 + 70_000, "g3", { input_tokens: 0, ...w1h(30_000), output_tokens: 0 }),
      ...Array.from({ length: 20 }, (_, i) => turn(H2 + 80_000 + i * 1000, `r${i}`, { input_tokens: 0, cache_read_input_tokens: 30_000, output_tokens: 0 })),
    ].map((l) => JSON.stringify(l)).join("\n") + "\n"
  );
  const log = join(home, "s.jsonl");
  writeFileSync(
    log,
    [
      { t: t0 + 1000, tool: "MultiRead", sent: 400, baseline: 4400, callsSaved: 2, id: "L" },
      { t: t0 + 1000, tool: "RunCompact", sent: 10, baseline: 100_000, callsSaved: 0 }, // another project's call
      { t: t0 + H2, tool: "contextguard", ctx: 300_000, transcript: guarded },
    ].map((l) => JSON.stringify(l)).join("\n") + "\n"
  );
  const r = spawnSync("node", [script("servers/tools-server.mjs")], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "UsageStats", arguments: {} } }) + "\n",
    env: { ...ENV, HOME: home, CLAUDE_PROJECT_DIR: fx, LEAN_SAVINGS_LOG: log },
    encoding: "utf8",
  });
  const t = JSON.parse(r.stdout).result.content[0].text;
  assert.match(t, /2 session\(s\)/);
  // $0.1324 + the guarded session's $0.06 + $2.40 (resumed turn) + $0.24 + 20 x $0.006
  assert.match(t, /Spent ≈ \$2\.95 at API list prices over 26 turns · median turn 5s/);
  // 1,000 tokens kept out: written once at 2x input, re-read once = $0.0082; 2 round trips at $0.0441 each = $0.0883.
  assert.match(t, /\| lean:MultiRead \| 1 \| 1,000 \| 2 \| \$0\.10 \| 10s \|/);
  // The resumed turn is paid either way. Without: 21 later turns re-read 300k = $1.26. With: compaction
  // reads 300k from cache ($0.06) + 10k summary output ($0.20) + 30k re-written ($0.24) + 20 re-reads
  // of 30k ($0.12) = $0.62. Saved $0.64.
  assert.match(t, /\| context guard \| 1 warned, 1 compacted \| – \| – \| \$0\.64 \| – \|/);
  assert.doesNotMatch(t, /RunCompact/, "savings from other projects are not counted here");
  assert.match(t, /Total: ≈ \$0\.74 \(20% of what these sessions would have cost\), ≈ 10s of model time/);
});

test("features.json: accepted features are on by default", () => {
  const { enabled } = JSON.parse(readFileSync(script("features.json"), "utf8"));
  assert.ok(Array.isArray(enabled));
  const r = spawnSync("node", ["-e", `import(${JSON.stringify(script("scripts/features.mjs"))}).then(m => console.log([...m.FEATURES].join(",")))`], {
    env: (({ LEAN_FEATURES, ...rest }) => rest)(ENV),
    encoding: "utf8",
  });
  assert.equal(r.stdout.trim(), enabled.join(","));
});
