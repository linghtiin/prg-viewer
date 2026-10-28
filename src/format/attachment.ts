import { PrgError, createWarning, pushWarning, type PrgWarning } from "./errors.ts";
import type { PrgAttachment } from "./types.ts";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  json: "application/json",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  zip: "application/zip",
};

/** Attachment names must be `<uuid>.<extension>` inside `attachments/`. */
export const ATTACHMENT_PATTERN = /^attachments\/([a-zA-Z0-9-]+)\.([a-zA-Z0-9]+)$/;

export function mimeTypeForExtension(extension: string): string {
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? "application/octet-stream";
}

/**
 * Collects attachment entries. Per the specification, two files may never share
 * a UUID, so a collision is a hard error rather than a silent pick.
 */
export function parseAttachments(
  entries: Map<string, Uint8Array>,
  warnings: PrgWarning[],
): Map<string, PrgAttachment> {
  const attachments = new Map<string, PrgAttachment>();
  for (const [name, bytes] of entries) {
    if (!name.startsWith("attachments/")) continue;
    const match = ATTACHMENT_PATTERN.exec(name);
    if (!match) {
      pushWarning(warnings, createWarning("invalid-entry", `附件名不符合规范，已跳过：${name}`, name));
      continue;
    }
    const id = match[1] ?? "";
    const extension = match[2] ?? "";
    const existing = attachments.get(id);
    if (existing) {
      if (existing.fileName !== name) {
        throw new PrgError(
          "invalid-container",
          `附件 UUID 冲突：${name} 与 ${existing.fileName} 使用了同一个 UUID。`,
        );
      }
      continue;
    }
    attachments.set(id, {
      id,
      fileName: name,
      mime: mimeTypeForExtension(extension),
      bytes,
    });
  }
  return attachments;
}
