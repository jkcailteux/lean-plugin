// Cursor hook (workspaceOpen / sessionStart): write the repo map as an always-applied
// project rule. Cursor's sessionStart additional_context is unreliable; rules are not.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { has } from "./features.mjs";
import { repoMap } from "./repo-map.mjs";

export const RULE = ".cursor/rules/lean-repo-map.mdc";

const git = (root, ...args) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

// Keep the generated rule out of `git status` (and so out of the map itself).
function exclude(root) {
  const file = resolve(root, git(root, "rev-parse", "--git-path", "info/exclude"));
  const pattern = `/${git(root, "rev-parse", "--show-prefix")}${RULE}`;
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {}
  if (text.split("\n").includes(pattern)) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}${pattern}\n`);
}

export function writeRule(root) {
  try {
    exclude(root);
  } catch {
    return; // not a git repo
  }
  const map = repoMap(root);
  if (!map) return;
  const text = `---
description: lean repo map - files and top-level symbols
alwaysApply: true
---

Repo map: files and top-level symbols as name:line. Use it to go straight to the right file and line range instead of exploring with ls, find or broad greps.
${map}
`;
  const file = join(root, RULE);
  try {
    if (readFileSync(file, "utf8") === text) return;
  } catch {}
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {}
  const roots = new Set([...(input.workspace_roots ?? []), process.env.CURSOR_PROJECT_DIR].filter(Boolean));
  if (has("repomap")) for (const root of roots) writeRule(root);
  console.log("{}");
}
