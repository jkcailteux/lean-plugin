import { homedir } from "node:os";
import { join } from "node:path";

// One JSONL line per lean tool call (chars sent vs. what the built-in tool would have sent) and per
// context-guard block.
// LEAN_SAVINGS_LOG overrides the location (handy for tests and benchmarks).
export const SAVINGS_LOG =
  process.env.LEAN_SAVINGS_LOG || join(homedir(), ".claude", "lean", "savings.jsonl");
