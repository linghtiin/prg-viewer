import { FALLBACK_BACKGROUND_COLOR, FALLBACK_TEXT_COLOR } from "../scene/css-color.ts";

/** Theme colours resolved from the surrounding Obsidian theme. */
export interface RenderTheme {
  dark: boolean;
  background: string;
  text: string;
  mutedText: string;
  border: string;
  selection: string;
  sectionFill: string;
  grid: string;
  edge: string;
  unknownFill: string;
  unknownBorder: string;
}

export type CssVarReader = (name: string, fallback: string) => string;

/** Pure builder, so the mapping is testable without a DOM. */
export function buildTheme(read: CssVarReader, dark: boolean): RenderTheme {
  const background = read("--background-primary", dark ? "#1e1e1e" : FALLBACK_BACKGROUND_COLOR);
  const text = read("--text-normal", dark ? "#dcddde" : FALLBACK_TEXT_COLOR);
  const border = read("--background-modifier-border", dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)");
  return {
    dark,
    background,
    text,
    mutedText: read("--text-muted", dark ? "#a3a3a3" : "#666666"),
    border,
    selection: read("--interactive-accent", "#7b6cf6"),
    sectionFill: read("--background-modifier-hover", dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"),
    grid: read("--background-modifier-border", border),
    edge: read("--text-faint", dark ? "#9a9a9a" : "#777777"),
    unknownFill: read("--background-secondary", dark ? "#262626" : "#f4f4f4"),
    unknownBorder: border,
  };
}

export function isDarkTheme(element: HTMLElement): boolean {
  const body = element.ownerDocument.body;
  if (body.classList.contains("theme-dark")) return true;
  if (body.classList.contains("theme-light")) return false;
  const background = element.ownerDocument.defaultView?.getComputedStyle(element).backgroundColor ?? "";
  const match = /rgba?\(([^)]+)\)/.exec(background);
  if (!match) return false;
  const channels = (match[1] ?? "")
    .split(/[,/\s]+/)
    .map((part) => Number.parseFloat(part))
    .filter((value) => Number.isFinite(value));
  const [r = 255, g = 255, b = 255] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function readThemeFromElement(element: HTMLElement): RenderTheme {
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  const read: CssVarReader = (name, fallback) => {
    const value = style?.getPropertyValue(name).trim() ?? "";
    return value.length > 0 ? value : fallback;
  };
  return buildTheme(read, isDarkTheme(element));
}
