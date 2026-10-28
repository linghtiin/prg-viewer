import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/** Guards the layering: the pure core must never depend on Obsidian. */

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }
  return files;
}

const OBSIDIAN_IMPORT = /from\s+["']obsidian["']|require\(\s*["']obsidian["']\s*\)/;

test("format and scene layers never import obsidian", () => {
  const files = [
    ...walk(join(srcDir, "format")),
    ...walk(join(srcDir, "scene")),
    ...walk(join(srcDir, "util")),
  ];
  assert.ok(files.length > 0, "expected source files to scan");
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    assert.equal(OBSIDIAN_IMPORT.test(content), false, `${file} imports obsidian`);
  }
});

test("format and scene layers do not touch the DOM directly", () => {
  const files = [...walk(join(srcDir, "format")), ...walk(join(srcDir, "scene"))];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    assert.equal(/\bdocument\.(createElement|querySelector)/.test(content), false, `${file} touches the DOM`);
  }
});
