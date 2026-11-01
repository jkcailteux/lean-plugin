// Shrink command output to what matters: exit status, error-looking lines with context, and the
// tail. Used by the RunCompact tool and by the "bashcompact" hook (via compact-run.mjs).
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
const SIGNAL = /\b(error\w*|fail\w*|exception|panic\w*|assert\w*|traceback|not ok)\b|[✗✖✘]/i;
const FRAME = /^\s+at\s|^\s+File ".*", line \d+/; // JS / Python stack frames
export const BASH_OUTPUT_CAP = 30_000; // built-in Bash truncates output at about this many chars

export function compact(out, code, signal, { context = 2, tail = 15 } = {}) {
  let lines = out
    .replace(ANSI, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => {
      l = l.replace(/\r$/, "");
      return l.slice(l.lastIndexOf("\r") + 1); // progress bars: keep only the final redraw
    });
  // Long runs of stack frames: keep the first 3.
  const trimmed = [];
  let frames = 0;
  for (const l of lines) {
    if (FRAME.test(l)) {
      if (++frames === 4) trimmed.push("    … more stack frames");
      if (frames > 3) continue;
    } else frames = 0;
    trimmed.push(l);
  }
  lines = trimmed;

  const keep = new Set();
  if (code !== 0 || signal) {
    lines.forEach((l, i) => {
      if (SIGNAL.test(l)) for (let j = i - context; j <= i + context; j++) keep.add(j);
    });
  }
  const tailN = code === 0 && !signal ? Math.min(tail, 8) : tail; // a pass only needs its summary
  for (let j = lines.length - tailN; j < lines.length; j++) keep.add(j);

  const picked = [];
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!keep.has(i)) continue;
    if (i > last + 1) picked.push(`… (${i - last - 1} lines skipped)`);
    picked.push(lines[i]);
    last = i;
  }
  const status = signal ? `killed (${signal})` : `exit ${code}`;
  const text = `${status} · ${lines.length} lines → ${picked.length} shown\n${picked.join("\n")}`;
  return { text, baseline: Math.min(out.length, BASH_OUTPUT_CAP) };
}

// Commands whose output is long and mostly noise when they pass.
const NOISY =
  /^(?:npm (?:run )?(?:test|build|lint|typecheck|check)|npx (?:tsc|jest|vitest|eslint|playwright)|pnpm (?:run )?(?:test|build|lint)|yarn (?:run )?(?:test|build|lint)|bun (?:run )?test|(?:python3? -m )?pytest|go (?:test|build|vet)|cargo (?:test|build|check|clippy)|node --test|jest|vitest|tsc|make(?: test| check)?|mvn|gradle)\b/;

// Returns the rewritten command, or null to leave it alone.
export function compactCommand(command, runner) {
  if (!command || command.includes("compact-run.mjs")) return null;
  if (/[|>]|<<|\bhead\b|\btail\b/.test(command)) return null; // already filtered by the caller
  const last = command.split(/&&|;/).pop().trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/, "");
  if (!NOISY.test(last)) return null;
  return `node "${runner}" ${Buffer.from(command).toString("base64")}`;
}
