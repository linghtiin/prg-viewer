/**
 * Generates `fixtures/sample.prg` — a small but representative container.
 *
 * The fixture exercises every supported node kind, both plain and nested
 * reference paths, an attachment, tags, references, metadata and an unknown
 * (future) class that must degrade gracefully.
 *
 * Usage: pnpm fixture
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrg,
  collisionBox,
  imageNode,
  latexNode,
  lineEdge,
  sectionNode,
  textNode,
  TINY_PNG,
} from "../test/helpers/build-prg.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, "..", "fixtures", "sample.prg");

const stage: Record<string, unknown>[] = [
  textNode("00000000-0000-4000-8000-000000000001", {
    text: "起点",
    collisionBox: collisionBox(0, 0, 120, 52),
    color: { _: "Color", r: 46, g: 116, b: 181, a: 0.15 },
  }),
  textNode("00000000-0000-4000-8000-000000000002", {
    text: "终点",
    collisionBox: collisionBox(320, 0, 120, 52),
    borderStyle: "dashed",
    fontScaleLevel: 1,
  }),
  lineEdge("00000000-0000-4000-8000-000000000003", "/0", "/1", {
    text: "关系",
    sourceRectangleRate: { _: "Vector", x: 0.99, y: 0.5 },
    targetRectangleRate: { _: "Vector", x: 0.01, y: 0.5 },
  }),
  imageNode("00000000-0000-4000-8000-000000000004", "img-1", {
    collisionBox: collisionBox(320, 120, 160, 90),
  }),
  latexNode("00000000-0000-4000-8000-000000000005", "a^2 + b^2 = c^2", {
    collisionBox: collisionBox(320, 240, 180, 60),
  }),
  sectionNode(
    "00000000-0000-4000-8000-000000000006",
    [
      textNode("00000000-0000-4000-8000-000000000007", {
        text: "分组内的节点",
        collisionBox: collisionBox(40, 400, 160, 52),
        details: [
          { type: "h3", children: [{ text: "细节标题" }] },
          { type: "p", children: [{ text: "这是一段节点详情。" }] },
        ],
      }),
    ],
    { collisionBox: collisionBox(0, 340, 420, 160), text: "示例分组" },
  ),
  {
    _: "FutureNode",
    uuid: "00000000-0000-4000-8000-000000000008",
    collisionBox: collisionBox(520, 120, 160, 80),
  },
  lineEdge("00000000-0000-4000-8000-000000000009", "/5/children/0", "/0"),
];

const prg = buildPrg({
  metadata: { version: "2.7.0" },
  stage,
  tags: ["demo", "fixture"],
  reference: { sections: { 示例分组: ["00000000-0000-4000-8000-000000000007"] }, files: ["README.md"] },
  readme: "# Sample PRG\n\n生成自 scripts/make-fixture.ts。\n",
  attachments: { "img-1.png": TINY_PNG },
});

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, prg);
console.log(`[fixture] wrote ${outFile} (${prg.byteLength} bytes, ${stage.length} stage objects)`);
