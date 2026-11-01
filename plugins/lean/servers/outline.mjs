// File skeletons: declarations (functions, classes, methods, types, top-level consts) with line
// ranges and signatures. Regex-based; covers TS/JS, Python, Go, Rust, Java/Kotlin/Swift/C# well
// enough. A declaration ends where the next one at the same or shallower indent begins.
import { readFileSync } from "node:fs";

const DECL =
  /^(\s*)(?:export\s+)?(?:default\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:(?:public|private|protected|internal|static|final|abstract|override|readonly|async|declare)\s+)*(function\*?|class|interface|type|enum|const|let|var|def|fn|func|struct|trait|impl|mod|record|fun|protocol|extension)\b\s*([^\s(<:={]*)/;
// Methods inside classes: `  name(args) {` / `  async name(` / `  get name(`
const METHOD = /^(\s+)(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)?\s*[:{]?\s*[^;]*$/;
const NOT_METHOD = new Set(["if", "for", "while", "switch", "catch", "return", "function", "await", "new", "typeof", "else"]);
const IMPORT = /^\s*(?:import\b.*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|from\s+(\S+)\s+import|const\s+\w+\s*=\s*require\(['"]([^'"]+)['"]\))/;
const MAX_SIG = 110;
const MAX_DEPTH = 2; // indentation levels kept (top level + one nested)

const indentOf = (ws) => ws.replace(/\t/g, "  ").length;

export function declarations(src) {
  const lines = src.split("\n");
  const decls = [];
  const imports = [];
  let unit = 0; // indentation unit, learned from the first indented declaration

  lines.forEach((line, i) => {
    const imp = line.match(IMPORT);
    if (imp) return imports.push(imp[1] ?? imp[2] ?? imp[3] ?? imp[4]);
    let m = line.match(DECL);
    let indent;
    let name;
    if (m) {
      indent = indentOf(m[1]);
      name = m[3];
    } else if ((m = line.match(METHOD)) && !NOT_METHOD.has(m[2]) && decls.some((d) => d.kind === "class")) {
      indent = indentOf(m[1]);
      name = m[2];
    } else return;
    if (indent > 0 && !unit) unit = indent;
    const depth = unit ? Math.round(indent / unit) : 0;
    if (depth >= MAX_DEPTH) return;
    if (/^(const|let|var)$/.test(m[2]) && depth > 0) return; // locals aren't structure
    decls.push({ start: i + 1, indent, depth, kind: m[2], name, sig: line.trim().replace(/\s*\{\s*$/, "").slice(0, MAX_SIG) });
  });

  decls.forEach((d, i) => {
    const next = decls.slice(i + 1).find((n) => n.indent <= d.indent);
    let end = next ? next.start - 1 : lines.length;
    while (end > d.start && !lines[end - 1].trim()) end--;
    d.end = end;
  });
  return { lines, decls, imports };
}

export function outline(absPath, relPath) {
  const { lines, decls, imports } = declarations(readFileSync(absPath, "utf8"));
  const head = `== ${relPath} (${lines.length} lines)` + (imports.length ? ` imports: ${imports.join(", ")}` : "");
  const body = decls.map((d) => `${"  ".repeat(d.depth + 1)}${d.start}-${d.end}  ${d.sig}`);
  return [head, ...(body.length ? body : ["  (no declarations found; read the file instead)"])].join("\n");
}
