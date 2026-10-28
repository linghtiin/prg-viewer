import assert from "node:assert/strict";
import test from "node:test";
import {
  brightness,
  invertForContrast,
  isTransparent,
  resolveTextColor,
  rgbToHex,
  rgbaToCss,
} from "./color.ts";

test("transparency is alpha zero", () => {
  assert.equal(isTransparent({ r: 0, g: 0, b: 0, a: 0 }), true);
  assert.equal(isTransparent({ r: 0, g: 0, b: 0, a: 0.1 }), false);
});

test("contrast inverts to black or white", () => {
  assert.deepEqual(invertForContrast({ r: 255, g: 255, b: 255, a: 1 }), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(invertForContrast({ r: 10, g: 10, b: 10, a: 1 }), { r: 255, g: 255, b: 255, a: 1 });
  assert.ok(brightness({ r: 200, g: 200, b: 200, a: 1 }) > 128);
});

test("text colour resolves against the fill and the theme", () => {
  const themeText = { r: 220, g: 220, b: 220, a: 1 };
  const background = { r: 30, g: 30, b: 30, a: 1 };
  assert.deepEqual(resolveTextColor({ r: 0, g: 0, b: 0, a: 0 }, themeText), themeText);
  assert.deepEqual(resolveTextColor(background, themeText), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(resolveTextColor({ r: 255, g: 255, b: 255, a: 1 }, themeText), {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
  });
  assert.deepEqual(resolveTextColor({ r: 255, g: 0, b: 0, a: 0.2 }, themeText), themeText);
});

test("css helpers round values", () => {
  assert.equal(rgbaToCss({ r: 1.4, g: 2.6, b: 3, a: 0.5 }), "rgba(1, 3, 3, 0.5)");
  assert.equal(rgbToHex({ r: 255, g: 16, b: 0, a: 0 }), "#ff1000");
  assert.equal(rgbToHex({ r: 300, g: -5, b: 8, a: 0 }), "#ff0008");
});
