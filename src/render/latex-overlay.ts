import katex from "katex";
import type { Rect } from "../format/types.ts";
import type { Camera, Viewport } from "../scene/camera.ts";

export interface LatexItem {
  id: string;
  source: string;
  rect: Rect;
  fontSize: number;
}

/**
 * LaTeX nodes are drawn as HTML on top of the canvas. KaTeX's MathML output
 * needs no bundled fonts, which keeps the plugin fully offline and small.
 */
export class LatexOverlay {
  private readonly elements = new Map<string, HTMLElement>();
  private readonly htmlCache = new Map<string, string>();
  private disposed = false;

  constructor(private readonly container: HTMLElement) {}

  update(items: LatexItem[], camera: Camera, viewport: Viewport): void {
    if (this.disposed) return;
    const visible = new Set<string>();

    for (const item of items) {
      const screen = camera.worldToScreen({ x: item.rect.x, y: item.rect.y });
      const width = item.rect.width * camera.scale;
      const height = item.rect.height * camera.scale;
      if (
        screen.x + width < -64 ||
        screen.y + height < -64 ||
        screen.x > viewport.width + 64 ||
        screen.y > viewport.height + 64
      ) {
        continue;
      }

      const element = this.elementFor(item.id);
      element.innerHTML = this.htmlFor(item.source);
      element.style.left = `${screen.x}px`;
      element.style.top = `${screen.y}px`;
      element.style.width = `${Math.max(1, width)}px`;
      element.style.height = `${Math.max(1, height)}px`;
      element.style.fontSize = `${Math.max(4, item.fontSize * camera.scale)}px`;
      element.style.display = "flex";
      visible.add(item.id);
    }

    for (const [id, element] of this.elements) {
      if (!visible.has(id)) element.style.display = "none";
    }
  }

  /** Drops cached elements, e.g. when a different document is loaded. */
  reset(): void {
    for (const element of this.elements.values()) element.remove();
    this.elements.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
    this.htmlCache.clear();
  }

  private elementFor(id: string): HTMLElement {
    const existing = this.elements.get(id);
    if (existing) return existing;
    const element = this.container.ownerDocument.createElement("div");
    element.className = "prg-viewer-latex";
    this.container.appendChild(element);
    this.elements.set(id, element);
    return element;
  }

  private htmlFor(source: string): string {
    const cached = this.htmlCache.get(source);
    if (cached !== undefined) return cached;
    let html: string;
    try {
      html = katex.renderToString(source, { output: "mathml", throwOnError: false, displayMode: false });
    } catch {
      html = `<code>${escapeHtml(source)}</code>`;
    }
    this.htmlCache.set(source, html);
    return html;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
