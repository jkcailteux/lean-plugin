// Shrink command output to what matters: exit status, error-looking lines with context, and the
// tail. Used by the RunCompact tool and by the "bashcompact" hook (via compact-run.mjs).
import { execFileSync } from "node:child_process";

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]/g;
const SIGNAL = /\b(error\w*|fail\w*|exception|panic\w*|assert\w*|traceback|not ok)\b|[✗✖✘]/i;
const FRAME = /^\s+at\s|^\s+File ".*", line \d+/; // JS / Python / JVM stack frames
// The file a frame points at: "(FooTest.kt:118)", "(/app/src/a.js:3:1)", "at /app/a.js:3:1", 'File "a.py"'.
const FRAME_FILE = /\(([^()\s]+?):\d+(?::\d+)?\)\s*$|^\s+at\s+(\S+?):\d+(?::\d+)?\s*$|File "([^"]+)"/;
const DEPS = /(^|\/)(node_modules|site-packages|dist-packages|vendor)\//;
export const BASH_OUTPUT_CAP = 30_000; // built-in Bash truncates output at about this many chars

// File names in the repo at cwd, so a project frame can be told from a library one. Empty outside git.
function repoFileNames(cwd) {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Set(out.toString().split("\n").map((f) => f.slice(f.lastIndexOf("/") + 1)));
  } catch {
    return new Set();
  }
}

export function compact(out, code, signal, { context = 2, tail = 15, cwd = process.cwd() } = {}) {
  let lines = out
    .replace(ANSI, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => {
      l = l.replace(/\r$/, "");
      return l.slice(l.lastIndexOf("\r") + 1); // progress bars: keep only the final redraw
    });
  // Long runs of stack frames: keep the first 3, plus the first frame in one of the repo's own files if
  // none of those 3 is (a JUnit failure opens with several framework frames before the test's file:line).
  let names;
  const own = (l) => {
    const m = FRAME_FILE.exec(l);
    const f = m && (m[1] ?? m[2] ?? m[3]);
    if (!f || DEPS.test(f)) return false;
    names ??= repoFileNames(cwd); // only once a trace runs past 3 frames
    return names.has(f.slice(f.lastIndexOf("/") + 1));
  };
  const trimmed = [];
  let first = [];
  let frames = 0;
  let libOnly = false;
  let marked = false;
  for (const l of lines) {
    if (!FRAME.test(l)) {
      frames = 0;
      trimmed.push(l);
      continue;
    }
    if (++frames === 1) [first, marked] = [[], false];
    if (frames <= 3) {
      first.push(l);
      trimmed.push(l);
      continue;
    }
    if (frames === 4) libOnly = !first.some(own);
    if (libOnly && own(l)) {
      trimmed.push(l);
      libOnly = false;
    } else if (!marked) {
      trimmed.push("    … more stack frames");
      marked = true;
    }
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
  /^(?:npm (?:run )?(?:test|build|lint|typecheck|check)|npx (?:tsc|jest|vitest|eslint|playwright)|pnpm (?:run )?(?:test|build|lint)|yarn (?:run )?(?:test|build|lint)|bun (?:run )?test|(?:python3? -m )?pytest|go (?:test|build|vet)|cargo (?:test|build|check|clippy)|node --test|jest|vitest|tsc|make(?: test| check)?|mvn|gradle|(?:\.\/)?gradlew(?:\.bat)?|(?:\.\/)?mvnw(?:\.cmd)?)\b/;

// Returns the rewritten command, or null to leave it alone.
export function compactCommand(command, runner) {
  if (!command || command.includes("compact-run.mjs")) return null;
  if (/[|>]|<<|\bhead\b|\btail\b/.test(command)) return null; // already filtered by the caller
  const last = command.split(/&&|;/).pop().trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/, "");
  if (!NOISY.test(last)) return null;
  return `node "${runner}" ${Buffer.from(command).toString("base64")}`;
}
