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
  TINY_PNG,
} from "../../test/helpers/build-prg.ts";
import { attachmentOf, checkVersion, flattenDetails, parsePrg, parseVersion } from "./build-document.ts";
import { PrgError, type PrgWarning } from "./errors.ts";

const warningCodes = (warnings: PrgWarning[]): string[] => warnings.map((warning) => warning.code);

test("parses metadata, tags, references, order and bounds", () => {
  const document = parsePrg(
    buildPrg({
      metadata: { version: "2.7.0" },
      stage: [textNode("a"), textNode("b", { collisionBox: collisionBox(200, 100, 50, 50) })],
      tags: ["demo", "graph"],
      reference: { sections: { alpha: ["one"] }, files: ["a.md"] },
      readme: "# readme",
    }),
  );

  assert.equal(document.metadata.version, "2.7.0");
  assert.deepEqual(document.tags, ["demo", "graph"]);
  assert.deepEqual(document.references.files, ["a.md"]);
  assert.deepEqual(document.references.sections, { alpha: ["one"] });
  assert.deepEqual(document.order, ["a", "b"]);
  assert.deepEqual(document.bounds, { x: 0, y: 0, width: 250, height: 150 });
  assert.equal(document.readme, "# readme");
  assert.equal(document.warnings.length, 0);
});

test("maps text nodes including style and details", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("t", {
          text: "Hello",
          fontScaleLevel: 2,
          sizeAdjust: "manual",
          fontFamily: "serif",
          fontWeight: "600",
          borderStyle: "dashed",
          color: { _: "Color", r: 10, g: 20, b: 30, a: 1 },
          details: [
            { type: "h1", children: [{ text: "Title" }] },
            { type: "p", children: [{ text: "Body" }, { text: "!" }] },
          ],
        }),
      ],
    }),
  );

  const node = document.nodes.get("t");
  assert.ok(node && node.kind === "text");
  assert.equal(node.text, "Hello");
  assert.equal(node.fontScaleLevel, 2);
  assert.equal(node.sizeAdjust, "manual");
  assert.equal(node.fontFamily, "serif");
  assert.equal(node.fontWeight, "600");
  assert.equal(node.borderStyle, "dashed");
  assert.deepEqual(node.color, { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(node.details, [
    { type: "h1", text: "Title" },
    { type: "p", text: "Body!" },
  ]);
});

test("maps images, latex and attachments", () => {
  const document = parsePrg(
    buildPrg({
      stage: [imageNode("img", "att"), latexNode("math", "a^2+b^2=c^2")],
      attachments: { "att.png": TINY_PNG },
    }),
  );

  const image = document.nodes.get("img");
  assert.ok(image && image.kind === "image");
  assert.equal(image.attachmentId, "att");
  assert.equal(attachmentOf(document, image)?.mime, "image/png");

  const latex = document.nodes.get("math");
  assert.ok(latex && latex.kind === "latex");
  assert.equal(latex.source, "a^2+b^2=c^2");
  assert.deepEqual(latex.color, { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(document.warnings.length, 0);
});

test("warns about missing attachments but keeps the node", () => {
  const document = parsePrg(buildPrg({ stage: [imageNode("img", "missing")] }));
  const image = document.nodes.get("img");
  assert.ok(image && image.kind === "image");
  assert.ok(warningCodes(document.warnings).includes("missing-attachment"));
});

test("flattens nested sections and their children", () => {
  const document = parsePrg(
    buildPrg({
      stage: [sectionNode("s1", [textNode("c1"), sectionNode("s2", [textNode("c2")])])],
    }),
  );

  assert.deepEqual(document.order, ["s1", "c1", "s2", "c2"]);
  const outer = document.nodes.get("s1");
  assert.ok(outer && outer.kind === "section");
  assert.equal(outer.depth, 1);
  assert.deepEqual(outer.children, ["c1", "s2"]);
  const inner = document.nodes.get("s2");
  assert.ok(inner && inner.kind === "section");
  assert.equal(inner.depth, 2);
  assert.deepEqual(inner.children, ["c2"]);
});

test("maps edges to endpoints and rates", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        textNode("b", { collisionBox: collisionBox(300, 0, 100, 50) }),
        lineEdge("e1", "/0", "/1", {
          text: "depends",
          sourceRectangleRate: { _: "Vector", x: 0.99, y: 0.5 },
          targetRectangleRate: { _: "Vector", x: 0.01, y: 0.5 },
        }),
      ],
    }),
  );

  assert.equal(document.edges.length, 1);
  const edge = document.edges[0];
  assert.ok(edge);
  assert.equal(edge.id, "e1");
  assert.equal(edge.from, "a");
  assert.equal(edge.to, "b");
  assert.equal(edge.text, "depends");
  assert.deepEqual(edge.sourceRate, { x: 0.99, y: 0.5 });
  assert.deepEqual(edge.targetRate, { x: 0.01, y: 0.5 });
});

test("degrades unknown classes to placeholders", () => {
  const document = parsePrg(
    buildPrg({
      stage: [{ _: "FutureNode", uuid: "u1", collisionBox: collisionBox(0, 0, 80, 40) }],
    }),
  );
  const node = document.nodes.get("u1");
  assert.ok(node && node.kind === "unknown");
  assert.equal(node.typeName, "FutureNode");
  assert.ok(warningCodes(document.warnings).includes("unknown-class"));
});

test("skips invalid nodes and edges with a warning", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a"),
        textNode("a"),
        { _: "TextNode", uuid: "no-rect", text: "x" },
        lineEdge("e-missing", "/0", "/99"),
      ],
    }),
  );
  assert.equal(document.nodes.size, 1);
  assert.equal(document.edges.length, 0);
  const codes = warningCodes(document.warnings);
  assert.ok(codes.includes("duplicate-id"));
  assert.ok(codes.includes("missing-field"));
  assert.ok(codes.includes("dangling-edge"));
});

test("reports unsupported versions as a warning", () => {
  const warnings: PrgWarning[] = [];
  checkVersion("3.1.0", warnings);
  assert.ok(warningCodes(warnings).includes("unsupported-version"));
  const current: PrgWarning[] = [];
  checkVersion("2.7.0", current);
  assert.equal(current.length, 0);
});

test("reads metadata.json when metadata.msgpack is absent", () => {
  const document = parsePrg(
    buildPrg({
      omitMetadata: true,
      extra: { "metadata.json": new TextEncoder().encode(JSON.stringify({ version: "2.1.0" })) },
    }),
  );
  assert.equal(document.metadata.version, "2.1.0");
});

test("warns when metadata is missing entirely", () => {
  const document = parsePrg(buildPrg({ omitMetadata: true }));
  assert.equal(document.metadata.version, "0.0.0");
  assert.ok(warningCodes(document.warnings).includes("missing-field"));
});

test("rejects extension packages with a clear error", () => {
  assert.throws(
    () =>
      parsePrg(
        buildPrg({
          metadata: {
            version: "2.7.0",
            extension: { id: "com.example.ext", name: "Example", version: "1.0.0" },
          },
          omitStage: true,
          extensionJs: "export default {};",
        }),
      ),
    (error: unknown) => error instanceof PrgError && error.code === "unsupported-format",
  );
});

test("rejects containers without a stage", () => {
  assert.throws(
    () => parsePrg(buildPrg({ omitStage: true })),
    (error: unknown) => error instanceof PrgError && error.code === "missing-stage",
  );
});

test("rejects a stage that is not an array", () => {
  assert.throws(
    () => parsePrg(buildPrg({ stage: { not: "an array" } })),
    (error: unknown) => error instanceof PrgError && error.code === "decode-failed",
  );
});

test("rejects attachment UUID conflicts", () => {
  assert.throws(
    () =>
      parsePrg(
        buildPrg({
          stage: [],
          attachments: { "same-uuid.png": TINY_PNG, "same-uuid.jpg": TINY_PNG },
        }),
      ),
    (error: unknown) => error instanceof PrgError && error.code === "invalid-container",
  );
});

test("skips malformed attachment names with a warning", () => {
  const document = parsePrg(
    buildPrg({
      stage: [],
      extra: { "attachments/not a uuid.png": TINY_PNG },
    }),
  );
  assert.ok(warningCodes(document.warnings).includes("invalid-entry"));
  assert.equal(document.attachments.size, 0);
});

test("reads tags defensively", () => {
  const document = parsePrg(buildPrg({ stage: [], tags: { nope: true } }));
  assert.deepEqual(document.tags, []);
  assert.ok(warningCodes(document.warnings).includes("invalid-entry"));
});

test("flattenDetails ignores empty blocks and accepts nested children", () => {
  const blocks = flattenDetails([
    { type: "p", children: [{ text: "  " }] },
    { type: "ul", children: [{ children: [{ text: "item" }] }] },
    { type: "code", children: [{ text: "a\nb" }] },
  ]);
  assert.deepEqual(blocks, [
    { type: "ul", text: "item" },
    { type: "code", text: "a\nb" },
  ]);
  assert.deepEqual(flattenDetails(undefined), []);
});

test("parseVersion accepts two- and three-part versions", () => {
  assert.deepEqual(parseVersion("2.7.0"), [2, 7, 0]);
  assert.deepEqual(parseVersion("2.7"), [2, 7, 0]);
  assert.equal(parseVersion("v2"), null);
});

test("keeps section colours and collapsed state", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        sectionNode("s", [], {
          color: { _: "Color", r: 1, g: 2, b: 3, a: 0.25 },
          isCollapsed: true,
          borderStyle: "none",
          text: "Group",
        }),
      ],
    }),
  );
  const section = document.nodes.get("s");
  assert.ok(section && section.kind === "section");
  assert.equal(section.collapsed, true);
  assert.equal(section.borderStyle, "none");
  assert.equal(section.text, "Group");
  assert.deepEqual(section.color, { r: 1, g: 2, b: 3, a: 0.25 });
  assert.deepEqual(section.children, []);
});

test("defaults colours and rates when fields are missing", () => {
  const document = parsePrg(
    buildPrg({
      stage: [
        textNode("a", { color: undefined }),
        textNode("b"),
        {
          _: "LineEdge",
          associationList: [{ $: "/0" }, { $: "/1" }],
          uuid: "e",
        },
      ],
    }),
  );
  const node = document.nodes.get("a");
  assert.ok(node && node.kind === "text");
  assert.deepEqual(node.color, { r: 0, g: 0, b: 0, a: 0 });
  const edge = document.edges[0];
  assert.ok(edge);
  assert.deepEqual(edge.sourceRate, { x: 0.5, y: 0.5 });
  assert.deepEqual(edge.targetRate, { x: 0.5, y: 0.5 });
  assert.equal(edge.lineType, "solid");
});
