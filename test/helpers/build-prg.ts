import { encode } from "@msgpack/msgpack";
import { zipSync } from "fflate";

/** Builders that produce real PRG containers in memory for tests. */

export interface BuildPrgOptions {
  metadata?: unknown;
  stage?: unknown;
  tags?: unknown;
  reference?: unknown;
  attachments?: Record<string, Uint8Array>;
  extra?: Record<string, Uint8Array>;
  readme?: string;
  extensionJs?: string;
  omitMetadata?: boolean;
  omitStage?: boolean;
  compressionLevel?: 0 | 1 | 6 | 9;
}

export function buildPrg(options: BuildPrgOptions = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  if (!options.omitMetadata) {
    files["metadata.msgpack"] = encode(options.metadata ?? { version: "2.7.0" });
  }
  if (!options.omitStage) {
    files["stage.msgpack"] = encode(options.stage ?? []);
  }
  if (options.tags !== undefined) files["tags.msgpack"] = encode(options.tags);
  if (options.reference !== undefined) files["reference.msgpack"] = encode(options.reference);
  if (options.readme !== undefined) files["README.md"] = new TextEncoder().encode(options.readme);
  if (options.extensionJs !== undefined) {
    files["extension.js"] = new TextEncoder().encode(options.extensionJs);
  }
  for (const [name, bytes] of Object.entries(options.attachments ?? {})) {
    files[`attachments/${name}`] = bytes;
  }
  for (const [name, bytes] of Object.entries(options.extra ?? {})) {
    files[name] = bytes;
  }
  return zipSync(files, { level: options.compressionLevel ?? 6 });
}

export function collisionBox(x: number, y: number, width: number, height: number): Record<string, unknown> {
  return {
    _: "CollisionBox",
    shapes: [{ _: "Rectangle", location: { _: "Vector", x, y }, size: { _: "Vector", x: width, y: height } }],
  };
}

export function transparentColor(): Record<string, unknown> {
  return { _: "Color", r: 0, g: 0, b: 0, a: 0 };
}

export function textNode(uuid: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _: "TextNode",
    details: [],
    uuid,
    text: "node",
    collisionBox: collisionBox(0, 0, 100, 50),
    color: transparentColor(),
    fontScaleLevel: 0,
    sizeAdjust: "auto",
    fontFamily: "",
    fontWeight: "",
    borderStyle: "solid",
    ...overrides,
  };
}

export function imageNode(
  uuid: string,
  attachmentId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _: "ImageNode",
    details: [],
    uuid,
    collisionBox: collisionBox(100, 100, 200, 100),
    attachmentId,
    scale: 1,
    isBackground: false,
    ...overrides,
  };
}

export function latexNode(
  uuid: string,
  source: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _: "LatexNode",
    details: [],
    uuid,
    latexSource: source,
    collisionBox: collisionBox(0, 200, 160, 60),
    color: transparentColor(),
    fontScaleLevel: 0,
    ...overrides,
  };
}

export function sectionNode(
  uuid: string,
  children: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _: "Section",
    details: [],
    uuid,
    collisionBox: collisionBox(-20, -40, 400, 300),
    color: { _: "Color", r: 100, g: 150, b: 200, a: 0.1 },
    text: "Section",
    children,
    isCollapsed: false,
    borderStyle: "dashed",
    ...overrides,
  };
}

/** Builds a LineEdge whose endpoints are references to `fromPointer`/`toPointer`. */
export function lineEdge(
  uuid: string,
  fromPointer: string,
  toPointer: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _: "LineEdge",
    associationList: [{ $: fromPointer }, { $: toPointer }],
    color: transparentColor(),
    targetRectangleRate: { _: "Vector", x: 0.01, y: 0.5 },
    sourceRectangleRate: { _: "Vector", x: 0.99, y: 0.5 },
    uuid,
    text: "",
    lineType: "solid",
    arrowType: "default",
    ...overrides,
  };
}

/** A 1×1 transparent PNG, used as a valid image attachment. */
export const TINY_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
