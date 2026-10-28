import type { PrgWarning } from "./errors.ts";

/** Shared geometry and colour primitives of the PRG document model. */

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type BorderStyle = "solid" | "dashed" | "none";
export type SizeAdjust = "auto" | "manual";

/** Plain-text representation of one rich-text block of a node's details. */
export interface PrgDetailsBlock {
  type: string;
  text: string;
}

interface PrgNodeBase {
  id: string;
  rect: Rect;
}

export interface PrgTextNode extends PrgNodeBase {
  kind: "text";
  text: string;
  color: Rgba;
  fontScaleLevel: number;
  sizeAdjust: SizeAdjust;
  fontFamily: string;
  fontWeight: string;
  borderStyle: BorderStyle;
  details: PrgDetailsBlock[];
}

export interface PrgImageNode extends PrgNodeBase {
  kind: "image";
  attachmentId: string;
  scale: number;
  isBackground: boolean;
}

export interface PrgLatexNode extends PrgNodeBase {
  kind: "latex";
  source: string;
  color: Rgba;
  fontScaleLevel: number;
}

export interface PrgSectionNode extends PrgNodeBase {
  kind: "section";
  text: string;
  color: Rgba;
  collapsed: boolean;
  borderStyle: BorderStyle;
  /** Immediate child node ids, in authoring order. */
  children: string[];
  /** Nesting depth; top-level sections are 1. */
  depth: number;
}

export interface PrgUnknownNode extends PrgNodeBase {
  kind: "unknown";
  typeName: string;
}

export type PrgNode = PrgTextNode | PrgImageNode | PrgLatexNode | PrgSectionNode | PrgUnknownNode;

export type PrgNodeKind = PrgNode["kind"];

export interface PrgEdge {
  id: string;
  from: string;
  to: string;
  text: string;
  color: Rgba;
  lineType: string;
  arrowType: string;
  sourceRate: Vec;
  targetRate: Vec;
}

export interface PrgAttachment {
  id: string;
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}

export interface PrgExtensionInfo {
  id: string;
  name: string;
  version: string;
}

export interface PrgMetadata {
  version: string;
  extension?: PrgExtensionInfo;
}

export interface PrgReferences {
  sections: Record<string, string[]>;
  files: string[];
}

export interface PrgDocument {
  metadata: PrgMetadata;
  tags: string[];
  references: PrgReferences;
  nodes: Map<string, PrgNode>;
  /** Node ids in document order (sections before their children). */
  order: string[];
  edges: PrgEdge[];
  bounds: Rect;
  warnings: PrgWarning[];
  attachments: Map<string, PrgAttachment>;
  readme?: string;
  thumbnail?: Uint8Array;
}

export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
export const EMPTY_VEC: Vec = { x: 0.5, y: 0.5 };
export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

export function isTransparentColor(color: Rgba): boolean {
  return color.a === 0;
}

export function isImageAttachment(attachment: PrgAttachment): boolean {
  return attachment.mime.startsWith("image/");
}
