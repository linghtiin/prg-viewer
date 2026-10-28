import type { Rect, Vec } from "../format/types.ts";

/** Pure 2D vector / rectangle helpers shared by camera, layout and renderer. */

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function addVec(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtractVec(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec(a: Vec, factor: number): Vec {
  return { x: a.x * factor, y: a.y * factor };
}

export function vecLength(a: Vec): number {
  return Math.hypot(a.x, a.y);
}

export function normalizeVec(a: Vec): Vec {
  const length = vecLength(a);
  if (length === 0) return { x: 0, y: 0 };
  return { x: a.x / length, y: a.y / length };
}

export function rotateVecDegrees(a: Vec, degrees: number): Vec {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: a.x * cos - a.y * sin, y: a.x * sin + a.y * cos };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function rectRight(rect: Rect): number {
  return rect.x + rect.width;
}

export function rectBottom(rect: Rect): number {
  return rect.y + rect.height;
}

export function rectCenter(rect: Rect): Vec {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function normalizeRect(rect: Rect): Rect {
  const x = Math.min(rect.x, rect.x + rect.width);
  const y = Math.min(rect.y, rect.y + rect.height);
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

export function rectIsEmpty(rect: Rect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function pointInRect(point: Vec, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let result = rects[0] as Rect;
  for (let index = 1; index < rects.length; index += 1) {
    result = unionRect(result, rects[index] as Rect);
  }
  return result;
}

export function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/** Rounds a rectangle to whole pixels for crisp painting. */
export function roundRect(rect: Rect): Rect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return { x, y, width: Math.round(rect.x + rect.width) - x, height: Math.round(rect.y + rect.height) - y };
}

/**
 * Where the segment from the rectangle's centre towards `target` leaves the
 * rectangle. Used for edges whose rate vector is the neutral (0.5, 0.5).
 */
export function rectLineIntersectionFromCenter(rect: Rect, target: Vec): Vec {
  const center = rectCenter(rect);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const factor = Math.min(scaleX, scaleY);
  return { x: center.x + dx * factor, y: center.y + dy * factor };
}

/** Unit normal of the rectangle edge closest to `point`. */
export function rectEdgeNormalAt(rect: Rect, point: Vec): Vec {
  const distances = [
    { value: Math.abs(point.y - rect.y), normal: { x: 0, y: -1 } },
    { value: Math.abs(point.y - (rect.y + rect.height)), normal: { x: 0, y: 1 } },
    { value: Math.abs(point.x - rect.x), normal: { x: -1, y: 0 } },
    { value: Math.abs(point.x - (rect.x + rect.width)), normal: { x: 1, y: 0 } },
  ];
  let best = distances[0] as (typeof distances)[number];
  for (const candidate of distances) {
    if (candidate.value < best.value) best = candidate;
  }
  return best.normal;
}

/** Cubic Bézier evaluation used for edge hit-testing and labels. */
export function cubicPointAt(start: Vec, control1: Vec, control2: Vec, end: Vec, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * start.x + b * control1.x + c * control2.x + d * end.x,
    y: a * start.y + b * control1.y + c * control2.y + d * end.y,
  };
}
