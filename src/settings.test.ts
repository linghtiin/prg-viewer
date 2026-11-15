import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";

test("returns defaults for empty or invalid input", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings("nope"), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings([]), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
});

test("merges valid fields and keeps defaults for the rest", () => {
  const settings = normalizeSettings({
    background: "grid",
    showOutlineByDefault: true,
    outlineMode: "category",
    wheelBehavior: "pan",
  });
  assert.equal(settings.background, "grid");
  assert.equal(settings.showOutlineByDefault, true);
  assert.equal(settings.outlineMode, "category");
  assert.equal(settings.wheelBehavior, "pan");
  assert.equal(settings.maxImageCacheMB, DEFAULT_SETTINGS.maxImageCacheMB);
});

test("defaults the outline to a node tree and rejects unknown modes", () => {
  assert.equal(DEFAULT_SETTINGS.outlineMode, "tree");
  assert.equal(normalizeSettings({ outlineMode: "graph" }).outlineMode, "tree");
  assert.equal(normalizeSettings({ outlineMode: 42 }).outlineMode, "tree");
});

test("clamps the outline width", () => {
  assert.equal(DEFAULT_SETTINGS.outlineWidth, 260);
  assert.equal(normalizeSettings({ outlineWidth: 320 }).outlineWidth, 320);
  assert.equal(normalizeSettings({ outlineWidth: 1 }).outlineWidth, 200);
  assert.equal(normalizeSettings({ outlineWidth: 100000 }).outlineWidth, 720);
  assert.equal(normalizeSettings({ outlineWidth: Number.NaN }).outlineWidth, 260);
});

test("clamps the details ratio and treats zero as auto", () => {
  assert.equal(DEFAULT_SETTINGS.detailsRatio, 0);
  assert.equal(normalizeSettings({ detailsRatio: 0 }).detailsRatio, 0);
  assert.equal(normalizeSettings({ detailsRatio: 0.5 }).detailsRatio, 0.5);
  assert.equal(normalizeSettings({ detailsRatio: -1 }).detailsRatio, 0);
  assert.equal(normalizeSettings({ detailsRatio: 0.01 }).detailsRatio, 0.12);
  assert.equal(normalizeSettings({ detailsRatio: 0.99 }).detailsRatio, 0.85);
  assert.equal(normalizeSettings({ detailsRatio: Number.NaN }).detailsRatio, 0);
  assert.equal(normalizeSettings({ detailsRatio: "0.5" }).detailsRatio, 0);
});

test("defaults to wheel-to-zoom and rejects unknown wheel modes", () => {
  assert.equal(DEFAULT_SETTINGS.wheelBehavior, "zoom");
  assert.equal(normalizeSettings({ wheelBehavior: "sparkles" }).wheelBehavior, "zoom");
  assert.equal(normalizeSettings({ wheelBehavior: 42 }).wheelBehavior, "zoom");
});

test("rejects invalid values and clamps the cache budget", () => {
  const settings = normalizeSettings({
    background: "sparkles",
    wheelBehavior: "nope",
    showOutlineByDefault: "yes",
    rememberCameraPerFile: 1,
    maxImageCacheMB: 100000,
    debugLogging: "true",
  });
  assert.equal(settings.background, "none");
  assert.equal(settings.wheelBehavior, "zoom");
  assert.equal(settings.showOutlineByDefault, false);
  assert.equal(settings.rememberCameraPerFile, true);
  assert.equal(settings.maxImageCacheMB, 512);
  assert.equal(settings.debugLogging, false);
  assert.equal(normalizeSettings({ maxImageCacheMB: 1 }).maxImageCacheMB, 8);
  assert.equal(normalizeSettings({ maxImageCacheMB: Number.NaN }).maxImageCacheMB, 64);
});
