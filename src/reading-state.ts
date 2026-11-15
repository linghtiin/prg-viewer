import type { CameraState } from "./scene/camera.ts";

/**
 * Per-vault reading state (one camera per `.prg` file), kept in its own file so
 * frequent pan/zoom writes never churn `data.json`. Pure module: no Obsidian and
 * no DOM, so it is unit tested in Node.
 */

/** File placed next to the plugin, inside its manifest directory. */
export const READING_STATE_FILE = "reading-state.json";
/** Schema version written to the file; older readers ignore unknown fields. */
export const READING_STATE_VERSION = 1;

/** Camera state keyed by the vault-relative path of the `.prg` file. */
export type CameraStateMap = Record<string, CameraState>;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cameraStateOrNull(raw: unknown): CameraState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const candidate = raw as Partial<CameraState>;
  const x = finiteNumber(candidate.x);
  const y = finiteNumber(candidate.y);
  const scale = finiteNumber(candidate.scale);
  if (x === null || y === null || scale === null) return null;
  return { x, y, scale };
}

/** Coerces persisted or hand-edited data into a valid camera map, dropping bad records. */
export function normalizeCameraStates(raw: unknown): CameraStateMap {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const states: CameraStateMap = {};
  for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
    if (path.length === 0) continue;
    const state = cameraStateOrNull(value);
    if (state) states[path] = state;
  }
  return states;
}

/** Parses the reading-state file; `null` means the text is not usable JSON. */
export function parseViewState(text: string): CameraStateMap | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return normalizeCameraStates((parsed as { cameras?: unknown }).cameras);
}

/**
 * Sorts paths and pins formatting so the file stays byte-stable (and diffs stay
 * readable) even when someone commits it by accident.
 */
export function serializeViewState(cameras: CameraStateMap): string {
  const sorted: CameraStateMap = {};
  for (const path of Object.keys(cameras).sort()) {
    const state = cameras[path];
    if (state) sorted[path] = { x: state.x, y: state.y, scale: state.scale };
  }
  return `${JSON.stringify({ version: READING_STATE_VERSION, cameras: sorted }, null, 2)}\n`;
}

/** `primary` (the state file) wins; `fallback` (legacy `data.json` cameras) only fills gaps. */
export function mergeCameraStates(
  primary: CameraStateMap | null,
  fallback: CameraStateMap | null,
): CameraStateMap {
  const merged: CameraStateMap = { ...(fallback ?? {}) };
  for (const [path, state] of Object.entries(primary ?? {})) merged[path] = state;
  return merged;
}

/** Vault path of the reading-state file, next to the plugin itself. */
export function readingStatePath(configDir: string, pluginDir: string | undefined, pluginId: string): string {
  const base = pluginDir && pluginDir.length > 0 ? pluginDir : `${configDir}/plugins/${pluginId}`;
  return `${base.replace(/[\\/]+$/, "")}/${READING_STATE_FILE}`;
}
