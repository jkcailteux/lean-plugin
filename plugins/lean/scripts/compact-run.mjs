#!/usr/bin/env node
// Runs a (base64-encoded) shell command, prints compacted output, exits with its exit code.
// The "bashcompact" hook rewrites noisy test/build commands to go through this.
import { spawn } from "node:child_process";
import { compact } from "./compact.mjs";

const command = Buffer.from(process.argv[2] ?? "", "base64").toString("utf8");
const child = spawn(process.env.SHELL || "/bin/sh", ["-c", command], { stdio: ["inherit", "pipe", "pipe"] });
let out = "";
const collect = (d) => {
  if (out.length < 20_000_000) out += d;
};
child.stdout.on("data", collect);
child.stderr.on("data", collect);
child.on("close", (code, signal) => {
  process.stdout.write(compact(out, code, signal).text + "\n");
  process.exit(code ?? 1);
});
