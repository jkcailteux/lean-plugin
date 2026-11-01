// Experimental (see hooks/experimental-hooks.json): PostToolUse records reads for readcache;
// PreCompact forgets everything sent once the context is compacted.
// Never fails loudly: a broken hook must not break the session.
import { readFileSync } from "node:fs";
import { has } from "./features.mjs";
import { stateFor } from "./state.mjs";
import { readRange, recordRead } from "./read-cache.mjs";

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.hook_event_name === "PreCompact") stateFor(input).clear();
  else if (input.tool_name === "Read" && has("readcache") && input.tool_input?.file_path) {
    const st = stateFor(input);
    recordRead(st.data, input.tool_input.file_path, readRange(input.tool_input));
    st.save();
  }
} catch {}
