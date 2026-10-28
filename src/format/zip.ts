import { unzipSync } from "fflate";
import { PrgError, describeError, formatBytes } from "./errors.ts";
import { DEFAULT_ZIP_LIMITS, type ZipLimits } from "./limits.ts";

const DRIVE_LETTER = /^[a-zA-Z]:/;

/**
 * Entry names must be relative, forward-slash separated and must not be able to
 * escape the container. Files are never extracted to disk, but rejecting these
 * names keeps the parser honest and matches the specification.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0) return false;
  if (name.includes("\\")) return false;
  if (name.startsWith("/")) return false;
  if (DRIVE_LETTER.test(name)) return false;
  const segments = name.split("/");
  return segments.every((segment) => segment !== ".." && segment.length > 0);
}

/**
 * Reads all file entries of a PRG container into memory.
 *
 * Size limits are enforced *before* an entry is inflated by using fflate's
 * filter hook, so a compression bomb is rejected instead of being materialised.
 */
export function readZipEntries(
  bytes: Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Map<string, Uint8Array> {
  if (bytes.byteLength === 0) {
    throw new PrgError("invalid-container", "文件为空。");
  }

  let entryCount = 0;
  let totalBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          throw new PrgError("limit-exceeded", `容器条目数量超过上限（${limits.maxEntries}）。`);
        }
        const size = file.originalSize || file.size;
        if (size > limits.maxEntryBytes) {
          throw new PrgError(
            "limit-exceeded",
            `条目“${file.name}”解压后超过单文件上限（${formatBytes(limits.maxEntryBytes)}）。`,
          );
        }
        totalBytes += size;
        if (totalBytes > limits.maxTotalBytes) {
          throw new PrgError(
            "limit-exceeded",
            `解压后总大小超过上限（${formatBytes(limits.maxTotalBytes)}）。`,
          );
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof PrgError) throw error;
    throw new PrgError("invalid-container", "无法解压 .prg 容器，文件可能已损坏。", describeError(error));
  }

  const entries = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    if (!isSafeEntryName(name)) {
      throw new PrgError("unsafe-path", `容器中存在不安全的路径：${name}`);
    }
    entries.set(name, data);
  }
  return entries;
}
