import { FIT_PADDING, MAX_SCALE, MIN_SCALE } from "../constants.ts";
import type { Rect, Vec } from "../format/types.ts";
import { clamp, rectCenter } from "./geometry.ts";

export interface Viewport {
  width: number;
  height: number;
}

export interface CameraState {
  /** World coordinate shown at the viewport's top-left corner. */
  x: number;
  y: number;
  scale: number;
}

/** Screen = (world - offset) * scale. */
export class Camera {
  private offsetX: number;
  private offsetY: number;
  private currentScale: number;

  constructor(state: CameraState = { x: -400, y: -300, scale: 1 }) {
    this.offsetX = Camera.finiteOr(state.x, -400);
    this.offsetY = Camera.finiteOr(state.y, -300);
    this.currentScale = Camera.clampScale(Camera.finiteOr(state.scale, 1));
  }

  get x(): number {
    return this.offsetX;
  }

  get y(): number {
    return this.offsetY;
  }

  get scale(): number {
    return this.currentScale;
  }

  worldToScreen(point: Vec): Vec {
    return {
      x: (point.x - this.offsetX) * this.currentScale,
      y: (point.y - this.offsetY) * this.currentScale,
    };
  }

  screenToWorld(point: Vec): Vec {
    return {
      x: point.x / this.currentScale + this.offsetX,
      y: point.y / this.currentScale + this.offsetY,
    };
  }

  panByScreen(dx: number, dy: number): void {
    this.offsetX -= dx / this.currentScale;
    this.offsetY -= dy / this.currentScale;
  }

  /** Zooms while keeping the world point under `screenPoint` stationary. */
  zoomAt(screenPoint: Vec, nextScale: number): void {
    const anchor = this.screenToWorld(screenPoint);
    this.currentScale = Camera.clampScale(nextScale);
    this.offsetX = anchor.x - screenPoint.x / this.currentScale;
    this.offsetY = anchor.y - screenPoint.y / this.currentScale;
  }

  zoomBy(factor: number, screenPoint: Vec): void {
    this.zoomAt(screenPoint, this.currentScale * factor);
  }

  /** Fits `bounds` into the viewport, centred, keeping a padding margin. */
  fit(bounds: Rect, viewport: Viewport, padding: number = FIT_PADDING): void {
    const usableWidth = Math.max(1, viewport.width - padding * 2);
    const usableHeight = Math.max(1, viewport.height - padding * 2);
    let scale = 1;
    if (bounds.width > 0 && bounds.height > 0) {
      scale = Math.min(usableWidth / bounds.width, usableHeight / bounds.height);
    } else if (bounds.width > 0) {
      scale = usableWidth / bounds.width;
    } else if (bounds.height > 0) {
      scale = usableHeight / bounds.height;
    }
    this.currentScale = Camera.clampScale(scale);
    const center = rectCenter(bounds);
    this.offsetX = center.x - viewport.width / (2 * this.currentScale);
    this.offsetY = center.y - viewport.height / (2 * this.currentScale);
  }

  centerOn(world: Vec, viewport: Viewport): void {
    this.offsetX = world.x - viewport.width / (2 * this.currentScale);
    this.offsetY = world.y - viewport.height / (2 * this.currentScale);
  }

  /** World-space rectangle currently visible. */
  worldViewport(viewport: Viewport): Rect {
    const topLeft = this.screenToWorld({ x: 0, y: 0 });
    const bottomRight = this.screenToWorld({ x: viewport.width, y: viewport.height });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  toJSON(): CameraState {
    return { x: this.offsetX, y: this.offsetY, scale: this.currentScale };
  }

  static clampScale(value: number): number {
    return clamp(value, MIN_SCALE, MAX_SCALE);
  }

  static fromState(raw: unknown, fallback?: CameraState): Camera {
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const candidate = raw as Partial<CameraState>;
      if (
        typeof candidate.x === "number" &&
        typeof candidate.y === "number" &&
        typeof candidate.scale === "number" &&
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y) &&
        Number.isFinite(candidate.scale)
      ) {
        return new Camera({ x: candidate.x, y: candidate.y, scale: candidate.scale });
      }
    }
    return new Camera(fallback ?? { x: -400, y: -300, scale: 1 });
  }

  private static finiteOr(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
}
