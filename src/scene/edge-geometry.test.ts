import assert from "node:assert/strict";
import test from "node:test";
import {
  anchorPoint,
  computeEdgeGeometry,
  edgeEndDirection,
  edgeMidpoint,
  isCenterRate,
  normalForRate,
  sampleEdge,
} from "./edge-geometry.ts";

const left = { x: 0, y: 0, width: 100, height: 50 };
const right = { x: 300, y: 0, width: 100, height: 50 };

test("sentinel rates map to exact edge centres", () => {
  assert.deepEqual(anchorPoint(left, { x: 0.99, y: 0.5 }), { x: 100, y: 25 });
  assert.deepEqual(anchorPoint(left, { x: 0.01, y: 0.5 }), { x: 0, y: 25 });
  assert.deepEqual(anchorPoint(left, { x: 0.5, y: 0.01 }), { x: 50, y: 0 });
  assert.deepEqual(anchorPoint(left, { x: 0.5, y: 0.99 }), { x: 50, y: 50 });
  assert.deepEqual(anchorPoint(left, { x: 0.25, y: 0.75 }), { x: 25, y: 37.5 });
});

test("x sentinels win over y sentinels, matching the reference implementation", () => {
  assert.deepEqual(anchorPoint(left, { x: 0.01, y: 0.01 }), { x: 0, y: 25 });
  assert.equal(normalForRate({ x: 0.99, y: 0.01 })?.x, 1);
  assert.equal(normalForRate({ x: 0.3, y: 0.3 }), null);
  assert.equal(isCenterRate({ x: 0.5, y: 0.5 }), true);
});

test("horizontal edge between right and left centres gets symmetric control points", () => {
  const geometry = computeEdgeGeometry(left, right, { x: 0.99, y: 0.5 }, { x: 0.01, y: 0.5 });
  assert.deepEqual(geometry.start, { x: 100, y: 25 });
  assert.deepEqual(geometry.end, { x: 300, y: 25 });
  assert.equal(geometry.selfLoop, false);
  assert.deepEqual(geometry.control1, { x: 200, y: 25 });
  assert.deepEqual(geometry.control2, { x: 200, y: 25 });
  assert.deepEqual(edgeMidpoint(geometry), { x: 200, y: 25 });
});

test("centre rates clip the centre line against the rectangle boundary", () => {
  const geometry = computeEdgeGeometry(left, right, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
  assert.deepEqual(geometry.start, { x: 100, y: 25 });
  assert.deepEqual(geometry.end, { x: 300, y: 25 });
});

test("vertical edges bend along the vertical normals", () => {
  const below = { x: 0, y: 300, width: 100, height: 50 };
  const geometry = computeEdgeGeometry(left, below, { x: 0.5, y: 0.99 }, { x: 0.5, y: 0.01 });
  assert.deepEqual(geometry.start, { x: 50, y: 50 });
  assert.deepEqual(geometry.end, { x: 50, y: 300 });
  assert.equal(geometry.control1.x, 50);
  assert.ok(geometry.control1.y > 50);
  assert.equal(geometry.control2.x, 50);
  assert.ok(geometry.control2.y < 300);
});

test("self loops connect the right and top edges outward", () => {
  const geometry = computeEdgeGeometry(left, left, { x: 0.99, y: 0.5 }, { x: 0.5, y: 0.01 });
  assert.equal(geometry.selfLoop, true);
  assert.deepEqual(geometry.start, { x: 100, y: 25 });
  assert.deepEqual(geometry.end, { x: 50, y: 0 });
  assert.ok(geometry.control1.x > 100);
  assert.ok(geometry.control2.y < 0);
});

test("edge direction and sampling stay usable", () => {
  const geometry = computeEdgeGeometry(left, right, { x: 0.99, y: 0.5 }, { x: 0.01, y: 0.5 });
  const direction = edgeEndDirection(geometry);
  assert.ok(direction.x > 0.9);
  const samples = sampleEdge(geometry, 4);
  assert.equal(samples.length, 5);
  assert.deepEqual(samples[0], geometry.start);
  assert.deepEqual(samples[4], geometry.end);
});

test("overlapping rectangles degrade to a straight segment", () => {
  const geometry = computeEdgeGeometry(
    { x: 0, y: 0, width: 100, height: 50 },
    { x: 50, y: 10, width: 100, height: 50 },
    { x: 0.99, y: 0.5 },
    { x: 0.01, y: 0.5 },
  );
  assert.equal(geometry.selfLoop, false);
  assert.ok(Number.isFinite(geometry.start.x));
  assert.ok(Number.isFinite(geometry.end.x));
});
