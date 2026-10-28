import type { Camera, Viewport } from "../scene/camera.ts";
import { resolveWheelAction, type WheelBehavior } from "../scene/input.ts";
import { hitTestNode, type Scene } from "../scene/scene.ts";

export interface InteractionHost {
  element: HTMLElement;
  getScene(): Scene | null;
  getCamera(): Camera;
  getViewport(): Viewport;
  getWheelBehavior(): WheelBehavior;
  requestRender(): void;
  onSelect(id: string | null): void;
  onHover(id: string | null): void;
  onFocus(id: string): void;
  onFit(): void;
  onResetZoom(): void;
  onClearSelection(): void;
  onFocusSearch(): void;
  onCameraChanged(): void;
}

const DRAG_THRESHOLD = 4;
const KEY_PAN = 80;

/** Pointer, wheel and keyboard interaction for the canvas. */
export class InteractionController {
  private readonly disposers: (() => void)[] = [];
  private panning = false;
  private pointerId = -1;
  private lastX = 0;
  private lastY = 0;
  private startX = 0;
  private startY = 0;
  private moved = false;

  constructor(private readonly host: InteractionHost) {}

  attach(): void {
    const element = this.host.element;
    this.on(element, "pointerdown", this.handlePointerDown);
    this.on(element, "pointermove", this.handlePointerMove);
    this.on(element, "pointerup", this.handlePointerUp);
    this.on(element, "pointercancel", this.handlePointerUp);
    this.on(element, "wheel", this.handleWheel, { passive: false });
    this.on(element, "dblclick", this.handleDoubleClick);
    this.on(element, "keydown", this.handleKeyDown);
    this.on(element, "pointerleave", () => this.host.onHover(null));
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.panning = false;
  }

  private on<E extends Event>(
    element: HTMLElement,
    type: string,
    listener: (event: E) => void,
    options?: AddEventListenerOptions,
  ): void {
    const handler = listener as EventListener;
    element.addEventListener(type, handler, options);
    this.disposers.push(() => element.removeEventListener(type, handler, options));
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 1) return;
    this.panning = true;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.moved = false;
    this.host.element.setPointerCapture(event.pointerId);
    this.host.element.classList.add("is-panning");
    this.host.element.focus();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.panning && event.pointerId === this.pointerId) {
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      if (Math.abs(event.clientX - this.startX) + Math.abs(event.clientY - this.startY) > DRAG_THRESHOLD) {
        this.moved = true;
      }
      if (dx === 0 && dy === 0) return;
      const camera = this.host.getCamera();
      camera.panByScreen(dx, dy);
      this.host.requestRender();
      this.host.onCameraChanged();
      return;
    }
    this.updateHover(event);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.panning) return;
    this.panning = false;
    this.host.element.classList.remove("is-panning");
    if (this.host.element.hasPointerCapture(event.pointerId)) {
      this.host.element.releasePointerCapture(event.pointerId);
    }
    if (!this.moved && event.button === 0 && event.type === "pointerup") {
      const node = this.nodeAt(event);
      this.host.onSelect(node ? node.id : null);
    }
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const camera = this.host.getCamera();
    const point = this.localPoint(event);
    const action = resolveWheelAction({
      behavior: this.host.getWheelBehavior(),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
    if (action.kind === "zoom") {
      camera.zoomAt(point, camera.scale * action.factor);
    } else {
      camera.panByScreen(action.dx, action.dy);
    }
    this.host.requestRender();
    this.host.onCameraChanged();
  };

  private handleDoubleClick = (event: MouseEvent): void => {
    const node = this.nodeAt(event);
    if (node) {
      event.preventDefault();
      this.host.onFocus(node.id);
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const camera = this.host.getCamera();
    const viewport = this.host.getViewport();
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    let handled = true;

    switch (event.key) {
      case "+":
      case "=":
        camera.zoomAt(center, camera.scale * 1.25);
        break;
      case "-":
      case "_":
        camera.zoomAt(center, camera.scale / 1.25);
        break;
      case "0":
        this.host.onResetZoom();
        return;
      case "f":
      case "F":
        this.host.onFit();
        return;
      case "Escape":
        this.host.onClearSelection();
        return;
      case "/":
        this.host.onFocusSearch();
        return;
      case "ArrowLeft":
        camera.panByScreen(KEY_PAN, 0);
        break;
      case "ArrowRight":
        camera.panByScreen(-KEY_PAN, 0);
        break;
      case "ArrowUp":
        camera.panByScreen(0, KEY_PAN);
        break;
      case "ArrowDown":
        camera.panByScreen(0, -KEY_PAN);
        break;
      default:
        handled = false;
    }

    if (!handled) return;
    event.preventDefault();
    this.host.requestRender();
    this.host.onCameraChanged();
  };

  private updateHover(event: PointerEvent): void {
    const node = this.nodeAt(event);
    this.host.onHover(node ? node.id : null);
  }

  private nodeAt(event: MouseEvent): { id: string } | null {
    const scene = this.host.getScene();
    if (!scene) return null;
    const point = this.host.getCamera().screenToWorld(this.localPoint(event));
    const node = hitTestNode(scene, point);
    return node ? { id: node.id } : null;
  }

  private localPoint(event: MouseEvent): { x: number; y: number } {
    const rect = this.host.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}
