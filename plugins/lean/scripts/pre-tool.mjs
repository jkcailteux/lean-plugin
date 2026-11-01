// PreToolUse dispatcher for every hook-based feature, so each tool call costs one node start.
//   Read  -> readcache (skip unchanged re-reads), datapeek (summarize big data files),
//            bigread (outline instead of 300+ line code files)
//   Grep  -> junkfilter (exclude lockfiles, minified and build output)
//   Bash  -> bashcompact (route noisy test/build commands through compact-run.mjs)
// Never grants permission: rewrites go through Claude Code's normal permission checks.
import { readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { has } from "./features.mjs";
import { stateFor } from "./state.mjs";
import { readRange, isCachedRead } from "./read-cache.mjs";
import { DATA_EXT, PEEK_MIN_BYTES, peek } from "./data-peek.mjs";
import { compactCommand } from "./compact.mjs";
import { outline } from "../servers/outline.mjs";

export const BIG_LINES = 300;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|cs)$/i;
export const JUNK_GLOB =
  "!{**/*.min.js,**/*.min.css,**/*.map,**/dist/**,**/build/**,**/.next/**,**/package-lock.json,**/pnpm-lock.yaml,**/yarn.lock,**/Cargo.lock}";
const RUNNER = fileURLToPath(new URL("./compact-run.mjs", import.meta.url));

export function decide(input) {
  const ti = input.tool_input ?? {};

  if (input.tool_name === "Read" && (has("readcache") || has("datapeek") || has("bigread"))) {
    const path = ti.file_path;
    if (!path) return null;
    const range = readRange(ti);
    const st = stateFor(input);
    let reason = null;
    if (has("readcache") && isCachedRead(st.data, path, range)) {
      reason = `lean: ${path} (lines ${range[0]}-${range[1]}) is unchanged since you read it earlier in this conversation. Use that earlier content.`;
    } else if (ti.offset === undefined && ti.limit === undefined) {
      let size;
      try {
        size = statSync(path).size;
      } catch {
        return null; // let Read report the error
      }
      if (has("datapeek") && DATA_EXT.test(path) && size >= PEEK_MIN_BYTES) {
        const summary = peek(path);
        if (summary)
          reason = `lean: ${path} is a ${Math.round(size / 1024)} KB data file, so here is a summary instead of its raw text. For specifics, query it with Grep or a script, or Read a slice with offset/limit.\n${summary}`;
      } else if (has("bigread") && CODE_EXT.test(path) && size < 2_000_000) {
        const n = readFileSync(path, "utf8").split("\n").length;
        if (n >= BIG_LINES)
          reason = `lean: ${path} has ${n} lines, so here is its outline instead. Read just the range you need with offset/limit (or ReadSymbol by name).\n${outline(path, relative(input.cwd ?? process.cwd(), path))}`;
      }
    }
    if (!reason) return null;
    const key = `${path}:${range[0]}-${range[1]}`;
    if (st.data.denied[key]) {
      delete st.data.denied[key]; // safety valve: an identical second attempt goes through
      st.save();
      return null;
    }
    st.data.denied[key] = true;
    st.save();
    return {
      permissionDecision: "deny",
      permissionDecisionReason: `${reason}\n(If you really need the full text, repeat this exact Read and it will go through.)`,
    };
  }

  if (input.tool_name === "Grep" && has("junkfilter") && !ti.glob && !ti.type && !/dist|build|\.min\.|lock/.test(ti.path ?? "")) {
    return { updatedInput: { ...ti, glob: JUNK_GLOB } };
  }

  if (input.tool_name === "Bash" && has("bashcompact")) {
    const command = compactCommand(ti.command, RUNNER);
    if (command) return { updatedInput: { ...ti, command } };
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const out = decide(JSON.parse(readFileSync(0, "utf8")));
    if (out) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...out } }));
  } catch {}
}
