import assert from "node:assert/strict";
import test from "node:test";
import { resolveWheelAction, WHEEL_ZOOM_SENSITIVITY } from "./input.ts";

const base = { deltaX: 0, deltaY: 100 };

test("default behaviour: plain wheel zooms, modified wheel pans", () => {
  const zoom = resolveWheelAction({ ...base, behavior: "zoom", ctrlKey: false, metaKey: false });
  assert.equal(zoom.kind, "zoom");
  if (zoom.kind === "zoom") {
    assert.ok(zoom.factor < 1, "scrolling down should zoom out");
    assert.ok(Math.abs(zoom.factor - Math.exp(-100 * WHEEL_ZOOM_SENSITIVITY)) < 1e-12);
  }

  const pan = resolveWheelAction({ ...base, behavior: "zoom", ctrlKey: true, metaKey: false });
  assert.deepEqual(pan, { kind: "pan", dx: 0, dy: -100 });

  const panMeta = resolveWheelAction({ ...base, behavior: "zoom", ctrlKey: false, metaKey: true });
  assert.deepEqual(panMeta, { kind: "pan", dx: 0, dy: -100 });
});

test("swapped behaviour: plain wheel pans, modified wheel zooms", () => {
  const pan = resolveWheelAction({ ...base, behavior: "pan", ctrlKey: false, metaKey: false });
  assert.deepEqual(pan, { kind: "pan", dx: 0, dy: -100 });

  const zoom = resolveWheelAction({ ...base, behavior: "pan", ctrlKey: true, metaKey: false });
  assert.equal(zoom.kind, "zoom");
});

test("horizontal wheel deltas pan sideways", () => {
  const action = resolveWheelAction({
    behavior: "pan",
    ctrlKey: false,
    metaKey: false,
    deltaX: 40,
    deltaY: 0,
  });
  assert.deepEqual(action, { kind: "pan", dx: -40, dy: 0 });
});

test("scrolling up zooms in", () => {
  const action = resolveWheelAction({
    behavior: "zoom",
    ctrlKey: false,
    metaKey: false,
    deltaX: 0,
    deltaY: -100,
  });
  assert.equal(action.kind, "zoom");
  if (action.kind === "zoom") assert.ok(action.factor > 1);
});
