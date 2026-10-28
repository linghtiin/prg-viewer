export type BackgroundStyle = "none" | "grid";

export interface PrgViewerSettings {
  background: BackgroundStyle;
  showOutlineByDefault: boolean;
  rememberCameraPerFile: boolean;
  maxImageCacheMB: number;
  debugLogging: boolean;
}

export const DEFAULT_SETTINGS: PrgViewerSettings = {
  background: "none",
  showOutlineByDefault: false,
  rememberCameraPerFile: true,
  maxImageCacheMB: 64,
  debugLogging: false,
};

const MIN_CACHE_MB = 8;
const MAX_CACHE_MB = 512;

function numberInRange(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Coerces persisted and user-edited data into a valid settings object. */
export function normalizeSettings(raw: unknown): PrgViewerSettings {
  const source: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    background: source.background === "grid" ? "grid" : "none",
    showOutlineByDefault: booleanOr(source.showOutlineByDefault, DEFAULT_SETTINGS.showOutlineByDefault),
    rememberCameraPerFile: booleanOr(source.rememberCameraPerFile, DEFAULT_SETTINGS.rememberCameraPerFile),
    maxImageCacheMB: numberInRange(
      source.maxImageCacheMB,
      DEFAULT_SETTINGS.maxImageCacheMB,
      MIN_CACHE_MB,
      MAX_CACHE_MB,
    ),
    debugLogging: booleanOr(source.debugLogging, DEFAULT_SETTINGS.debugLogging),
  };
}
