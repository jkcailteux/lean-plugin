// Regression tests from a large Gradle/Kotlin repo in Cursor, written to hold for any stack: stack frames
// from test frameworks, gradlew/mvnw commands, Java/Kotlin/Swift/C# symbols in the repo map, the
// oversized-repo map, and the missing project folder.
//
//   node --test plugins/lean/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV = { ...process.env };
delete ENV.NODE_TEST_CONTEXT;
delete ENV.CLAUDE_PROJECT_DIR;
delete ENV.CURSOR_PROJECT_DIR;
const script = (p) => join(ROOT, p);
const { compact, compactCommand } = await import(script("scripts/compact.mjs"));
const { repoMap } = await import(script("scripts/repo-map.mjs"));

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "lean-repo-"));
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: dir });
  return dir;
}

// Runs the tool server in "/" with no project dir, as the Cursor app does, and returns each call's text.
function server(calls, extraEnv) {
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    ...calls.map(([name, args], i) => ({ jsonrpc: "2.0", id: i + 2, method: "tools/call", params: { name, arguments: args } })),
  ];
  const state = mkdtempSync(join(tmpdir(), "lean-state-"));
  const r = spawnSync("node", [script("servers/tools-server.mjs")], {
    input: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    cwd: "/",
    env: { ...ENV, CLAUDE_PROJECT_DIR: "", LEAN_HOST: "cursor", LEAN_SAVINGS_LOG: join(state, "s.jsonl"), ...extraEnv },
    encoding: "utf8",
  });
  const out = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
  return calls.map((_, i) => out.find((m) => m.id === i + 2).result);
}

// ---------- compaction ----------
test("compact: a JUnit failure keeps the first frame in a repo file after the framework frames", () => {
  const dir = repo({ "src/test/kotlin/com/example/FooTest.kt": "class FooTest\n", "src/main/kotlin/Other.kt": "\n" });
  const log = [
    "GooglePlayLocationUtilsTest > registersThatNewGeofence FAILED",
    "    junit.framework.AssertionFailedError: expected:<2> but was:<1>",
    "        at junit.framework.Assert.fail(Assert.java:57)",
    "        at junit.framework.Assert.failNotEquals(Assert.java:329)",
    "        at junit.framework.Assert.assertEquals(Assert.java:78)",
    "        at com.example.FooTest.registersThatNewGeofence(FooTest.kt:118)",
    "        at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)",
    "        at org.junit.runners.model.FrameworkMethod.invokeExplosively(FrameworkMethod.java:59)",
    "        at com.example.Other.helper(Other.kt:9)",
    "1 test completed, 1 failed",
  ].join("\n");
  const { text } = compact(log, 1, null, { cwd: dir });
  assert.match(text, /FooTest\.kt:118/);
  assert.match(text, /… more stack frames/);
  assert.doesNotMatch(text, /NativeMethodAccessorImpl|Other\.kt/, "only the first project frame is added");
  assert.doesNotMatch(compact(log, 1, null, { cwd: repo({}) }).text, /FooTest/, "not a repo file: plain 3 frames");
});

test("compact: the same works for a JS stack that opens in node_modules", () => {
  const dir = repo({ "src/cart.test.js": "\n" });
  const lib = [1, 2, 3, 4].map((n) => `    at fn${n} (${dir}/node_modules/expect/build/index.js:${n}:1)`);
  const log = ["Error: expected 2", ...lib, `    at Object.<anonymous> (${dir}/src/cart.test.js:12:5)`, "done"].join("\n");
  const { text } = compact(log, 1, null, { cwd: dir });
  assert.match(text, /cart\.test\.js:12:5/);
  assert.doesNotMatch(text, /index\.js:4:1/);
});

test("compact: a plain JS stack still keeps exactly 3 frames", () => {
  const frames = [1, 2, 3, 4, 5, 6].map((n) => `    at fn${n} (/app/src/f${n}.js:${n}:1)`);
  const { text } = compact(["Error: boom", ...frames, "done"].join("\n"), 1, null);
  assert.equal(text.split("\n").filter((l) => /^\s+at /.test(l)).length, 3);
  assert.match(text, /… more stack frames/);
});

test("bashcompact: ./gradlew, gradlew.bat and ./mvnw are compacted; gradlewhatever isn't", () => {
  for (const c of ["./gradlew test", "gradlew.bat assembleDebug", "./mvnw verify", "cd app && ./gradlew :core:testDebugUnitTest"])
    assert.ok(compactCommand(c, "r"), c);
  assert.equal(compactCommand("gradlewhatever build", "r"), null);
});

// ---------- repo map ----------
test("repo map: Java/Kotlin/Swift/C# declarations, without methods or extension receivers", () => {
  const dir = repo({
    "app/src/main/java/com/ex/Cards.kt": [
      "package com.ex",
      "",
      "@Serializable",
      "data class Card(val id: String)",
      "sealed class Result<out T>",
      "internal object Registry {",
      "    fun register(card: Card) {}",
      "}",
      "private fun helper() = 1",
      "typealias CardId = String",
      "fun String.toCardId(): CardId = this",
      "inline fun <reified T> List<T>.second(): T = this[1]",
      "suspend fun load() {}",
    ].join("\n"),
    "app/src/main/java/com/ex/Legacy.java": [
      "package com.ex;",
      "",
      "public final class Legacy {",
      "    public void member() {}",
      "}",
      "@Retention(RetentionPolicy.RUNTIME)",
      "public @interface Marker {}",
    ].join("\n"),
    "Sources/App/Store.swift": [
      "import Foundation",
      "@MainActor public final class Store {",
      "    func refresh() {}",
      "}",
      "struct Item {}",
      "public func makeStore() -> Store { Store() }",
    ].join("\n"),
    "src/Billing/Invoice.cs": [
      "namespace Billing",
      "{",
      "    public sealed partial class Invoice",
      "    {",
      "        public void Pay() {}",
      "    }",
      "    internal readonly record struct Line(int Qty);",
      "}",
    ].join("\n"),
  });
  const map = repoMap(dir);
  const want = ["Card:4", "Result:5", "Registry:6", "helper:9", "CardId:10", "toCardId:11", "second:12", "load:13", "Legacy:3", "Marker:7"];
  for (const s of [...want, "Store:2", "Item:5", "makeStore:6", "Invoice:3", "Line:7"]) assert.match(map, new RegExp(`\\b${s}\\b`), s);
  assert.doesNotMatch(map, /register:|member:|String:|refresh:|Pay:/);
});

test("repo map: an oversized repo lists source dirs first and ends on a complete line", () => {
  const files = { ".buildkite/pipeline.yml": "steps: []\n", ".github/workflows/ci.yml": "on: push\n" };
  for (let m = 0; m < 12; m++)
    for (let p = 0; p < 12; p++) {
      const base = `module-${m}/src/main/java/com/example/feature${p}`;
      for (let f = 0; f < 6; f++) files[`${base}/SomeRatherLongClassNameNumber${f}ForPadding.kt`] = `class C${f}\n`;
      files[`module-${m}/src/test/java/com/example/feature${p}/SomeTest.kt`] = "class T\n";
    }
  const map = repoMap(repo(files));
  const lines = map.split("\n");
  assert.ok(map.length <= 8000, `map is ${map.length} chars`);
  assert.match(lines[0], /directories only, source first/);
  assert.match(lines[1], /\/src\/main\/java\/.+\/ \(6 files\)$/, "source dirs come first");
  assert.doesNotMatch(map, /\.github|\.buildkite|src\/test/, "test and non-code dirs fall past the cut");
  assert.match(lines.at(-1), /^… \d+ more directories not shown$/);
  for (const l of lines.slice(1, -1)) assert.match(l, /\/ \(\d+ files\)$/, `complete line: ${l}`);
});

// ---------- project folder ----------
test("tool server: no project folder gives a clear error instead of ENOENT", () => {
  const [read, run] = server(
    [
      ["MultiRead", { files: [{ path: "settings.gradle.kts" }] }],
      ["RunCompact", { command: "./gradlew test" }],
    ],
    { LEAN_CURSOR_ROOTS: join(tmpdir(), "lean-no-such-roots.json") }
  );
  assert.match(read.content[0].text, /lean: no project folder found \(working in \/\)\. Use absolute paths, or pass cwd to RunCompact\./);
  assert.equal(run.isError, true);
  assert.match(run.content[0].text, /no project folder found/);
});

test("tool server: falls back to the workspace the Cursor hook recorded", () => {
  const ws = repo({ "hello.txt": "hi from the workspace\n" });
  const roots = join(mkdtempSync(join(tmpdir(), "lean-roots-")), "cursor-roots.json");
  spawnSync("node", [script("scripts/cursor-repo-map.mjs")], {
    input: JSON.stringify({ hook_event_name: "workspaceOpen", workspace_roots: [ws] }),
    env: { ...ENV, LEAN_FEATURES: "", LEAN_CURSOR_ROOTS: roots },
    encoding: "utf8",
  });
  const [read, run, sub] = server(
    [
      ["MultiRead", { files: [{ path: "hello.txt" }] }],
      ["RunCompact", { command: "cat hello.txt" }],
      ["RunCompact", { command: "pwd", cwd: ws }],
    ],
    { LEAN_CURSOR_ROOTS: roots }
  );
  assert.match(read.content[0].text, /hi from the workspace/);
  assert.match(run.content[0].text, /^exit 0[\s\S]*hi from the workspace/);
  assert.match(sub.content[0].text, /^exit 0/);
});
