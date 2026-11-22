/**
 * Builds the single-file release archive from the three root artifacts and
 * writes `dist/project-graph-viewer.zip`. CI runs it after `pnpm verify` (which builds
 * `main.js`); locally run `pnpm build` first.
 *
 * Usage:
 *   pnpm package:release
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_ARCHIVE_NAME, RELEASE_ARTIFACTS, buildReleaseArchive } from "./release-archive.ts";
import type { ReleaseFile } from "./release-archive.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function guard<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function readArtifact(name: string): ReleaseFile {
  return guard(() => ({ name, data: readFileSync(join(root, name)) }));
}

const archive = guard(() => buildReleaseArchive(RELEASE_ARTIFACTS.map(readArtifact)));
const output = join(root, "dist", RELEASE_ARCHIVE_NAME);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, archive);
console.log(`✓ dist/${RELEASE_ARCHIVE_NAME}（${archive.length} 字节）：${RELEASE_ARTIFACTS.join("、")}`);
