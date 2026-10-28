/** Errors and warnings produced while reading a PRG container. */

export type PrgErrorCode =
  | "invalid-container"
  | "unsafe-path"
  | "limit-exceeded"
  | "missing-stage"
  | "decode-failed"
  | "unsupported-format";

/** A fatal problem: the file cannot be shown, but the app must not crash. */
export class PrgError extends Error {
  readonly code: PrgErrorCode;
  readonly details: string | undefined;

  constructor(code: PrgErrorCode, message: string, details?: string) {
    super(message);
    this.name = "PrgError";
    this.code = code;
    this.details = details;
  }
}

export type PrgWarningCode =
  | "unknown-class"
  | "invalid-reference"
  | "missing-field"
  | "missing-attachment"
  | "duplicate-id"
  | "dangling-edge"
  | "unsupported-version"
  | "attachment-conflict"
  | "invalid-entry";

/** A recoverable problem: the document is still usable. */
export interface PrgWarning {
  code: PrgWarningCode;
  message: string;
  ref?: string;
}

export function createWarning(code: PrgWarningCode, message: string, ref?: string): PrgWarning {
  return ref === undefined ? { code, message } : { code, message, ref };
}

/** Appends a warning without duplicating identical entries. */
export function pushWarning(warnings: PrgWarning[], warning: PrgWarning): void {
  if (
    warnings.some((w) => w.code === warning.code && w.message === warning.message && w.ref === warning.ref)
  ) {
    return;
  }
  warnings.push(warning);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
