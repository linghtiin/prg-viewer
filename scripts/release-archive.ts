/**
 * Pure helpers behind `pnpm package:release`: which files a release archive
 * holds, what it is called, and how its bytes are produced. The CLI wrapper
 * lives in `package-release.ts`; these rules stay testable without touching disk.
 */
import { zipSync } from "fflate";

/** The three files Obsidian needs; they sit at the archive root. */
export const RELEASE_ARTIFACTS = ["main.js", "manifest.json", "styles.css"] as const;

/** Asset name on the release page; the release tag already carries the version. */
export const RELEASE_ARCHIVE_NAME = "project-graph-viewer.zip";

/** One artifact read from the working tree. */
export interface ReleaseFile {
  readonly name: string;
  readonly data: Uint8Array;
}

/**
 * Fixed modification time, so identical inputs produce identical archives and a
 * locally built zip can be compared with the one CI uploads.
 */
const ZIP_MTIME = new Date(2020, 0, 1);

/** Builds the release zip; throws when a required artifact is missing or empty. */
export function buildReleaseArchive(files: readonly ReleaseFile[]): Uint8Array {
  const byName = new Map<string, Uint8Array>();
  for (const file of files) byName.set(file.name, file.data);

  const entries: Record<string, Uint8Array> = {};
  for (const name of RELEASE_ARTIFACTS) {
    const data = byName.get(name);
    if (data === undefined) throw new Error(`缺少发布文件 ${name}。`);
    if (data.length === 0) throw new Error(`发布文件 ${name} 为空。`);
    entries[name] = data;
  }
  return zipSync(entries, { level: 9, mtime: ZIP_MTIME });
}
