// Feature "repomap": a compact map of the repo (files + top-level symbols) injected at
// SessionStart, so Claude can skip most exploratory ls/grep/read turns.
// Cached per repo and git HEAD; rebuilt when HEAD or the working tree's file list changes.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const MAX_CHARS = 8000; // about 2k tokens
const MAX_FILE_BYTES = 200_000;
const MAX_DATA_FILES = 8; // a dir with more non-code files than this lists them as one count line
const SKIP = /(^|\/)(node_modules|dist|build|out|\.next|vendor|coverage|__snapshots__)\/|\.(min\.js|lock|map)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".rb", ".java", ".kt", ".swift", ".cs"]);

// One regex per language family; group 1 is the symbol name. Top-level declarations only.
const PATTERNS = {
  js: /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm,
  py: /^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/gm,
  go: /^(?:func(?:\s+\([^)]*\))?|type)\s+([A-Z]\w*)/gm,
  rs: /^pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|mod)\s+([A-Za-z_]\w*)/gm,
  rb: /^\s{0,2}(?:def|class|module)\s+([A-Za-z_][\w.]*)/gm,
  jvm: /^\s{0,4}(?:public\s+)?(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record|fun|func|struct|protocol)\s+([A-Za-z_]\w*)/gm,
};
const family = (ext) =>
  ({ ".py": "py", ".go": "go", ".rs": "rs", ".rb": "rb", ".java": "jvm", ".kt": "jvm", ".swift": "jvm", ".cs": "jvm" })[ext] ?? "js";

function symbols(file) {
  try {
    if (statSync(file).size > MAX_FILE_BYTES) return [];
    const src = readFileSync(file, "utf8");
    // name:line, so Claude can Read just that range
    return [...src.matchAll(PATTERNS[family(extname(file))])].map(
      (m) => `${m[1]}:${src.slice(0, m.index).split("\n").length}`
    );
  } catch {
    return [];
  }
}

function listFiles(root) {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.toString().split("\n").filter((f) => f && !SKIP.test(f));
}

// "40 .json, 2 .md": what a collapsed dir holds, most common extension first
function countExts(files) {
  const n = new Map();
  for (const f of files) n.set(extname(f) || "(none)", (n.get(extname(f) || "(none)") ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([e, c]) => `${c} ${e}`).join(", ");
}

function render(root, files) {
  const byDir = new Map();
  for (const f of files) {
    const d = dirname(f);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }
  // Pass 1: every code file with its symbols. Pass 2 (if too long): files only. Pass 3: dirs only.
  const passes = [
    (f) => {
      const name = f.slice(f.lastIndexOf("/") + 1);
      if (!CODE.has(extname(f))) return name;
      const syms = symbols(join(root, f));
      return syms.length ? `${name}: ${syms.join(", ")}` : name;
    },
    (f) => f.slice(f.lastIndexOf("/") + 1),
  ];
  for (const fmt of passes) {
    const lines = [];
    for (const [d, fs] of [...byDir].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${d === "." ? "(root)" : d}/`);
      const data = fs.filter((f) => !CODE.has(extname(f)));
      const listed = data.length > MAX_DATA_FILES ? fs.filter((f) => CODE.has(extname(f))) : fs;
      for (const f of listed.sort()) lines.push(`  ${fmt(f)}`);
      if (listed !== fs) lines.push(`  (${data.length} data files: ${countExts(data)})`);
    }
    const text = lines.join("\n");
    if (text.length <= MAX_CHARS) return text;
  }
  return [...byDir.keys()].sort().map((d) => `${d}/ (${byDir.get(d).length} files)`).join("\n").slice(0, MAX_CHARS);
}

export function repoMap(root) {
  let files;
  let head = "nogit";
  try {
    files = listFiles(root);
    head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null; // not a git repo: skip rather than walk an unknown tree
  }
  if (!files.length) return null;

  const key = createHash("sha1").update(`v2|${root}|${head}|${files.join("\n")}`).digest("hex").slice(0, 16);
  const cacheFile = join(homedir(), ".claude", "lean", "repomap", `${key}.txt`);
  try {
    return readFileSync(cacheFile, "utf8");
  } catch {}
  const text = render(root, files);
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, text);
  } catch {}
  return text;
}
