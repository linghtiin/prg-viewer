/**
 * Build script.
 *
 * The esbuild JavaScript API talks to a long-running child process over pipes.
 * That is not always available (restricted sandboxes, some CI images), so this
 * script shells out to the esbuild CLI with inherited stdio instead. The CLI is
 * a stable, documented interface and behaves identically on every platform.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const watch = process.argv.includes("--watch");

/** @type {string[]} */
const args = [
  "src/main.ts",
  "--bundle",
  "--outfile=main.js",
  "--format=cjs",
  "--platform=browser",
  "--target=es2022",
  "--log-level=info",
  "--external:obsidian",
  "--external:electron",
  "--external:@codemirror/autocomplete",
  "--external:@codemirror/collab",
  "--external:@codemirror/commands",
  "--external:@codemirror/language",
  "--external:@codemirror/lint",
  "--external:@codemirror/search",
  "--external:@codemirror/state",
  "--external:@codemirror/view",
  "--external:@lezer/common",
  "--external:@lezer/highlight",
  "--external:@lezer/lr",
];

if (watch) {
  args.push("--sourcemap=inline", "--watch");
}

const esbuildBin = require.resolve("esbuild/bin/esbuild");
const result = spawnSync(process.execPath, [esbuildBin, ...args], { stdio: "inherit" });

if (result.error) {
  console.error("[prg-viewer] failed to start esbuild:", result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
