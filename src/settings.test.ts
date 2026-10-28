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
  const settings = normalizeSettings({ background: "grid", showOutlineByDefault: true });
  assert.equal(settings.background, "grid");
  assert.equal(settings.showOutlineByDefault, true);
  assert.equal(settings.maxImageCacheMB, DEFAULT_SETTINGS.maxImageCacheMB);
});

test("rejects invalid values and clamps the cache budget", () => {
  const settings = normalizeSettings({
    background: "sparkles",
    showOutlineByDefault: "yes",
    rememberCameraPerFile: 1,
    maxImageCacheMB: 100000,
    debugLogging: "true",
  });
  assert.equal(settings.background, "none");
  assert.equal(settings.showOutlineByDefault, false);
  assert.equal(settings.rememberCameraPerFile, true);
  assert.equal(settings.maxImageCacheMB, 512);
  assert.equal(settings.debugLogging, false);
  assert.equal(normalizeSettings({ maxImageCacheMB: 1 }).maxImageCacheMB, 8);
  assert.equal(normalizeSettings({ maxImageCacheMB: Number.NaN }).maxImageCacheMB, 64);
});
