import assert from "node:assert/strict";
import test from "node:test";
import {
  addVec,
  clamp,
  cubicPointAt,
  normalizeRect,
  normalizeVec,
  pointInRect,
  rectCenter,
  rectEdgeNormalAt,
  rectLineIntersectionFromCenter,
  rectsIntersect,
  rotateVecDegrees,
  roundRect,
  unionRect,
  unionRects,
  vecLength,
} from "./geometry.ts";

test("rect helpers compute edges, centre and normalisation", () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };
  assert.deepEqual(rectCenter(rect), { x: 60, y: 45 });
  assert.deepEqual(normalizeRect({ x: 10, y: 20, width: -100, height: -50 }), {
    x: -90,
    y: -30,
    width: 100,
    height: 50,
  });
  assert.deepEqual(roundRect({ x: 10.4, y: 20.6, width: 100.2, height: 50.8 }), {
    x: 10,
    y: 21,
    width: 101,
    height: 50,
  });
});

test("point and rectangle intersection are inclusive on the border", () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(pointInRect({ x: 0, y: 0 }, rect), true);
  assert.equal(pointInRect({ x: 10, y: 10 }, rect), true);
  assert.equal(pointInRect({ x: 10.01, y: 5 }, rect), false);
  assert.equal(rectsIntersect(rect, { x: 10, y: 10, width: 5, height: 5 }), true);
  assert.equal(rectsIntersect(rect, { x: 11, y: 11, width: 5, height: 5 }), false);
});

test("union helpers produce the bounding rectangle", () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  const b = { x: 20, y: 5, width: 10, height: 10 };
  assert.deepEqual(unionRect(a, b), { x: 0, y: 0, width: 30, height: 15 });
  assert.deepEqual(unionRects([a, b]), { x: 0, y: 0, width: 30, height: 15 });
  assert.deepEqual(unionRects([]), { x: 0, y: 0, width: 0, height: 0 });
});

test("rectLineIntersectionFromCenter clips at the nearest border", () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };
  const right = rectLineIntersectionFromCenter(rect, { x: 1000, y: 25 });
  assert.deepEqual(right, { x: 100, y: 25 });
  const bottom = rectLineIntersectionFromCenter(rect, { x: 50, y: 1000 });
  assert.deepEqual(bottom, { x: 50, y: 50 });
  assert.deepEqual(rectLineIntersectionFromCenter(rect, { x: 50, y: 25 }), { x: 50, y: 25 });
});

test("rectEdgeNormalAt picks the closest edge", () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };
  assert.deepEqual(rectEdgeNormalAt(rect, { x: 100, y: 25 }), { x: 1, y: 0 });
  assert.deepEqual(rectEdgeNormalAt(rect, { x: 50, y: 0 }), { x: 0, y: -1 });
  assert.deepEqual(rectEdgeNormalAt(rect, { x: 0, y: 25 }), { x: -1, y: 0 });
  assert.deepEqual(rectEdgeNormalAt(rect, { x: 50, y: 50 }), { x: 0, y: 1 });
});

test("vector helpers behave on degenerate input", () => {
  assert.deepEqual(normalizeVec({ x: 0, y: 0 }), { x: 0, y: 0 });
  assert.equal(vecLength({ x: 3, y: 4 }), 5);
  assert.deepEqual(addVec({ x: 1, y: 2 }, { x: 3, y: 4 }), { x: 4, y: 6 });
  const rotated = rotateVecDegrees({ x: 1, y: 0 }, 90);
  assert.ok(Math.abs(rotated.x) < 1e-9 && Math.abs(rotated.y - 1) < 1e-9);
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-4, 0, 3), 0);
});

test("cubicPointAt interpolates between the endpoints", () => {
  const start = { x: 0, y: 0 };
  const control1 = { x: 10, y: 0 };
  const control2 = { x: 20, y: 10 };
  const end = { x: 30, y: 10 };
  assert.deepEqual(cubicPointAt(start, control1, control2, end, 0), start);
  assert.deepEqual(cubicPointAt(start, control1, control2, end, 1), end);
  const middle = cubicPointAt(start, control1, control2, end, 0.5);
  assert.ok(middle.x > 0 && middle.x < 30);
});
