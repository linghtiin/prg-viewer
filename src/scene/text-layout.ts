import { FONT_SIZE, LINE_HEIGHT, NODE_PADDING, NODE_RADIUS } from "../constants.ts";
import type { PrgTextNode, Rect } from "../format/types.ts";
import type { FontSpec, TextMeasurer } from "./text-measurer.ts";

/**
 * Text metrics that mirror how Project Graph lays out text nodes:
 * `fontSize = 32 * 2^(fontScaleLevel / 2)`, padding and border scale with it,
 * and the line height is 1.5.
 */

export function fontSizeForLevel(fontScaleLevel: number): number {
  const raw = FONT_SIZE * 2 ** (fontScaleLevel / 2);
  if (!Number.isFinite(raw) || raw <= 0) return FONT_SIZE;
  return raw >= 2 ? Math.floor(raw) : raw;
}

export function paddingForFontSize(fontSize: number): number {
  return (fontSize / FONT_SIZE) * NODE_PADDING;
}

export function borderWidthForFontSize(fontSize: number): number {
  return (fontSize / FONT_SIZE) * 2;
}

export interface TextLayout {
  fontSize: number;
  padding: number;
  borderWidth: number;
  radius: number;
  lineHeight: number;
  lines: string[];
  /** Left edge of the text block. */
  originX: number;
  /** Top edge of the text block, vertically centred in the node. */
  originY: number;
}

export function fontSpecOf(node: PrgTextNode): FontSpec {
  return {
    family: node.fontFamily.length > 0 ? node.fontFamily : undefined,
    weight: node.fontWeight.length > 0 ? node.fontWeight : undefined,
  };
}

/**
 * Greedy per-character wrapping. Project Graph wraps on character boundaries
 * too, which keeps CJK text and mixed content predictable.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  measurer: TextMeasurer,
  font?: FontSpec,
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
      lines.push(paragraph);
      continue;
    }
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const character of paragraph) {
      const candidate = current + character;
      if (current.length > 0 && measurer.measureWidth(candidate, fontSize, font) > maxWidth) {
        lines.push(current);
        current = character;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function layoutTextNode(node: PrgTextNode, measurer: TextMeasurer): TextLayout {
  const fontSize = fontSizeForLevel(node.fontScaleLevel);
  const padding = paddingForFontSize(fontSize);
  const font = fontSpecOf(node);
  const maxWidth = node.sizeAdjust === "manual" ? node.rect.width - padding * 2 : Number.POSITIVE_INFINITY;
  const lines = wrapText(node.text, maxWidth, fontSize, measurer, font);
  const lineHeight = fontSize * LINE_HEIGHT;
  const blockHeight = lines.length * lineHeight;
  const contentTop = node.rect.y + padding;
  const contentHeight = Math.max(0, node.rect.height - padding * 2);
  // Centre the text block vertically. When the text is taller than the box it
  // starts at the top padding instead of overflowing upwards.
  const verticalOffset = Math.max(0, (contentHeight - blockHeight) / 2);
  return {
    fontSize,
    padding,
    borderWidth: borderWidthForFontSize(fontSize),
    radius: NODE_RADIUS,
    lineHeight,
    lines,
    originX: node.rect.x + padding,
    originY: contentTop + verticalOffset,
  };
}

/** Vertical centre of the line at `index`, for a `textBaseline = "middle"` draw. */
export function lineCenterY(layout: TextLayout, index: number): number {
  return layout.originY + index * layout.lineHeight + layout.lineHeight / 2;
}

export function textBlockHeight(layout: TextLayout): number {
  return layout.lines.length * layout.lineHeight;
}

/**
 * Grows a text node's box so the rendered text always fits.
 *
 * Boxes in `.prg` files were measured with Project Graph's own font. Our canvas
 * font can be a few percent wider, which made the last characters cross the
 * border. Enlarging (never shrinking) keeps the authored geometry intact while
 * guaranteeing the text is fully wrapped by its node.
 */
export function fitTextRect(node: PrgTextNode, measurer: TextMeasurer): Rect {
  const fontSize = fontSizeForLevel(node.fontScaleLevel);
  const padding = paddingForFontSize(fontSize);
  const font = fontSpecOf(node);
  const maxWidth =
    node.sizeAdjust === "manual" ? Math.max(0, node.rect.width - padding * 2) : Number.POSITIVE_INFINITY;
  const lines = wrapText(node.text, maxWidth, fontSize, measurer, font);
  let widest = 0;
  for (const line of lines) {
    widest = Math.max(widest, measurer.measureWidth(line, fontSize, font));
  }
  const width = Math.max(node.rect.width, widest + padding * 2);
  const height = Math.max(node.rect.height, lines.length * fontSize * LINE_HEIGHT + padding * 2);
  if (width === node.rect.width && height === node.rect.height) return node.rect;
  return { x: node.rect.x, y: node.rect.y, width, height };
}
