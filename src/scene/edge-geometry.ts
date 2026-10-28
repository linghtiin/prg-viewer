import type { Rect, Vec } from "../format/types.ts";
import {
  addVec,
  cubicPointAt,
  normalizeVec,
  rectCenter,
  rectEdgeNormalAt,
  rectLineIntersectionFromCenter,
  scaleVec,
  subtractVec,
  vecLength,
} from "./geometry.ts";

/**
 * Edge anchoring and curve construction.
 *
 * A rate vector selects a point inside the source/target rectangle:
 * `0.01` / `0.99` are sentinels for "left/right/top/bottom edge centre",
 * `(0.5, 0.5)` means "clip the centre line against the rectangle boundary",
 * anything else is an exact position inside the rectangle.
 */
export const LEFT_RATE = 0.01;
export const RIGHT_RATE = 0.99;
export const TOP_RATE = 0.01;
export const BOTTOM_RATE = 0.99;

export interface EdgeGeometry {
  start: Vec;
  end: Vec;
  control1: Vec;
  control2: Vec;
  selfLoop: boolean;
}

export function isCenterRate(rate: Vec): boolean {
  return rate.x === 0.5 && rate.y === 0.5;
}

export function anchorPoint(rect: Rect, rate: Vec): Vec {
  if (rate.x === LEFT_RATE) return { x: rect.x, y: rect.y + rect.height / 2 };
  if (rate.x === RIGHT_RATE) return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  if (rate.y === TOP_RATE) return { x: rect.x + rect.width / 2, y: rect.y };
  if (rate.y === BOTTOM_RATE) return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  return { x: rect.x + rect.width * rate.x, y: rect.y + rect.height * rate.y };
}

/** Outward normal encoded by a sentinel rate, or null for custom positions. */
export function normalForRate(rate: Vec): Vec | null {
  if (rate.x === LEFT_RATE) return { x: -1, y: 0 };
  if (rate.x === RIGHT_RATE) return { x: 1, y: 0 };
  if (rate.y === TOP_RATE) return { x: 0, y: -1 };
  if (rate.y === BOTTOM_RATE) return { x: 0, y: 1 };
  return null;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function selfLoopGeometry(rect: Rect): EdgeGeometry {
  const start: Vec = { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  const end: Vec = { x: rect.x + rect.width / 2, y: rect.y };
  const loop = Math.max(48, Math.min(rect.width, rect.height) / 2 + 40);
  return {
    start,
    end,
    control1: { x: start.x + loop, y: start.y },
    control2: { x: end.x, y: end.y - loop },
    selfLoop: true,
  };
}

export function computeEdgeGeometry(from: Rect, to: Rect, sourceRate: Vec, targetRate: Vec): EdgeGeometry {
  if (sameRect(from, to)) return selfLoopGeometry(from);

  const fromInner = isCenterRate(sourceRate) ? rectCenter(from) : anchorPoint(from, sourceRate);
  const toInner = isCenterRate(targetRate) ? rectCenter(to) : anchorPoint(to, targetRate);

  const start = isCenterRate(sourceRate) ? rectLineIntersectionFromCenter(from, toInner) : fromInner;
  const end = isCenterRate(targetRate) ? rectLineIntersectionFromCenter(to, fromInner) : toInner;

  let startNormal = normalForRate(sourceRate);
  if (!startNormal) startNormal = rectEdgeNormalAt(from, start);
  let endNormal = normalForRate(targetRate);
  if (!endNormal) endNormal = rectEdgeNormalAt(to, end);

  const delta = subtractVec(end, start);
  let bending = vecLength(delta) / 2;
  const startNormalUnit = normalizeVec(startNormal);
  const endNormalUnit = normalizeVec(endNormal);
  for (const direction of [startNormalUnit, scaleVec(endNormalUnit, -1)]) {
    const forwardGap = delta.x * direction.x + delta.y * direction.y;
    if (forwardGap > 0) bending = Math.min(bending, forwardGap / 2);
  }

  if (!Number.isFinite(bending) || bending <= 0.5) {
    return { start, end, control1: start, control2: end, selfLoop: false };
  }

  return {
    start,
    end,
    control1: addVec(start, scaleVec(startNormalUnit, bending)),
    control2: addVec(end, scaleVec(endNormalUnit, bending)),
    selfLoop: false,
  };
}

export function edgeMidpoint(geometry: EdgeGeometry): Vec {
  return cubicPointAt(geometry.start, geometry.control1, geometry.control2, geometry.end, 0.5);
}

/** Direction of the curve at its end, used to orient the arrow head. */
export function edgeEndDirection(geometry: EdgeGeometry): Vec {
  return normalizeVec(subtractVec(geometry.end, geometry.control2));
}

/** Samples the curve; used for hit-testing edges and for arrow placement. */
export function sampleEdge(geometry: EdgeGeometry, segments = 24): Vec[] {
  const points: Vec[] = [];
  for (let index = 0; index <= segments; index += 1) {
    points.push(
      cubicPointAt(geometry.start, geometry.control1, geometry.control2, geometry.end, index / segments),
    );
  }
  return points;
}
