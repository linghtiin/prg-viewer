export type WheelBehavior = "zoom" | "pan";

export interface WheelInput {
  /** What a plain wheel (no modifier) should do. */
  behavior: WheelBehavior;
  ctrlKey: boolean;
  metaKey: boolean;
  deltaX: number;
  deltaY: number;
}

export type WheelAction = { kind: "zoom"; factor: number } | { kind: "pan"; dx: number; dy: number };

export const WHEEL_ZOOM_SENSITIVITY = 0.0025;

/**
 * Maps a wheel event to either a zoom or a pan.
 *
 * Default behaviour ("zoom"): wheel zooms, Ctrl/⌘ + wheel scrolls.
 * Swapped behaviour ("pan"): wheel scrolls, Ctrl/⌘ + wheel zooms.
 */
export function resolveWheelAction(input: WheelInput): WheelAction {
  const modifier = input.ctrlKey || input.metaKey;
  const wantsZoom = input.behavior === "zoom" ? !modifier : modifier;
  if (wantsZoom) {
    return { kind: "zoom", factor: Math.exp(-input.deltaY * WHEEL_ZOOM_SENSITIVITY) };
  }
  // `0 - x` avoids producing -0 for zero deltas, which would break equality tests.
  return { kind: "pan", dx: 0 - input.deltaX, dy: 0 - input.deltaY };
}
