import type { WheelBehavior } from "./scene/input.ts";

export type BackgroundStyle = "none" | "grid";

/** Outline sidebar layout: nested node tree, or one flat list per node kind. */
export type OutlineMode = "tree" | "category";

export interface PrgViewerSettings {
  background: BackgroundStyle;
  wheelBehavior: WheelBehavior;
  showOutlineByDefault: boolean;
  outlineMode: OutlineMode;
  /** Default outline width used when a view opens; changing it in settings persists it. */
  outlineWidth: number;
  /** Default details-pane height as a fraction of the sidebar; drag changes are session-only. */
  detailsRatio: number;
  rememberCameraPerFile: boolean;
  maxImageCacheMB: number;
  debugLogging: boolean;
}

export const DEFAULT_OUTLINE_WIDTH = 260;
export const MIN_OUTLINE_WIDTH = 200;
export const MAX_OUTLINE_WIDTH = 720;
export const DEFAULT_DETAILS_RATIO = 0.4;
export const MIN_DETAILS_RATIO = 0.15;
export const MAX_DETAILS_RATIO = 0.85;

export const DEFAULT_SETTINGS: PrgViewerSettings = {
  background: "none",
  wheelBehavior: "zoom",
  showOutlineByDefault: false,
  outlineMode: "tree",
  outlineWidth: DEFAULT_OUTLINE_WIDTH,
  detailsRatio: DEFAULT_DETAILS_RATIO,
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

function detailsRatioOrFallback(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_SETTINGS.detailsRatio;
  }
  const clamped = Math.min(MAX_DETAILS_RATIO, Math.max(MIN_DETAILS_RATIO, value));
  return Math.round(clamped * 100) / 100;
}

/** Coerces persisted and user-edited data into a valid settings object. */
export function normalizeSettings(raw: unknown): PrgViewerSettings {
  const source: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    background: source.background === "grid" ? "grid" : "none",
    wheelBehavior: source.wheelBehavior === "pan" ? "pan" : "zoom",
    showOutlineByDefault: booleanOr(source.showOutlineByDefault, DEFAULT_SETTINGS.showOutlineByDefault),
    outlineMode: source.outlineMode === "category" ? "category" : "tree",
    outlineWidth: numberInRange(
      source.outlineWidth,
      DEFAULT_SETTINGS.outlineWidth,
      MIN_OUTLINE_WIDTH,
      MAX_OUTLINE_WIDTH,
    ),
    detailsRatio: detailsRatioOrFallback(source.detailsRatio),
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
