// Feature "readcache": remember which line ranges of which file (at which mtime/size) were sent
// to this conversation, so an identical re-read of an unchanged file can be skipped.
import { statSync } from "node:fs";

export const DEFAULT_LIMIT = 2000; // built-in Read's default line window

export function readRange(toolInput) {
  const start = toolInput.offset ?? 1;
  return [start, start + (toolInput.limit ?? DEFAULT_LIMIT) - 1];
}

export function versionOf(path) {
  try {
    const st = statSync(path);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return null;
  }
}

export function isCachedRead(state, path, [start, end]) {
  const f = state.files[path];
  const v = versionOf(path);
  return Boolean(f && v && f.version === v && f.ranges.some(([s, e]) => s <= start && e >= end));
}

export function recordRead(state, path, [start, end]) {
  const v = versionOf(path);
  if (!v) return;
  const f = state.files[path];
  const ranges = f && f.version === v ? f.ranges : [];
  state.files[path] = { version: v, ranges: [...ranges, [start, end]] };
}
