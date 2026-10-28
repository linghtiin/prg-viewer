import { parseAttachments } from "./attachment.ts";
import { PrgError, createWarning, pushWarning, type PrgWarning } from "./errors.ts";
import { DEFAULT_ZIP_LIMITS, type ZipLimits } from "./limits.ts";
import { decodeMsgpack } from "./msgpack.ts";
import { isRecord, resolveReferences } from "./serializer.ts";
import {
  EMPTY_RECT,
  EMPTY_VEC,
  TRANSPARENT,
  type BorderStyle,
  type PrgAttachment,
  type PrgDetailsBlock,
  type PrgDocument,
  type PrgEdge,
  type PrgMetadata,
  type PrgNode,
  type PrgReferences,
  type PrgSectionNode,
  type Rgba,
  type Rect,
  type SizeAdjust,
  type Vec,
} from "./types.ts";
import { readZipEntries } from "./zip.ts";

/** Highest PRG major version this build understands without caveats. */
export const MAX_SUPPORTED_MAJOR = 2;
const MAX_WARNINGS = 200;

/** Classes that exist only at runtime and carry no visual information. */
const INERT_CLASSES = new Set(["SyncAssociation", "ConnectPoint"]);

export interface ParseOptions {
  limits?: ZipLimits;
}

/**
 * Parses a `.prg` container into a read-only document model.
 *
 * Never writes anything, never extracts to disk, and turns every recoverable
 * problem into a warning so that a partially broken file still renders.
 */
export function parsePrg(input: Uint8Array | ArrayBuffer, options: ParseOptions = {}): PrgDocument {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = readZipEntries(bytes, options.limits ?? DEFAULT_ZIP_LIMITS);
  const warnings: PrgWarning[] = [];

  if (!entries.has("stage.msgpack") && !entries.has("extension.js")) {
    throw new PrgError("missing-stage", "容器内缺少 stage.msgpack，不像是 Project Graph 画布文件。");
  }

  const metadata = readMetadata(entries, warnings);
  if (metadata.extension) {
    throw new PrgError(
      "unsupported-format",
      "这是一个 Project Graph 扩展包，不包含画布内容。",
      `扩展：${metadata.extension.name}（${metadata.extension.id} v${metadata.extension.version}）`,
    );
  }
  checkVersion(metadata.version, warnings);

  const stageBytes = entries.get("stage.msgpack");
  if (!stageBytes) {
    throw new PrgError("missing-stage", "扩展包或容器内缺少 stage.msgpack。");
  }

  const rawStage = decodeMsgpack(stageBytes);
  if (!Array.isArray(rawStage)) {
    throw new PrgError("decode-failed", "stage.msgpack 的内容不是数组。");
  }
  const resolved = resolveReferences(rawStage, warnings);
  if (!Array.isArray(resolved)) {
    throw new PrgError("decode-failed", "stage.msgpack 的内容不是数组。");
  }

  const tags = readTags(entries, warnings);
  const references = readReferences(entries, warnings);
  const attachments = parseAttachments(entries, warnings);

  const nodes = new Map<string, PrgNode>();
  const order: string[] = [];
  const rawEdges: unknown[] = [];

  for (const item of resolved) {
    const className = isRecord(item) && typeof item._ === "string" ? item._ : "";
    if (className === "LineEdge") {
      rawEdges.push(item);
      continue;
    }
    visitEntity(item, 0, { nodes, order, warnings });
  }

  const edges = buildEdges(rawEdges, nodes, warnings);

  for (const node of nodes.values()) {
    if (node.kind === "image" && node.attachmentId && !attachments.has(node.attachmentId)) {
      pushWarning(
        warnings,
        createWarning(
          "missing-attachment",
          `图片节点 ${node.id} 引用的附件不存在：${node.attachmentId}`,
          node.attachmentId,
        ),
      );
    }
  }

  const readme = decodeText(entries.get("README.md"));
  const thumbnail = entries.get("thumbnail.png");

  const document: PrgDocument = {
    metadata,
    tags,
    references,
    nodes,
    order,
    edges,
    bounds: computeBounds(nodes),
    warnings: warnings.slice(0, MAX_WARNINGS),
    attachments,
  };
  if (readme !== undefined) document.readme = readme;
  if (thumbnail !== undefined) document.thumbnail = thumbnail;
  return document;
}

interface BuildState {
  nodes: Map<string, PrgNode>;
  order: string[];
  warnings: PrgWarning[];
}

function visitEntity(value: unknown, ancestorDepth: number, state: BuildState): string | null {
  if (!isRecord(value)) {
    pushWarning(state.warnings, createWarning("invalid-entry", "舞台对象不是对象，已跳过。"));
    return null;
  }
  const className = typeof value._ === "string" ? value._ : "";
  if (INERT_CLASSES.has(className)) return null;

  const id = stringAt(value, "uuid");
  if (!id) {
    pushWarning(
      state.warnings,
      createWarning("missing-field", `${className || "未知类型"}节点缺少 uuid，已跳过。`),
    );
    return null;
  }

  const existing = state.nodes.get(id);
  if (existing) {
    // Sections serialize their children inline while the same entities can also
    // appear at the top level of the stage, so the same uuid legitimately shows
    // up twice. Keep the first occurrence and stay silent.
    return existing.id;
  }

  const rect = readRect(value);
  if (!rect) {
    pushWarning(
      state.warnings,
      createWarning("missing-field", `节点 ${id} 缺少可用的位置信息，已跳过。`, id),
    );
    return null;
  }

  switch (className) {
    case "TextNode": {
      const node: PrgNode = {
        kind: "text",
        id,
        rect,
        text: stringAt(value, "text"),
        color: readColor(value.color),
        fontScaleLevel: numberAt(value, "fontScaleLevel"),
        sizeAdjust: readSizeAdjust(value.sizeAdjust),
        fontFamily: stringAt(value, "fontFamily"),
        fontWeight: stringAt(value, "fontWeight"),
        borderStyle: readBorderStyle(value.borderStyle),
        details: flattenDetails(value.details),
      };
      register(state, node);
      return id;
    }
    case "ImageNode": {
      const node: PrgNode = {
        kind: "image",
        id,
        rect,
        attachmentId: stringAt(value, "attachmentId"),
        scale: numberAt(value, "scale", 1),
        isBackground: booleanAt(value, "isBackground"),
      };
      register(state, node);
      return id;
    }
    case "LatexNode": {
      const node: PrgNode = {
        kind: "latex",
        id,
        rect,
        source: stringAt(value, "latexSource"),
        color: readColor(value.color),
        fontScaleLevel: numberAt(value, "fontScaleLevel"),
      };
      register(state, node);
      return id;
    }
    case "Section": {
      const collapsed = booleanAt(value, "isCollapsed");
      const sectionRect = collapsed
        ? (readRectFromKey(value, "_collisionBoxWhenCollapsed") ??
          estimateCollapsedSectionRect(rect, stringAt(value, "text")))
        : rect;
      const section: PrgSectionNode = {
        kind: "section",
        id,
        rect: sectionRect,
        text: stringAt(value, "text"),
        color: readColor(value.color),
        collapsed,
        borderStyle: readBorderStyle(value.borderStyle),
        children: [],
        depth: ancestorDepth + 1,
      };
      register(state, section);
      const children = Array.isArray(value.children) ? value.children : [];
      for (const child of children) {
        const childId = visitEntity(child, ancestorDepth + 1, state);
        if (childId && childId !== id && !section.children.includes(childId)) {
          section.children.push(childId);
        }
      }
      return id;
    }
    default: {
      if (rect.width === 0 && rect.height === 0) return null;
      if (className) {
        pushWarning(state.warnings, createWarning("unknown-class", `暂不支持的节点类型：${className}`, id));
      }
      const node: PrgNode = {
        kind: "unknown",
        id,
        rect,
        typeName: className || "UnknownNode",
      };
      register(state, node);
      return id;
    }
  }
}

function register(state: BuildState, node: PrgNode): void {
  state.nodes.set(node.id, node);
  state.order.push(node.id);
}

function buildEdges(rawEdges: unknown[], nodes: Map<string, PrgNode>, warnings: PrgWarning[]): PrgEdge[] {
  const edges: PrgEdge[] = [];
  const seen = new Set<string>();
  for (const raw of rawEdges) {
    if (!isRecord(raw)) continue;
    const id = stringAt(raw, "uuid") || `edge-${edges.length}`;
    if (seen.has(id)) {
      pushWarning(warnings, createWarning("duplicate-id", `重复的连线 uuid，已忽略：${id}`, id));
      continue;
    }
    const associationList = Array.isArray(raw.associationList) ? raw.associationList : [];
    const endpoints: string[] = [];
    for (const association of associationList) {
      if (!isRecord(association)) continue;
      const endpointId = stringAt(association, "uuid");
      if (endpointId) endpoints.push(endpointId);
    }
    if (endpoints.length < 2) {
      pushWarning(warnings, createWarning("dangling-edge", `连线 ${id} 的端点不足两个，已跳过。`, id));
      continue;
    }
    if (endpoints.length > 2) {
      pushWarning(
        warnings,
        createWarning("unknown-class", `连线 ${id} 有多个端点（${endpoints.length}），仅显示首尾连接。`, id),
      );
    }
    const from = endpoints[0] as string;
    const to = endpoints[endpoints.length - 1] as string;
    if (!nodes.has(from) || !nodes.has(to)) {
      pushWarning(warnings, createWarning("dangling-edge", `连线 ${id} 指向不存在的节点，已跳过。`, id));
      continue;
    }
    seen.add(id);
    edges.push({
      id,
      from,
      to,
      text: stringAt(raw, "text"),
      color: readColor(raw.color),
      lineType: stringAt(raw, "lineType", "solid"),
      arrowType: stringAt(raw, "arrowType", "default"),
      sourceRate: readVec(raw.sourceRectangleRate, EMPTY_VEC),
      targetRate: readVec(raw.targetRectangleRate, EMPTY_VEC),
    });
  }
  return edges;
}

function readMetadata(entries: Map<string, Uint8Array>, warnings: PrgWarning[]): PrgMetadata {
  const packed = entries.get("metadata.msgpack");
  const json = entries.get("metadata.json");
  let raw: unknown;
  if (packed) {
    raw = decodeMsgpack(packed);
  } else if (json) {
    raw = parseJson(json);
  } else {
    pushWarning(warnings, createWarning("missing-field", "容器缺少 metadata.msgpack，按未知版本继续。"));
    return { version: "0.0.0" };
  }

  if (!isRecord(raw)) {
    pushWarning(warnings, createWarning("invalid-entry", "metadata 内容不是对象，按未知版本继续。"));
    return { version: "0.0.0" };
  }

  const version = typeof raw.version === "string" && raw.version.length > 0 ? raw.version : "0.0.0";
  if (version === "0.0.0") {
    pushWarning(warnings, createWarning("missing-field", "metadata 缺少 version 字段。"));
  }

  const metadata: PrgMetadata = { version };
  if (isRecord(raw.extension)) {
    metadata.extension = {
      id: stringAt(raw.extension, "id"),
      name: stringAt(raw.extension, "name"),
      version: stringAt(raw.extension, "version"),
    };
  }
  return metadata;
}

function readTags(entries: Map<string, Uint8Array>, warnings: PrgWarning[]): string[] {
  const bytes = entries.get("tags.msgpack");
  if (!bytes) return [];
  const raw = decodeMsgpack(bytes);
  if (!Array.isArray(raw)) {
    pushWarning(warnings, createWarning("invalid-entry", "tags.msgpack 不是数组，已忽略。"));
    return [];
  }
  return raw.filter((tag): tag is string => typeof tag === "string");
}

function readReferences(entries: Map<string, Uint8Array>, warnings: PrgWarning[]): PrgReferences {
  const empty: PrgReferences = { sections: {}, files: [] };
  const bytes = entries.get("reference.msgpack");
  if (!bytes) return empty;
  const raw = decodeMsgpack(bytes);
  if (!isRecord(raw)) {
    pushWarning(warnings, createWarning("invalid-entry", "reference.msgpack 不是对象，已忽略。"));
    return empty;
  }
  const sections: Record<string, string[]> = {};
  if (isRecord(raw.sections)) {
    for (const [key, value] of Object.entries(raw.sections)) {
      if (!Array.isArray(value)) continue;
      sections[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  const files = Array.isArray(raw.files)
    ? raw.files.filter((item): item is string => typeof item === "string")
    : [];
  return { sections, files };
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

function decodeText(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes || bytes.byteLength === 0) return undefined;
  return new TextDecoder("utf-8").decode(bytes);
}

/** Parses `major.minor.patch`; returns null when the string is not a version. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function checkVersion(version: string, warnings: PrgWarning[]): void {
  const parsed = parseVersion(version);
  if (!parsed) {
    pushWarning(warnings, createWarning("unsupported-version", `无法识别的 PRG 版本：${version}`));
    return;
  }
  if (parsed[0] > MAX_SUPPORTED_MAJOR) {
    pushWarning(
      warnings,
      createWarning(
        "unsupported-version",
        `该文件由更新的 Project Graph（v${version}）生成，部分内容可能无法显示。`,
      ),
    );
  }
}

function computeBounds(nodes: Map<string, PrgNode>): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes.values()) {
    const { x, y, width, height } = node.rect;
    if (![x, y, width, height].every(Number.isFinite)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return EMPTY_RECT;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Geometry helpers shared with the scene layer. */
function numberAt(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringAt(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function booleanAt(record: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function readVec(value: unknown, fallback: Vec): Vec {
  if (!isRecord(value)) return fallback;
  return {
    x: numberAt(value, "x", fallback.x),
    y: numberAt(value, "y", fallback.y),
  };
}

function readColor(value: unknown): Rgba {
  if (!isRecord(value)) return TRANSPARENT;
  return {
    r: numberAt(value, "r"),
    g: numberAt(value, "g"),
    b: numberAt(value, "b"),
    a: numberAt(value, "a"),
  };
}

function readBorderStyle(value: unknown): BorderStyle {
  if (value === "dashed" || value === "none") return value;
  return "solid";
}

function readSizeAdjust(value: unknown): SizeAdjust {
  return value === "manual" ? "manual" : "auto";
}

/**
 * Reads a collision box from one of the serialized keys.
 *
 * Project Graph stores `collisionBox` for most entities, but `Section` keeps its
 * geometry in `_collisionBoxNormal` (and only derives `collisionBox` at runtime).
 */
function readRectFromKey(value: Record<string, unknown>, key: string): Rect | null {
  const collisionBox = value[key];
  if (!isRecord(collisionBox) || !Array.isArray(collisionBox.shapes)) return null;
  const rects: Rect[] = [];
  for (const shape of collisionBox.shapes) {
    const rect = readShapeRect(shape);
    if (rect) rects.push(rect);
  }
  return rects.length > 0 ? unionRects(rects) : null;
}

/**
 * Collision boxes hold `Rectangle` shapes for most entities, but sections store
 * the four boundary `Line`s of their frame (plus a title-bar rectangle). Both are
 * considered so the frame is measured from its real outline.
 */
function readShapeRect(shape: unknown): Rect | null {
  const rectangle = readRectangle(shape);
  if (rectangle) return rectangle;
  return readLineRect(shape);
}

function readLineRect(value: unknown): Rect | null {
  if (!isRecord(value)) return null;
  const start = value.start;
  const end = value.end;
  if (!isRecord(start) || !isRecord(end)) return null;
  const startX = numberAt(start, "x", Number.NaN);
  const startY = numberAt(start, "y", Number.NaN);
  const endX = numberAt(end, "x", Number.NaN);
  const endY = numberAt(end, "y", Number.NaN);
  if (![startX, startY, endX, endY].every(Number.isFinite)) return null;
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function readRect(value: unknown): Rect | null {
  if (!isRecord(value)) return null;
  const rect =
    readRectFromKey(value, "collisionBox") ??
    readRectFromKey(value, "_collisionBoxNormal") ??
    readRectFromKey(value, "_collisionBoxWhenCollapsed") ??
    readRectangle(value);
  return rect;
}

/**
 * A collapsed section only serializes its full geometry. Project Graph derives a
 * title-sized box centred on it; this is the same approximation without text
 * measurement.
 */
function estimateCollapsedSectionRect(full: Rect, text: string): Rect {
  let textWidth = 0;
  for (const character of text) {
    textWidth += /[\u2e80-\u9fff\uff00-\uffef]/.test(character) ? 32 : 16;
  }
  const width = Math.min(full.width, Math.max(96, textWidth + 28));
  const height = Math.min(full.height, 48);
  return {
    x: full.x + (full.width - width) / 2,
    y: full.y + (full.height - height) / 2,
    width,
    height,
  };
}

function readRectangle(value: unknown): Rect | null {
  if (!isRecord(value)) return null;
  const location = value.location;
  const size = value.size;
  if (!isRecord(location) || !isRecord(size)) return null;
  const rect: Rect = {
    x: numberAt(location, "x", Number.NaN),
    y: numberAt(location, "y", Number.NaN),
    width: numberAt(size, "x", Number.NaN),
    height: numberAt(size, "y", Number.NaN),
  };
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
  return rect;
}

export function unionRects(rects: Rect[]): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Flattens Plate/Slate rich text into plain text blocks so details can be shown
 * without a full rich-text engine.
 */
export function flattenDetails(value: unknown): PrgDetailsBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: PrgDetailsBlock[] = [];
  for (const block of value) {
    if (!isRecord(block)) continue;
    const text = collectText(block)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text.length === 0) continue;
    blocks.push({ type: typeof block.type === "string" ? block.type : "p", text });
  }
  return blocks;
}

function collectText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectText).join("");
  if (isRecord(value)) {
    const own = typeof value.text === "string" ? value.text : "";
    const children = Array.isArray(value.children) ? value.children.map(collectText).join("") : "";
    return own + children;
  }
  return "";
}

/** Convenience accessor used by the renderer and tests. */
export function nodeOf(document: PrgDocument, id: string): PrgNode | undefined {
  return document.nodes.get(id);
}

/** Attachment lookup that also resolves the bytes backing an image node. */
export function attachmentOf(document: PrgDocument, node: PrgNode): PrgAttachment | undefined {
  if (node.kind !== "image" || !node.attachmentId) return undefined;
  return document.attachments.get(node.attachmentId);
}
