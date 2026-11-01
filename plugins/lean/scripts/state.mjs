// Per-conversation hook state (one small JSON file per session + agent), so hooks can remember
// what was already sent to this context window.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const DIR = process.env.LEAN_STATE_DIR || join(homedir(), ".claude", "lean", "state");

export function stateFor(input) {
  const scope = createHash("sha1")
    .update(`${input.session_id}|${input.agent_id ?? ""}|${input.transcript_path ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  const file = join(DIR, `${scope}.json`);
  const data = { files: {}, denied: {} };
  try {
    Object.assign(data, JSON.parse(readFileSync(file, "utf8")));
  } catch {}
  return {
    data,
    save() {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(data));
    },
    clear() {
      rmSync(file, { force: true });
    },
  };
}
