#!/usr/bin/env node
// Zero-dependency MCP server over stdio: newline-delimited JSON-RPC 2.0.
// No node_modules to ship, so the plugin works straight from a git clone.
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { SAVINGS_LOG } from "../scripts/paths.mjs";
import { has } from "../scripts/features.mjs";
import { outline, declarations } from "./outline.mjs";
import { compact } from "../scripts/compact.mjs";
import { usageStats } from "./usage.mjs";

const VERSION = "0.1.0";
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.env.CURSOR_PROJECT_DIR || process.cwd();
// Cursor has no Claude transcripts for UsageStats to read.
const HOST = process.env.LEAN_HOST || "claude";

// ---------- tools ----------

function multiRead({ files, maxLines = 400 }) {
  const text = files
    .map(({ path, start = 1, end }) => {
      let text;
      try {
        text = readFileSync(resolve(ROOT, path), "utf8");
      } catch (err) {
        return `== ${path}: ${err.code || err.message}`;
      }
      const lines = text.split("\n");
      const want = Math.min(end ?? lines.length, lines.length);
      const from = Math.max(1, start);
      const to = Math.min(want, from + maxLines - 1);
      const body = lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`).join("\n");
      const cut = to < want ? `\n… cut at line ${to}; pass start=${to + 1} for more` : "";
      return `== ${path} (${from}-${to} of ${lines.length})\n${body}${cut}`;
    })
    .join("\n\n");
  // Built-in Read would send the same lines, just spread over files.length calls.
  return { text, baseline: text.length, callsSaved: files.length - 1 };
}

const MAX_CAPTURE = 20_000_000;

function runCompact({ command, timeoutSec = 300, context = 2, tail = 15 }) {
  return new Promise((done) => {
    const child = spawn(command, { cwd: ROOT, shell: true });
    let out = "";
    const collect = (d) => {
      if (out.length < MAX_CAPTURE) out += d;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutSec * 1000);
    child.on("error", (err) => {
      clearTimeout(timer);
      done({ text: `spawn failed: ${err.message}` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      done(compact(out, code, signal, { context, tail }));
    });
  });
}

function recordSavings(tool, sent, baseline, callsSaved, id) {
  try {
    mkdirSync(dirname(SAVINGS_LOG), { recursive: true });
    appendFileSync(SAVINGS_LOG, JSON.stringify({ t: Date.now(), tool, sent, baseline, callsSaved, id }) + "\n");
  } catch {}
}

function outlineFiles({ paths }) {
  let baseline = 0;
  const text = paths
    .map((p) => {
      try {
        const abs = resolve(ROOT, p);
        baseline += readFileSync(abs, "utf8").length; // what reading the whole file would send
        return outline(abs, p);
      } catch (err) {
        return `== ${p}: ${err.code || err.message}`;
      }
    })
    .join("\n\n");
  return { text, baseline, callsSaved: paths.length - 1 };
}

function readSymbol({ path, name }) {
  const abs = resolve(ROOT, path);
  const src = readFileSync(abs, "utf8");
  const { lines, decls } = declarations(src);
  const hits = decls.filter((d) => d.name === name).slice(0, 3);
  if (!hits.length) {
    const near = decls.filter((d) => d.name && d.name.toLowerCase().includes(name.toLowerCase())).map((d) => `${d.name}:${d.start}`);
    return `No declaration named ${name} in ${path}.` + (near.length ? ` Similar: ${near.slice(0, 8).join(", ")}` : "");
  }
  const text = hits
    .map((d) => `== ${path}:${d.start}-${d.end}\n` + lines.slice(d.start - 1, d.end).map((l, i) => `${d.start + i}\t${l}`).join("\n"))
    .join("\n\n");
  return { text, baseline: src.length };
}

function batchEdit({ edits }) {
  const byFile = new Map();
  edits.forEach((e, i) => {
    const abs = resolve(ROOT, e.path);
    if (!byFile.has(abs)) byFile.set(abs, []);
    byFile.get(abs).push({ ...e, i });
  });
  const problems = [];
  let applied = 0;
  let files = 0;
  for (const [abs, list] of byFile) {
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch (err) {
      problems.push(`✗ ${list[0].path}: ${err.code || err.message}`);
      continue;
    }
    let next = src;
    let failed = false;
    for (const e of list) {
      const count = next.split(e.old).length - 1;
      if (count === 0) {
        const first = e.old.split("\n").find((l) => l.trim())?.trim() ?? "";
        const near = next.split("\n").findIndex((l) => first && l.includes(first.slice(0, 40)));
        problems.push(`✗ #${e.i + 1} ${e.path}: old text not found` + (near >= 0 ? ` (closest: line ${near + 1}: ${next.split("\n")[near].trim().slice(0, 100)})` : ""));
        failed = true;
        break;
      }
      if (count > 1 && !e.replaceAll) {
        problems.push(`✗ #${e.i + 1} ${e.path}: old text matches ${count} times; add surrounding context or set replaceAll`);
        failed = true;
        break;
      }
      next = e.replaceAll ? next.split(e.old).join(e.new) : next.replace(e.old, () => e.new);
    }
    if (failed) {
      problems.push(`  no changes written to ${list[0].path}`);
      continue;
    }
    writeFileSync(abs, next);
    applied += list.length;
    files++;
  }
  const text = `${applied} of ${edits.length} edits applied in ${files} file(s).` + (problems.length ? `\n${problems.join("\n")}` : "");
  return { text, baseline: text.length, callsSaved: Math.max(0, applied - 1) };
}

// `feature` gates a tool behind a feature flag (see features.json / LEAN_FEATURES).
// `core` tools are hidden by the "slim" experiment.
// `annotations` are standard MCP hints; readOnlyHint lets hosts such as Cursor skip the approval prompt.
const READ_ONLY = { readOnlyHint: true };
const TOOLS = [
  {
    name: "BatchEdit",
    feature: "batchedit",
    description:
      "Apply many exact search/replace edits across one or more files in ONE call. No prior Read needed: take the old text from Grep output. Each file is all-or-nothing. Use it whenever you are making more than one edit.",
    inputSchema: {
      type: "object",
      properties: {
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path relative to the project root." },
              old: { type: "string", description: "Exact text to replace; must be unique in the file unless replaceAll." },
              new: { type: "string" },
              replaceAll: { type: "boolean" },
            },
            required: ["path", "old", "new"],
          },
        },
      },
      required: ["edits"],
    },
    run: batchEdit,
  },
  {
    name: "ReadSymbol",
    feature: "bigread",
    description: "Read one function, class, method or type by name, with line numbers, instead of the whole file.",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, name: { type: "string" } },
      required: ["path", "name"],
    },
    run: readSymbol,
  },
  {
    name: "Outline",
    feature: "outline",
    description:
      "Show the structure of one or more files: imports, then every declaration (functions, classes, methods, types, top-level consts) with its line range and signature. About 10% of the size of reading the file. Use it before reading any file over ~100 lines, then Read only the line range you need.",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: { paths: { type: "array", items: { type: "string" }, minItems: 1, description: "Paths relative to the project root." } },
      required: ["paths"],
    },
    run: outlineFiles,
  },
  {
    name: "MultiRead",
    core: true,
    description:
      "Read several files (or line ranges) in ONE call, with line numbers. Prefer this over reading files one at a time. Paths are relative to the project root.",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              start: { type: "integer", minimum: 1, description: "First line (1-based)." },
              end: { type: "integer", minimum: 1, description: "Last line, inclusive." },
            },
            required: ["path"],
          },
          minItems: 1,
        },
        maxLines: { type: "integer", description: "Per-file line cap (default 400)." },
      },
      required: ["files"],
    },
    run: multiRead,
  },
  {
    name: "RunCompact",
    core: true,
    description:
      "Run a shell command (tests, builds, linters) and return only the exit status, lines that look like errors/failures with a little context, and the last few lines. Use instead of Bash when output is long and you only need what went wrong.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeoutSec: { type: "integer", description: "Kill after this many seconds (default 300)." },
        context: { type: "integer", description: "Lines kept around each error line (default 2)." },
        tail: { type: "integer", description: "Trailing lines always kept (default 15)." },
      },
      required: ["command"],
    },
    run: runCompact,
  },
  {
    name: "UsageStats",
    core: true,
    hosts: ["claude"],
    description:
      "Summarize this project's recent sessions: cost at API prices, which tools produced the most output (a proxy for context/tokens), and estimated tokens, round trips, dollars and time lean saved.",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: { sinceHours: { type: "number", description: "Window in hours (default 24)." } },
    },
    run: (args) => usageStats(ROOT, SAVINGS_LOG, args),
  },
];

// ---------- JSON-RPC plumbing ----------

const rpcError = (code, message) => Object.assign(new Error(message), { code });
const enabled = (t) =>
  (!t.hosts || t.hosts.includes(HOST)) && (t.feature ? has(t.feature) : !(t.core && has("slim")));

async function handle(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "lean-tools", version: VERSION },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.filter(enabled).map(({ run, feature, core, hosts, ...def }) => def) };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name && enabled(t));
      if (!tool) throw rpcError(-32602, `Unknown tool: ${params.name}`);
      try {
        const result = await tool.run(params.arguments ?? {});
        const { text, baseline, callsSaved = 0 } = typeof result === "string" ? { text: result } : result;
        if (baseline !== undefined) recordSavings(tool.name, text.length, baseline, callsSaved, params._meta?.["claudecode/toolUseId"]);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: String(err?.message ?? err) }], isError: true };
      }
    }
    default:
      throw rpcError(-32601, `Method not found: ${method}`);
  }
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  if (msg.id === undefined) return; // notification (e.g. notifications/initialized)
  try {
    send({ jsonrpc: "2.0", id: msg.id, result: await handle(msg.method, msg.params ?? {}) });
  } catch (err) {
    send({ jsonrpc: "2.0", id: msg.id, error: { code: err.code ?? -32603, message: err.message } });
  }
});
