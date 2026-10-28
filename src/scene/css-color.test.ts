import assert from "node:assert/strict";
import test from "node:test";
import { parseCssColor } from "./css-color.ts";

test("parses hex colours with 3, 4, 6 and 8 digits", () => {
  assert.deepEqual(parseCssColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseCssColor("#0000"), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(parseCssColor("#ff8800"), { r: 255, g: 136, b: 0, a: 1 });
  assert.deepEqual(parseCssColor("#ff880080"), { r: 255, g: 136, b: 0, a: 128 / 255 });
});

test("parses rgb and rgba with commas or spaces", () => {
  assert.deepEqual(parseCssColor("rgb(1, 2, 3)"), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseCssColor("rgba(1,2,3,0.5)"), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.deepEqual(parseCssColor("rgb(255 0 0 / 50%)"), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseCssColor("rgb(100% 0% 0%)"), { r: 255, g: 0, b: 0, a: 1 });
});

test("falls back for unsupported formats", () => {
  const fallback = { r: 1, g: 2, b: 3, a: 1 };
  assert.deepEqual(parseCssColor("oklch(0.5 0.2 120)", fallback), fallback);
  assert.deepEqual(parseCssColor("transparent", fallback), fallback);
  assert.deepEqual(parseCssColor("", fallback), fallback);
  assert.deepEqual(parseCssColor("#zzz", fallback), fallback);
  assert.deepEqual(parseCssColor("rgb(1,2)", fallback), fallback);
});
