import type { PrgDocument, PrgEdge, PrgNode, PrgSectionNode, Rect } from "../format/types.ts";
import { computeEdgeGeometry, type EdgeGeometry } from "./edge-geometry.ts";
import { pointInRect, rectsIntersect, unionRects } from "./geometry.ts";

/** A flattened, render-ready view of a document. */

export interface SceneEdge {
  edge: PrgEdge;
  geometry: EdgeGeometry;
}

export interface Scene {
  /** Frames, outermost first. */
  sections: PrgSectionNode[];
  /** Every non-section, non-hidden node in document order. */
  nodes: PrgNode[];
  edges: SceneEdge[];
  bounds: Rect;
  nodeById: Map<string, PrgNode>;
  hiddenIds: Set<string>;
}

export function buildScene(document: PrgDocument): Scene {
  const hiddenIds = collectHiddenIds(document);
  const sections: PrgSectionNode[] = [];
  const nodes: PrgNode[] = [];

  for (const id of document.order) {
    const node = document.nodes.get(id);
    if (!node || hiddenIds.has(node.id)) continue;
    if (node.kind === "section") {
      sections.push(node);
    } else {
      nodes.push(node);
    }
  }
  sections.sort((a, b) => a.depth - b.depth);

  const edges: SceneEdge[] = [];
  for (const edge of document.edges) {
    if (hiddenIds.has(edge.from) || hiddenIds.has(edge.to)) continue;
    const from = document.nodes.get(edge.from);
    const to = document.nodes.get(edge.to);
    if (!from || !to) continue;
    edges.push({ edge, geometry: computeEdgeGeometry(from.rect, to.rect, edge.sourceRate, edge.targetRate) });
  }

  const visibleRects = [...sections, ...nodes].map((node) => node.rect);
  const bounds =
    document.bounds.width > 0 || document.bounds.height > 0 ? document.bounds : unionRects(visibleRects);

  return {
    sections,
    nodes,
    edges,
    bounds,
    nodeById: document.nodes,
    hiddenIds,
  };
}

/**
 * Entities inside a collapsed section are hidden, matching Project Graph's
 * collapsed-frame behaviour.
 */
function collectHiddenIds(document: PrgDocument): Set<string> {
  const hidden = new Set<string>();
  const queue: string[] = [];

  const pushDescendants = (section: PrgSectionNode): void => {
    for (const childId of section.children) {
      if (hidden.has(childId)) continue;
      hidden.add(childId);
      queue.push(childId);
    }
  };

  for (const node of document.nodes.values()) {
    if (node.kind === "section" && node.collapsed) pushDescendants(node);
  }

  while (queue.length > 0) {
    const id = queue.shift() as string;
    const node = document.nodes.get(id);
    if (node?.kind === "section") pushDescendants(node);
  }
  return hidden;
}

/** Painting order: frames, then their contents, then edges on top of frames. */
export function canvasOrder(scene: Scene): PrgNode[] {
  return [...scene.sections, ...scene.nodes];
}

export function nodesInViewport(scene: Scene, viewport: Rect): PrgNode[] {
  const result: PrgNode[] = [];
  for (const node of scene.sections) {
    if (rectsIntersect(node.rect, viewport)) result.push(node);
  }
  for (const node of scene.nodes) {
    if (rectsIntersect(node.rect, viewport)) result.push(node);
  }
  return result;
}

export function edgeBounds(geometry: EdgeGeometry): Rect {
  return unionRects([
    { x: geometry.start.x, y: geometry.start.y, width: 0, height: 0 },
    { x: geometry.end.x, y: geometry.end.y, width: 0, height: 0 },
    { x: geometry.control1.x, y: geometry.control1.y, width: 0, height: 0 },
    { x: geometry.control2.x, y: geometry.control2.y, width: 0, height: 0 },
  ]);
}

export function edgesInViewport(scene: Scene, viewport: Rect): SceneEdge[] {
  return scene.edges.filter((item) => rectsIntersect(edgeBounds(item.geometry), viewport));
}

/** Topmost node containing a world point, or null. */
export function hitTestNode(scene: Scene, point: { x: number; y: number }): PrgNode | null {
  const ordered = canvasOrder(scene);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const node = ordered[index];
    if (node && pointInRect(point, node.rect)) return node;
  }
  return null;
}

export function nodesInRect(scene: Scene, rect: Rect): PrgNode[] {
  return canvasOrder(scene).filter((node) => rectsIntersect(node.rect, rect));
}

export function findNode(scene: Scene, id: string): PrgNode | undefined {
  return scene.nodeById.get(id);
}
