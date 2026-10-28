import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SCALE, MIN_SCALE } from "../constants.ts";
import { Camera } from "./camera.ts";

test("worldToScreen and screenToWorld round-trip", () => {
  const camera = new Camera({ x: -100, y: 50, scale: 2 });
  const world = { x: 30, y: -10 };
  const screen = camera.worldToScreen(world);
  assert.deepEqual(screen, { x: 260, y: -120 });
  const back = camera.screenToWorld(screen);
  assert.ok(Math.abs(back.x - world.x) < 1e-9);
  assert.ok(Math.abs(back.y - world.y) < 1e-9);
});

test("zoomAt keeps the anchor point stationary", () => {
  const camera = new Camera({ x: 0, y: 0, scale: 1 });
  const anchor = { x: 200, y: 120 };
  const before = camera.screenToWorld(anchor);
  camera.zoomAt(anchor, 2.5);
  const after = camera.screenToWorld(anchor);
  assert.ok(Math.abs(after.x - before.x) < 1e-9);
  assert.ok(Math.abs(after.y - before.y) < 1e-9);
  assert.equal(camera.scale, 2.5);
});

test("scale is clamped to the supported range", () => {
  const camera = new Camera();
  camera.zoomAt({ x: 0, y: 0 }, 1000);
  assert.equal(camera.scale, MAX_SCALE);
  camera.zoomAt({ x: 0, y: 0 }, 0.00001);
  assert.equal(camera.scale, MIN_SCALE);
});

test("panByScreen moves the scene with the pointer", () => {
  const camera = new Camera({ x: 0, y: 0, scale: 2 });
  const world = { x: 50, y: 50 };
  const before = camera.worldToScreen(world);
  camera.panByScreen(20, 10);
  const after = camera.worldToScreen(world);
  assert.deepEqual({ x: after.x - before.x, y: after.y - before.y }, { x: 20, y: 10 });
});

test("fit centres bounds and respects padding", () => {
  const camera = new Camera();
  const viewport = { width: 800, height: 600 };
  camera.fit({ x: 0, y: 0, width: 400, height: 200 }, viewport, 40);
  assert.equal(camera.scale, 1.8);
  const center = camera.worldToScreen({ x: 200, y: 100 });
  assert.ok(Math.abs(center.x - viewport.width / 2) < 1e-6);
  assert.ok(Math.abs(center.y - viewport.height / 2) < 1e-6);
});

test("fit of an empty document falls back to a usable camera", () => {
  const camera = new Camera();
  camera.fit({ x: 0, y: 0, width: 0, height: 0 }, { width: 800, height: 600 });
  assert.equal(camera.scale, 1);
  const origin = camera.worldToScreen({ x: 0, y: 0 });
  assert.deepEqual(origin, { x: 400, y: 300 });
});

test("worldViewport covers the visible area", () => {
  const camera = new Camera({ x: 0, y: 0, scale: 0.5 });
  const viewport = camera.worldViewport({ width: 800, height: 600 });
  assert.deepEqual(viewport, { x: 0, y: 0, width: 1600, height: 1200 });
});

test("fromState validates untrusted persisted values", () => {
  const restored = Camera.fromState({ x: 10, y: 20, scale: 2 });
  assert.deepEqual(restored.toJSON(), { x: 10, y: 20, scale: 2 });
  const broken = Camera.fromState({ x: "nope", y: 1, scale: 1 });
  assert.deepEqual(broken.toJSON(), { x: -400, y: -300, scale: 1 });
  const clamped = Camera.fromState({ x: 0, y: 0, scale: 9999 });
  assert.equal(clamped.scale, MAX_SCALE);
});
