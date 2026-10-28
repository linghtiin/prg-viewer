import assert from "node:assert/strict";
import test from "node:test";
import { buildPrg, collisionBox, lineEdge, sectionNode, textNode } from "../../test/helpers/build-prg.ts";
import { parsePrg } from "../format/build-document.ts";
import {
  buildScene,
  canvasOrder,
  edgeBounds,
  edgesInViewport,
  findNode,
  hitTestNode,
  nodesInRect,
  nodesInViewport,
} from "./scene.ts";

test("builds nodes, edges and bounds", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a", { collisionBox: collisionBox(0, 0, 100, 50) }),
        textNode("b", { collisionBox: collisionBox(300, 0, 100, 50) }),
        lineEdge("e", "/0", "/1"),
      ],
    }),
  );
  const scene = buildScene(document);
  assert.deepEqual(
    scene.nodes.map((node) => node.id),
    ["a", "b"],
  );
  assert.equal(scene.edges.length, 1);
  const geometry = scene.edges[0]?.geometry;
  assert.ok(geometry);
  assert.deepEqual(geometry.start, { x: 100, y: 25 });
  assert.deepEqual(geometry.end, { x: 300, y: 25 });
  assert.deepEqual(scene.bounds, { x: 0, y: 0, width: 400, height: 50 });
});

test("sections are ordered by depth and painting order is stable", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        sectionNode("outer", [textNode("child"), sectionNode("inner", [textNode("deep")])]),
        textNode("loose"),
      ],
    }),
  );
  const scene = buildScene(document);
  assert.deepEqual(
    scene.sections.map((section) => section.id),
    ["outer", "inner"],
  );
  assert.deepEqual(
    scene.nodes.map((node) => node.id),
    ["child", "deep", "loose"],
  );
  assert.deepEqual(
    canvasOrder(scene).map((node) => node.id),
    ["outer", "inner", "child", "deep", "loose"],
  );
});

test("collapsed sections hide their descendants and their edges", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        sectionNode("s", [textNode("c")], { isCollapsed: true }),
        textNode("o"),
        lineEdge("e", "/0/children/0", "/1"),
      ],
    }),
  );
  const scene = buildScene(document);
  assert.deepEqual([...scene.hiddenIds], ["c"]);
  assert.deepEqual(
    scene.nodes.map((node) => node.id),
    ["o"],
  );
  assert.deepEqual(
    scene.sections.map((section) => section.id),
    ["s"],
  );
  assert.equal(scene.edges.length, 0);
  assert.deepEqual(scene.bounds, { x: -20, y: -40, width: 400, height: 300 });
});

test("hit testing returns the topmost node", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("bottom", { collisionBox: collisionBox(0, 0, 100, 50) }),
        textNode("top", { collisionBox: collisionBox(0, 0, 100, 50) }),
      ],
    }),
  );
  const scene = buildScene(document);
  assert.equal(hitTestNode(scene, { x: 10, y: 10 })?.id, "top");
  assert.equal(hitTestNode(scene, { x: 500, y: 500 }), null);
});

test("viewport filtering keeps only intersecting nodes and edges", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("near", { collisionBox: collisionBox(0, 0, 100, 50) }),
        textNode("far", { collisionBox: collisionBox(1000, 1000, 100, 50) }),
        lineEdge("e", "/0", "/1"),
      ],
    }),
  );
  const scene = buildScene(document);
  const viewport = { x: 0, y: 0, width: 200, height: 200 };
  assert.deepEqual(
    nodesInViewport(scene, viewport).map((node) => node.id),
    ["near"],
  );
  assert.deepEqual(
    nodesInRect(scene, viewport).map((node) => node.id),
    ["near"],
  );
  // The edge starts at the right border of "near", inside the viewport.
  assert.equal(edgesInViewport(scene, viewport).length, 1);

  const offscreen = { x: -2000, y: -2000, width: 100, height: 100 };
  assert.equal(nodesInViewport(scene, offscreen).length, 0);
  assert.equal(edgesInViewport(scene, offscreen).length, 0);

  const bounds = edgeBounds(scene.edges[0]?.geometry as NonNullable<(typeof scene.edges)[0]>["geometry"]);
  assert.ok(bounds.x <= 100);
  assert.ok(bounds.width >= 900);
  assert.ok(bounds.height >= 900);
});

test("findNode looks up nodes by id", () => {
  const document = parsePrg(buildPrg({ stage: [textNode("only")] }));
  const scene = buildScene(document);
  assert.equal(findNode(scene, "only")?.id, "only");
  assert.equal(findNode(scene, "missing"), undefined);
});

test("an empty document yields an empty scene", () => {
  const scene = buildScene(parsePrg(buildPrg({ stage: [] })));
  assert.deepEqual(scene.nodes, []);
  assert.deepEqual(scene.edges, []);
  assert.deepEqual(scene.bounds, { x: 0, y: 0, width: 0, height: 0 });
});
