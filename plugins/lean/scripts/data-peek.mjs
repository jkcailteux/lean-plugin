// Feature "datapeek": summarize a big data file (JSON, JSONL, CSV/TSV, logs) instead of sending
// its raw text: shape, counts, value distributions, and the most common log lines.
import { readFileSync } from "node:fs";

export const DATA_EXT = /\.(json|jsonl|ndjson|csv|tsv|log)$/i;
export const PEEK_MIN_BYTES = 64 * 1024;
const MAX_DISTINCT = 12;
const MAX_CHARS = 3500;

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const top = (counts, n) =>
  [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k}=${c}`).join(", ");

function describeRecords(rows, label) {
  const out = [`${label}: ${rows.length} records`];
  const fields = new Map(); // key -> {types:Set, values:Map, n, min, max}
  for (const r of rows) {
    if (typeOf(r) !== "object") continue;
    for (const [k, v] of Object.entries(r)) {
      const f = fields.get(k) ?? { types: new Set(), values: new Map(), n: 0, min: Infinity, max: -Infinity, len: 0 };
      f.n++;
      f.types.add(typeOf(v));
      if (typeof v === "string" || typeof v === "boolean") {
        if (f.values.size <= MAX_DISTINCT) f.values.set(String(v), (f.values.get(String(v)) ?? 0) + 1);
      } else if (typeof v === "number") {
        f.min = Math.min(f.min, v);
        f.max = Math.max(f.max, v);
      } else if (Array.isArray(v)) f.len += v.length;
      fields.set(k, f);
    }
  }
  for (const [k, f] of fields) {
    let line = `  ${k} (${[...f.types].join("|")}, in ${f.n})`;
    if (f.values.size && f.values.size <= MAX_DISTINCT) line += `: ${top(f.values, MAX_DISTINCT)}`;
    else if (f.values.size) line += `: many distinct, e.g. ${[...f.values.keys()].slice(0, 3).join(", ")}`;
    if (f.min !== Infinity) line += `: min ${f.min}, max ${f.max}`;
    if (f.len) line += `: avg length ${(f.len / f.n).toFixed(1)}`;
    out.push(line);
  }
  if (rows.length) out.push(`  first record: ${JSON.stringify(rows[0]).slice(0, 300)}`);
  return out;
}

function peekJson(src, path) {
  let doc;
  if (/\.(jsonl|ndjson)$/i.test(path)) doc = src.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  else doc = JSON.parse(src);
  if (Array.isArray(doc)) return describeRecords(doc, "array");
  const out = [`object with keys: ${Object.keys(doc).slice(0, 40).join(", ")}`];
  for (const [k, v] of Object.entries(doc)) if (Array.isArray(v) && v.length > 20) out.push(...describeRecords(v, `.${k}`));
  return out;
}

function peekCsv(src, sep) {
  const lines = src.split("\n").filter(Boolean);
  const header = lines[0].split(sep).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split(sep).map((v, i) => [header[i] ?? `col${i}`, v.trim()])));
  return describeRecords(rows, `table with columns ${header.join(", ")}`);
}

function peekLog(src) {
  const lines = src.split("\n").filter(Boolean);
  const levels = new Map();
  const templates = new Map();
  const problems = new Map();
  for (const l of lines) {
    const lvl = l.match(/\b(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\b/)?.[1] ?? "other";
    levels.set(lvl, (levels.get(lvl) ?? 0) + 1);
    // Drop the timestamp and variable values so repeated lines group together; keep codes like E1042.
    const t = l
      .replace(/^\S*\d{4}-\d\d-\d\d[T ]?[\d:.,]*Z?\s*/, "")
      .replace(/=\S+/g, "=#")
      .replace(/\b\d+(\.\d+)?(ms|s|kb|mb)?\b/gi, "#");
    templates.set(t, (templates.get(t) ?? 0) + 1);
    if (/ERROR|FATAL|WARN/.test(lvl)) problems.set(t, (problems.get(t) ?? 0) + 1);
  }
  const fmt = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `  ${String(c).padStart(6)}x ${k.slice(0, 160)}`);
  return [
    `log: ${lines.length} lines; levels: ${top(levels, 8)}`,
    "most common lines:",
    ...fmt(templates, 8),
    ...(problems.size ? ["most common ERROR/WARN lines:", ...fmt(problems, 12)] : []),
  ];
}

export function peek(path) {
  try {
    const src = readFileSync(path, "utf8");
    let out;
    if (/\.(json|jsonl|ndjson)$/i.test(path)) out = peekJson(src, path);
    else if (/\.csv$/i.test(path)) out = peekCsv(src, ",");
    else if (/\.tsv$/i.test(path)) out = peekCsv(src, "\t");
    else out = peekLog(src);
    return out.join("\n").slice(0, MAX_CHARS);
  } catch {
    return null; // unparseable: let the normal Read happen
  }
}
