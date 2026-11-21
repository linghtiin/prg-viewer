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
  buildOutlineTree,
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

test("buildOutlineTree nests children and keeps document order at the roots", () => {
  const tree = buildOutlineTree(nestedDocument());
  assert.deepEqual(ids(tree), ["a", "s", "d"]);
  const section = tree[1];
  assert.ok(section);
  assert.deepEqual(ids(section.children), ["b", "inner"]);
  const inner = section.children[1];
  assert.ok(inner);
  assert.deepEqual(ids(inner.children), ["c"]);
});

test("a node listed both inside a section and at the top level appears once", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("s", [textNode("b")]), textNode("b")],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["s"]);
  assert.deepEqual(flatten(tree), ["s", "b"]);
});

test("a child listed before its section still belongs to that section", () => {
  const document = parsePrg(
    buildPrg({
      stage: [textNode("b"), sectionNode("s", [textNode("b")])],
    }),
  );
  assert.equal(document.order[0], "b");
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["s"]);
  assert.deepEqual(flatten(tree), ["s", "b"]);
});

test("two sections claiming the same child keep the first declaration", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("s1", [textNode("x")]), sectionNode("s2", [textNode("x")])],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["s1", "s2"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["x"]);
  assert.deepEqual(ids(tree[1]?.children ?? []), []);
  assert.deepEqual(flatten(tree), ["s1", "x", "s2"]);
});

test("cyclic section references are broken and every node appears once", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("a", [sectionNode("b", [sectionNode("a", [])])])],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(flatten(tree), ["a", "b"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["b"]);
});

test("missing and self child references are ignored", () => {
  const document = parsePrg(buildPrg({ stage: [sectionNode("s", [])] }));
  const section = document.nodes.get("s");
  assert.ok(section?.kind === "section");
  section.children.push("missing", "s");
  document.order.push("missing");

  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["s"]);
  assert.deepEqual(flatten(tree), ["s"]);
  assert.deepEqual(collapsibleOutlineIds(document), []);
});

test("directed edges form the tree when the file has no sections", () => {
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
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["root"]);
  const root = tree[0];
  assert.ok(root);
  assert.deepEqual(ids(root.children), ["a", "b"]);
  assert.deepEqual(ids(root.children[0]?.children ?? []), ["leaf"]);
  assert.deepEqual(flatten(tree), ["root", "a", "leaf", "b"]);
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
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["upper", "lower"]);
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
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["root1", "root2"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["child"]);
  assert.deepEqual(ids(tree[1]?.children ?? []), []);
  assert.deepEqual(flatten(tree), ["root1", "child", "root2"]);
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
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["a"]);
  assert.deepEqual(flatten(tree), ["a", "b", "c"]);
});

test("a wrapped node keeps its tree parent through the frame", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        sectionNode("s", [textNode("b")]),
        textNode("c"),
        lineEdge("e1", "/0", "/1/children/0"),
        lineEdge("e2", "/1/children/0", "/2"),
      ],
    }),
  );
  const tree = buildOutlineTree(document);
  // The frame follows the node it wraps; the node and its subtree stay below it.
  assert.deepEqual(ids(tree), ["a"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["s"]);
  assert.deepEqual(ids(tree[0]?.children[0]?.children ?? []), ["b"]);
  assert.deepEqual(ids(tree[0]?.children[0]?.children[0]?.children ?? []), ["c"]);
  assert.deepEqual(flatten(tree), ["a", "s", "b", "c"]);
});

test("a frame adopts the edge parent of a frame nested inside it", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        sectionNode("outer", [sectionNode("inner", [textNode("c")])]),
        lineEdge("e", "/0", "/1/children/0/children/0"),
      ],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["a"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["outer"]);
  assert.deepEqual(ids(tree[0]?.children[0]?.children ?? []), ["inner"]);
  assert.deepEqual(ids(tree[0]?.children[0]?.children[0]?.children ?? []), ["c"]);
});

test("an edge parents a frame that is not inside another frame", () => {
  const document = parsePrg(
    buildPrg({
      stage: [textNode("a"), sectionNode("s", []), lineEdge("e", "/0", "/1")],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["a"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["s"]);
  assert.deepEqual(flatten(tree), ["a", "s"]);
});

test("an edge into a contained frame does not pull it out of its parent", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        sectionNode("outer", [sectionNode("inner", [])]),
        lineEdge("e", "/0", "/1/children/0"),
      ],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["a"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["outer"]);
  assert.deepEqual(ids(tree[0]?.children[0]?.children ?? []), ["inner"]);
});

test("an edge from inside a frame never parents the frame itself", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("s", [textNode("b")]), lineEdge("e", "/0/children/0", "/0")],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["s"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["b"]);
  assert.deepEqual(flatten(tree), ["s", "b"]);
});

test("adopted frames keep the canvas reading order among their siblings", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        textNode("z", { collisionBox: collisionBox(0, 200, 100, 50) }),
        sectionNode("s", [textNode("b")]),
        lineEdge("e1", "/0", "/1"),
        lineEdge("e2", "/0", "/2/children/0"),
      ],
    }),
  );
  const tree = buildOutlineTree(document);
  assert.deepEqual(ids(tree), ["a"]);
  assert.deepEqual(ids(tree[0]?.children ?? []), ["s", "z"]);
});

test("outlineAncestors returns the chain from the root to the parent", () => {
  const document = nestedDocument();
  assert.deepEqual(outlineAncestors(document, "c"), ["s", "inner"]);
  assert.deepEqual(outlineAncestors(document, "b"), ["s"]);
  assert.deepEqual(outlineAncestors(document, "a"), []);
  assert.deepEqual(outlineAncestors(document, "missing"), []);
});

test("collapsibleOutlineIds only contains nodes with children", () => {
  const document = nestedDocument();
  assert.deepEqual(collapsibleOutlineIds(document), ["s", "inner"]);
});

test("flattenOutline follows display order and skips collapsed children", () => {
  const document = nestedDocument();
  const all = flattenOutline(document);
  assert.deepEqual(
    all.map((row) => row.id),
    ["a", "s", "b", "inner", "c", "d"],
  );
  assert.deepEqual(
    all.map((row) => row.parentId),
    [null, null, "s", "s", "inner", null],
  );
  assert.deepEqual(
    all.map((row) => row.hasChildren),
    [false, true, false, true, false, false],
  );

  assert.deepEqual(
    flattenOutline(document, new Set(["s"])).map((row) => row.id),
    ["a", "s", "d"],
  );
  assert.deepEqual(
    flattenOutline(document, new Set(["inner"])).map((row) => row.id),
    ["a", "s", "b", "inner", "d"],
  );
});

test("resolveOutlineNavigation moves through rows and branches", () => {
  const rows = flattenOutline(nestedDocument());
  const select = (id: string | null, direction: "up" | "down" | "left" | "right"): string | null => {
    const move = resolveOutlineNavigation(rows, id, direction);
    return move?.kind === "select" ? move.id : null;
  };

  assert.equal(select(null, "down"), "a");
  assert.equal(select("a", "down"), "s");
  assert.equal(select("a", "up"), null);
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
    id: row.id,
    parentId: null,
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
  assert.deepEqual(buildOutlineTree(document), []);
  assert.deepEqual(groupForOutline(document), []);
  assert.deepEqual(collapsibleOutlineIds(document), []);
});
