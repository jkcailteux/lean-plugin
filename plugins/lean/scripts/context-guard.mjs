// Feature "contextguard" (UserPromptSubmit): the biggest cost in long sessions is context size.
//
//   Idle resume: you come back to a big session after the 1-hour prompt cache expired. This turn
//   re-writes the whole context at cache-write price and every later turn carries it again.
//   Warn once per idle gap and suggest /compact after this reply. The prompt is never held.
//
//   Large context: the first time context passes LARGE tokens, show a one-line tip.
//
// Reads only the tail of the transcript, so it stays fast on long sessions.
import { openSync, readSync, fstatSync, closeSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { has } from "./features.mjs";
import { stateFor } from "./state.mjs";
import { SAVINGS_LOG } from "./paths.mjs";

const IDLE_MS = Number(process.env.LEAN_GUARD_IDLE_MIN ?? 58) * 60_000; // 1h cache TTL, with margin
const MIN_CTX = Number(process.env.LEAN_GUARD_MIN_CTX ?? 150_000);
const LARGE = Number(process.env.LEAN_GUARD_LARGE_CTX ?? 250_000);
const TAIL_BYTES = 4 * 1024 * 1024;

export function lastTurn(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"assistant"')) continue;
      try {
        const e = JSON.parse(lines[i]);
        if (e.type !== "assistant" || e.isSidechain || !e.message?.usage) continue;
        const u = e.message.usage;
        return {
          t: Date.parse(e.timestamp),
          ctx: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        };
      } catch {}
    }
  } catch {
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return null;
}

export function guard(input, now = Date.now()) {
  if (!has("contextguard") || !input.transcript_path) return null;
  if (/^\s*\/(compact|clear)\b/.test(input.prompt ?? "")) return null;
  const last = lastTurn(input.transcript_path);
  if (!last?.t) return null;
  const k = Math.round(last.ctx / 1000);
  const st = stateFor(input);

  if (now - last.t >= IDLE_MS && last.ctx >= MIN_CTX) {
    if (st.data.guardedAt === last.t) return null; // already warned for this gap
    st.data.guardedAt = last.t;
    st.save();
    // UsageStats credits the warning if a /compact follows it in this transcript.
    try {
      mkdirSync(dirname(SAVINGS_LOG), { recursive: true });
      appendFileSync(SAVINGS_LOG, JSON.stringify({ t: now, tool: "contextguard", ctx: last.ctx, transcript: input.transcript_path }) + "\n");
    } catch {}
    const hours = ((now - last.t) / 3_600_000).toFixed(1);
    return {
      systemMessage: `lean: this session holds ~${k}k tokens of context and was idle ${hours}h, so the prompt cache expired and this turn re-writes all of it at cache-write price. Run /compact after this reply so later turns carry a summary instead of all ~${k}k tokens.`,
    };
  }
  if (last.ctx >= LARGE && !st.data.largeTipShown) {
    st.data.largeTipShown = true;
    st.save();
    return {
      systemMessage: `lean: context is ~${k}k tokens and every turn re-reads all of it. /compact now, or set "autoCompactWindow" (e.g. 200000) in ~/.claude/settings.json to compact automatically sooner.`,
    };
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const out = guard(JSON.parse(readFileSync(0, "utf8")));
    if (out) console.log(JSON.stringify(out));
  } catch {}
}
