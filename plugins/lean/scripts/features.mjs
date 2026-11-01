import { readFileSync } from "node:fs";

// Feature flags. Defaults come from features.json (features that won their benchmark);
// LEAN_FEATURES overrides them, so the benchmark can turn single features on and off.
function defaults() {
  try {
    return JSON.parse(readFileSync(new URL("../features.json", import.meta.url), "utf8")).enabled.join(",");
  } catch {
    return "";
  }
}

export const FEATURES = new Set(
  (process.env.LEAN_FEATURES ?? defaults()).split(/[,+]/).map((s) => s.trim()).filter(Boolean)
);

export const has = (name) => FEATURES.has(name);
