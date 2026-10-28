import type { Rgba } from "../format/types.ts";
import { BLACK } from "./color.ts";

/** CSS colour parsing for theme variables read from Obsidian. */

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Parses the colour formats Obsidian themes use: `#rgb`, `#rgba`, `#rrggbb`,
 * `#rrggbbaa`, `rgb(...)`, `rgba(...)` and the space-separated variants.
 * Returns `fallback` for anything else (named colours, oklch, …).
 */
export function parseCssColor(input: string, fallback: Rgba = BLACK): Rgba {
  const value = input.trim().toLowerCase();
  if (value.length === 0) return fallback;

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return fallback;
    const expand = (part: string): number => parseInt(part.length === 1 ? part + part : part, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex.slice(0, 1)),
        g: expand(hex.slice(1, 2)),
        b: expand(hex.slice(2, 3)),
        a: hex.length === 4 ? expand(hex.slice(3, 4)) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return fallback;
  }

  const match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!match) return fallback;
  const parts = (match[1] ?? "")
    .split(/[,/\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 3) return fallback;

  const channel = (part: string): number => {
    if (part.endsWith("%")) return (parseFloat(part) / 100) * 255;
    return parseFloat(part);
  };
  const alpha = (part: string): number => {
    if (part.endsWith("%")) return parseFloat(part) / 100;
    return parseFloat(part);
  };

  const r = channel(parts[0] as string);
  const g = channel(parts[1] as string);
  const b = channel(parts[2] as string);
  if (![r, g, b].every(Number.isFinite)) return fallback;
  const a = parts[3] === undefined ? 1 : alpha(parts[3]);
  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b),
    a: Number.isFinite(a) ? clampAlpha(a) : 1,
  };
}

/** Human readable fallback used when a theme variable is missing. */
export const FALLBACK_TEXT_COLOR = "#1e1e1e";
export const FALLBACK_BACKGROUND_COLOR = "#ffffff";
