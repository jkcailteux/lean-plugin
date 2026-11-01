// /lean:stats runs this through the skill's `!` injection, so the report is already in the prompt
// and the model answers in one reply instead of calling the UsageStats tool first.
// Usage: node stats.mjs [hours]
import { usageStats } from "../servers/usage.mjs";
import { SAVINGS_LOG } from "./paths.mjs";

const hours = Number(process.argv[2]);
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
console.log(usageStats(root, SAVINGS_LOG, { sinceHours: hours > 0 ? hours : 24, maxTools: 6 }));
