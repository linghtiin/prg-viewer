import assert from "node:assert/strict";
import test from "node:test";
import type { PrgTextNode } from "../format/types.ts";
import { createApproximateTextMeasurer } from "./text-measurer.ts";
import {
  borderWidthForFontSize,
  fontSizeForLevel,
  layoutTextNode,
  lineCenterY,
  paddingForFontSize,
  textBlockHeight,
  wrapText,
} from "./text-layout.ts";

const measurer = createApproximateTextMeasurer();

function textNode(overrides: Partial<PrgTextNode> = {}): PrgTextNode {
  return {
    kind: "text",
    id: "t",
    rect: { x: 100, y: 100, width: 300, height: 80 },
    text: "hello",
    color: { r: 0, g: 0, b: 0, a: 0 },
    fontScaleLevel: 0,
    sizeAdjust: "auto",
    fontFamily: "",
    fontWeight: "",
    borderStyle: "solid",
    details: [],
    ...overrides,
  };
}

test("font size follows the half-step scale used by Project Graph", () => {
  assert.equal(fontSizeForLevel(0), 32);
  assert.equal(fontSizeForLevel(1), Math.floor(32 * Math.SQRT2));
  assert.equal(fontSizeForLevel(2), 64);
  assert.equal(fontSizeForLevel(-2), 16);
  assert.equal(fontSizeForLevel(-4), 8);
});

test("padding and border width scale with the font", () => {
  assert.equal(paddingForFontSize(32), 14);
  assert.equal(paddingForFontSize(64), 28);
  assert.equal(borderWidthForFontSize(32), 2);
  assert.equal(borderWidthForFontSize(64), 4);
});

test("wrapText breaks on the measured width", () => {
  const lines = wrapText("abcdef", 15, 10, measurer);
  assert.deepEqual(lines, ["abc", "def"]);
});

test("wrapText treats CJK characters as full width", () => {
  const lines = wrapText("中文", 15, 10, measurer);
  assert.deepEqual(lines, ["中", "文"]);
});

test("wrapText preserves explicit newlines", () => {
  assert.deepEqual(wrapText("a\n\nb", Number.POSITIVE_INFINITY, 10, measurer), ["a", "", "b"]);
  assert.deepEqual(wrapText("", Number.POSITIVE_INFINITY, 10, measurer), [""]);
});

test("auto nodes do not wrap, manual nodes wrap at the padding", () => {
  const auto = layoutTextNode(textNode({ text: "a".repeat(40) }), measurer);
  assert.equal(auto.lines.length, 1);
  assert.equal(auto.padding, 14);
  assert.equal(auto.borderWidth, 2);
  assert.equal(auto.radius, 16);
  assert.equal(auto.lineHeight, 48);

  const manual = layoutTextNode(
    textNode({ text: "a".repeat(10), sizeAdjust: "manual", rect: { x: 0, y: 0, width: 60, height: 80 } }),
    measurer,
  );
  assert.ok(manual.lines.length > 1);
  assert.ok(manual.lines.every((line) => measurer.measureWidth(line, 32) <= 60 - 28));
});

test("text origin includes padding and the font offset", () => {
  const layout = layoutTextNode(textNode({ rect: { x: 10, y: 20, width: 200, height: 80 } }), measurer);
  assert.equal(layout.originX, 24);
  assert.equal(layout.originY, 42);
  assert.equal(lineCenterY(layout, 0), 42 + 24);
  assert.equal(textBlockHeight(layout), 48);
});
