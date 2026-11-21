import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrg,
  collisionBox,
  imageNode,
  latexNode,
  lineEdge,
  sectionNode,
  textNode,
} from "../../test/helpers/build-prg.ts";
import { parsePrg } from "../format/build-document.ts";
import type { PrgDocument } from "../format/types.ts";
import {
  buildContainmentTree,
  buildEdgeTree,
  buildOutlineGroups,
  collapsibleOutlineIds,
  flattenOutline,
  groupForOutline,
  outlineAncestors,
  resolveOutlineNavigation,
  type OutlineTreeNode,
} from "./outline-panel.ts";

function ids(entries: readonly OutlineTreeNode[]): string[] {
  return entries.map((entry) => entry.node.id);
}

function flatten(entries: readonly OutlineTreeNode[]): string[] {
  const result: string[] = [];
  const visit = (nodes: readonly OutlineTreeNode[]): void => {
    for (const entry of nodes) {
      result.push(entry.node.id);
      visit(entry.children);
    }
  };
  visit(entries);
  return result;
}

function nestedDocument(): PrgDocument {
  return parsePrg(
    buildPrg({
      stage: [
        textNode("a", { collisionBox: collisionBox(0, 0, 100, 50) }),
        sectionNode("s", [textNode("b"), sectionNode("inner", [textNode("c")])]),
        textNode("d"),
      ],
    }),
  );
}

test("containment tree nests frames and the entities inside them", () => {
  const roots = buildContainmentTree(nestedDocument());
  assert.deepEqual(ids(roots), ["s"]);
  const section = roots[0];
  assert.ok(section);
  assert.deepEqual(ids(section.children), ["b", "inner"]);
  const inner = section.children[1];
  assert.ok(inner);
  assert.deepEqual(ids(inner.children), ["c"]);
});

test("every frame outside another frame is a containment root", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("s1", [textNode("b")]), sectionNode("s2", [textNode("c")])],
    }),
  );
  const roots = buildContainmentTree(document);
  assert.deepEqual(ids(roots), ["s1", "s2"]);
  assert.deepEqual(flatten(roots), ["s1", "b", "s2", "c"]);
});

test("a node listed both inside a section and at the top level appears once", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("s", [textNode("b")]), textNode("b")],
    }),
  );
  const roots = buildContainmentTree(document);
  assert.deepEqual(ids(roots), ["s"]);
  assert.deepEqual(flatten(roots), ["s", "b"]);
});

test("a child listed before its section still belongs to that section", () => {
  const document = parsePrg(
    buildPrg({
      stage: [textNode("b"), sectionNode("s", [textNode("b")])],
    }),
  );
  assert.equal(document.order[0], "b");
  const roots = buildContainmentTree(document);
  assert.deepEqual(ids(roots), ["s"]);
  assert.deepEqual(flatten(roots), ["s", "b"]);
});

test("two sections claiming the same child keep the first declaration", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("s1", [textNode("x")]), sectionNode("s2", [textNode("x")])],
    }),
  );
  const roots = buildContainmentTree(document);
  assert.deepEqual(ids(roots), ["s1", "s2"]);
  assert.deepEqual(ids(roots[0]?.children ?? []), ["x"]);
  assert.deepEqual(ids(roots[1]?.children ?? []), []);
  assert.deepEqual(flatten(roots), ["s1", "x", "s2"]);
});

test("cyclic containment references are broken and every node appears once", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("a", [sectionNode("b", [sectionNode("a", [])])])],
    }),
  );
  const roots = buildContainmentTree(document);
  assert.deepEqual(flatten(roots), ["a", "b"]);
  assert.deepEqual(ids(roots[0]?.children ?? []), ["b"]);
});

test("missing and self child references are ignored", () => {
  const document = parsePrg(buildPrg({ stage: [sectionNode("s", [])] }));
  const section = document.nodes.get("s");
  assert.ok(section?.kind === "section");
  section.children.push("missing", "s");
  document.order.push("missing");

  const roots = buildContainmentTree(document);
  assert.deepEqual(ids(roots), ["s"]);
  assert.deepEqual(flatten(roots), ["s"]);
  assert.deepEqual(collapsibleOutlineIds(document), []);
});

test("connection forest nests by directed edges", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("root"),
        textNode("a"),
        textNode("leaf"),
        textNode("b"),
        lineEdge("e1", "/0", "/1"),
        lineEdge("e2", "/1", "/2"),
        lineEdge("e3", "/0", "/3"),
      ],
    }),
  );
  const roots = buildEdgeTree(document);
  assert.deepEqual(ids(roots), ["root"]);
  const root = roots[0];
  assert.ok(root);
  assert.deepEqual(ids(root.children), ["a", "b"]);
  assert.deepEqual(ids(root.children[0]?.children ?? []), ["leaf"]);
  assert.deepEqual(flatten(roots), ["root", "a", "leaf", "b"]);
  assert.deepEqual(collapsibleOutlineIds(document), ["root", "a"]);
});

test("connection-derived children follow the canvas reading order", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("root"),
        textNode("lower", { collisionBox: collisionBox(0, 300, 100, 50) }),
        textNode("upper", { collisionBox: collisionBox(0, 100, 100, 50) }),
        lineEdge("e1", "/0", "/1"),
        lineEdge("e2", "/0", "/2"),
      ],
    }),
  );
  const roots = buildEdgeTree(document);
  assert.deepEqual(ids(roots[0]?.children ?? []), ["upper", "lower"]);
});

test("multiple incoming edges keep the first edge as the parent", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("root1"),
        textNode("root2"),
        textNode("child"),
        lineEdge("e1", "/0", "/2"),
        lineEdge("e2", "/1", "/2"),
      ],
    }),
  );
  const roots = buildEdgeTree(document);
  assert.deepEqual(ids(roots), ["root1", "root2"]);
  assert.deepEqual(ids(roots[0]?.children ?? []), ["child"]);
  assert.deepEqual(ids(roots[1]?.children ?? []), []);
  assert.deepEqual(flatten(roots), ["root1", "child", "root2"]);
});

test("edge cycles are broken and every node appears once", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        textNode("b"),
        textNode("c"),
        lineEdge("e1", "/0", "/1"),
        lineEdge("e2", "/1", "/2"),
        lineEdge("e3", "/2", "/0"),
      ],
    }),
  );
  const roots = buildEdgeTree(document);
  assert.deepEqual(ids(roots), ["a"]);
  assert.deepEqual(flatten(roots), ["a", "b", "c"]);
});

test("a frame around a connected node never enters the connection chain", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        sectionNode("frame", [textNode("b")]),
        textNode("c"),
        lineEdge("e1", "/0", "/1/children/0"),
        lineEdge("e2", "/1/children/0", "/2"),
      ],
    }),
  );
  const roots = buildEdgeTree(document);
  // The edge goes from node `a` to node `b`; the frame is not part of that chain.
  assert.deepEqual(ids(roots), ["a"]);
  assert.deepEqual(ids(roots[0]?.children ?? []), ["b"]);
  assert.deepEqual(ids(roots[0]?.children[0]?.children ?? []), ["c"]);
  // The frame still groups `b` in the containment tree.
  assert.deepEqual(ids(buildContainmentTree(document)), ["frame"]);
});

test("an edge into a frame keeps that frame a leaf of the connection forest", () => {
  const document = parsePrg(
    buildPrg({
      stage: [textNode("a"), sectionNode("frame", [textNode("b")]), lineEdge("e", "/0", "/1")],
    }),
  );
  const roots = buildEdgeTree(document);
  assert.deepEqual(ids(roots), ["a"]);
  assert.deepEqual(ids(roots[0]?.children ?? []), ["frame"]);
  assert.deepEqual(ids(roots[0]?.children[0]?.children ?? []), []);
  const containment = buildContainmentTree(document);
  assert.deepEqual(ids(containment), ["frame"]);
  assert.deepEqual(ids(containment[0]?.children ?? []), ["b"]);
});

test("a frame no edge points at stays out of the connection forest", () => {
  const document = parsePrg(
    buildPrg({
      stage: [textNode("a"), sectionNode("frame", [textNode("b")])],
    }),
  );
  const roots = buildEdgeTree(document);
  // `a` is not connected either; it is a standalone tree of its own.
  assert.deepEqual(ids(roots), ["a"]);
  assert.deepEqual(ids(roots[0]?.children ?? []), []);
});

test("tree groups use containment under 分组 and connections by root kind", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("t"),
        sectionNode("frame", [textNode("b")]),
        latexNode("l", "x^2"),
        lineEdge("e", "/2", "/0"),
      ],
    }),
  );
  const groups = buildOutlineGroups(document);
  assert.deepEqual(
    groups.map((group) => group.title),
    ["分组", "公式"],
  );
  assert.deepEqual(
    groups.map((group) => ids(group.entries)),
    [["frame"], ["l"]],
  );
  assert.deepEqual(ids(groups[0]?.entries[0]?.children ?? []), ["b"]);
  assert.deepEqual(ids(groups[1]?.entries[0]?.children ?? []), ["t"]);
});

test("a frame can appear in both groups with different children and navigation keys", () => {
  const document = parsePrg(
    buildPrg({
      stage: [textNode("a"), sectionNode("frame", [textNode("b")]), lineEdge("e", "/0", "/1")],
    }),
  );
  const rows = flattenOutline(document);
  assert.deepEqual(
    rows.map((row) => row.key),
    ["分组:frame", "分组:b", "文本:a", "文本:frame"],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["frame", "b", "a", "frame"],
  );
  assert.deepEqual(
    rows.map((row) => row.parentKey),
    [null, "分组:frame", null, "文本:a"],
  );
  // The two appearances navigate independently: right from the 分组 root opens
  // its contained node, while the 文本 frame is a leaf.
  assert.deepEqual(resolveOutlineNavigation(rows, "分组:frame", "right"), {
    kind: "select",
    id: "b",
  });
  assert.equal(resolveOutlineNavigation(rows, "文本:frame", "right"), null);
  assert.deepEqual(resolveOutlineNavigation(rows, "分组:b", "left"), {
    kind: "select",
    id: "frame",
  });
});

test("outlineAncestors returns the chain from the root to the parent", () => {
  const document = nestedDocument();
  assert.deepEqual(outlineAncestors(document, "c"), ["s", "inner"]);
  assert.deepEqual(outlineAncestors(document, "b"), ["s"]);
  assert.deepEqual(outlineAncestors(document, "a"), []);
  assert.deepEqual(outlineAncestors(document, "missing"), []);
});

test("outlineAncestors merges the chains of a node that appears in two groups", () => {
  const document = parsePrg(
    buildPrg({
      stage: [textNode("a"), sectionNode("frame", [textNode("b")]), lineEdge("e", "/0", "/1")],
    }),
  );
  assert.deepEqual(outlineAncestors(document, "frame"), ["a"]);
  assert.deepEqual(outlineAncestors(document, "b"), ["frame"]);
});

test("collapsibleOutlineIds only contains nodes with children", () => {
  const document = nestedDocument();
  assert.deepEqual(collapsibleOutlineIds(document), ["s", "inner"]);
});

test("flattenOutline follows display order and skips collapsed children", () => {
  const document = nestedDocument();
  const all = flattenOutline(document);
  // 分组 comes first (containment), then the connection trees by root kind.
  assert.deepEqual(
    all.map((row) => row.id),
    ["s", "b", "inner", "c", "a", "d"],
  );
  assert.deepEqual(
    all.map((row) => row.parentId),
    [null, "s", "s", "inner", null, null],
  );
  assert.deepEqual(
    all.map((row) => row.hasChildren),
    [true, false, true, false, false, false],
  );

  assert.deepEqual(
    flattenOutline(document, new Set(["s"])).map((row) => row.id),
    ["s", "a", "d"],
  );
  assert.deepEqual(
    flattenOutline(document, new Set(["inner"])).map((row) => row.id),
    ["s", "b", "inner", "a", "d"],
  );
});

test("resolveOutlineNavigation moves through rows and branches", () => {
  const rows = flattenOutline(nestedDocument());
  const select = (id: string | null, direction: "up" | "down" | "left" | "right"): string | null => {
    const move = resolveOutlineNavigation(rows, id, direction);
    return move?.kind === "select" ? move.id : null;
  };

  assert.equal(select(null, "down"), "s");
  assert.equal(select("s", "down"), "b");
  assert.equal(select("s", "up"), null);
  assert.equal(select("d", "down"), null);
  assert.equal(select("s", "right"), "b");
  assert.equal(select("inner", "left"), "s");
  assert.equal(select("s", "left"), null);
  assert.equal(select("b", "right"), null);
});

test("resolveOutlineNavigation collapses and expands tree branches", () => {
  const rows = flattenOutline(nestedDocument());
  const options = { allowCollapse: true, collapsed: new Set<string>() };

  assert.equal(resolveOutlineNavigation(rows, "s", "left", options)?.kind, "collapse");
  assert.equal(resolveOutlineNavigation(rows, "s", "right", options)?.kind, "select");

  const collapsed = new Set(["s"]);
  assert.equal(
    resolveOutlineNavigation(rows, "s", "right", { allowCollapse: true, collapsed })?.kind,
    "expand",
  );
  assert.equal(resolveOutlineNavigation(rows, "s", "left", { allowCollapse: true, collapsed }), null);

  const flat = flattenOutline(nestedDocument()).map((row) => ({
    key: row.key,
    id: row.id,
    parentId: null,
    parentKey: null,
    hasChildren: false,
  }));
  assert.equal(resolveOutlineNavigation(flat, "a", "left"), null);
  assert.equal(resolveOutlineNavigation(flat, "a", "right"), null);
});

test("groupForOutline keeps the kind order and document order inside a group", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("t1"),
        sectionNode("s", [textNode("t2")]),
        latexNode("l", "x^2"),
        imageNode("i", "att"),
        { _: "FutureNode", uuid: "u", collisionBox: collisionBox(10, 10, 10, 10) },
      ],
    }),
  );
  const groups = groupForOutline(document);
  assert.deepEqual(
    groups.map((group) => group.title),
    ["分组", "文本", "公式", "图片", "其他"],
  );
  assert.deepEqual(
    groups.map((group) => group.nodes.map((node) => node.id)),
    [["s"], ["t1", "t2"], ["l"], ["i"], ["u"]],
  );
});

test("an empty document yields an empty outline", () => {
  const document = parsePrg(buildPrg({ stage: [] }));
  assert.deepEqual(buildContainmentTree(document), []);
  assert.deepEqual(buildEdgeTree(document), []);
  assert.deepEqual(buildOutlineGroups(document), []);
  assert.deepEqual(groupForOutline(document), []);
  assert.deepEqual(collapsibleOutlineIds(document), []);
});
