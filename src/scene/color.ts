import type { Rgba } from "../format/types.ts";

/** Colour helpers. Project Graph stores colours as un-premultiplied RGBA. */

export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export function isTransparent(color: Rgba): boolean {
  return color.a === 0;
}

export function rgbaToCss(color: Rgba): string {
  const r = Math.round(color.r);
  const g = Math.round(color.g);
  const b = Math.round(color.b);
  return `rgba(${r}, ${g}, ${b}, ${color.a})`;
}

export function rgbToHex(color: Rgba): string {
  const toHex = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/** Perceived brightness (0-255), same weights as the reference implementation. */
export function brightness(color: Rgba): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/** Black or white, whichever contrasts better with `color`. */
export function invertForContrast(color: Rgba): Rgba {
  return brightness(color) > 128 ? BLACK : WHITE;
}

/**
 * Text colour for a node.
 *
 * - no custom fill: use the theme's text colour (it already contrasts with the
 *   theme background);
 * - fully solid fill: contrast against the fill itself.
 */
export function resolveTextColor(nodeColor: Rgba, themeText: Rgba): Rgba {
  if (nodeColor.a === 0) return themeText;
  if (nodeColor.a === 1) return invertForContrast(nodeColor);
  return themeText;
}
