// SessionStart hook: inject the project's .claude/lean-notes.md (if any) into context.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { has } from "./features.mjs";
import { repoMap } from "./repo-map.mjs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {}

// A resumed session already has everything injected at its original start.
if (input.source === "resume") process.exit(0);

const dir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
let notes = "";
try {
  notes = readFileSync(join(dir, ".claude", "lean-notes.md"), "utf8").trim();
} catch {}

const parts = [];
if (!has("slim")) parts.push("lean plugin: prefer MultiRead to read several files in one call, and RunCompact for tests/builds with long output.");
if (has("outline")) parts.push("Use Outline before reading a large file, then read only the line range you need.");
if (has("batchedit")) parts.push("When a change needs more than one edit, make all of them in a single BatchEdit call (no Read needed; copy the old text from Grep output).");
if (has("writer")) parts.push("For a new file that is mostly predictable from existing ones (tests, fixtures, stubs, config), delegate to the lean:writer agent: give it the spec, the reference and source file paths and the target path, and do not read those files yourself first. Its reply is one line; spot-check the file with Grep and fix anything with small edits.");
if (has("unstable")) parts.push(`Session started ${new Date().toISOString()}.`); // prompt-cache experiment
if (notes) parts.push(`Project notes (.claude/lean-notes.md):\n${notes}`);
if (has("repomap")) {
  const map = repoMap(dir);
  if (map)
    parts.push(
      `Repo map: files and top-level symbols as name:line. Use it to go straight to the right file and line range instead of exploring with ls, find or broad greps.\n${map}`
    );
}

if (parts.length)
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: parts.join("\n\n") },
    })
  );
