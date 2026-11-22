import type { PrgEdge, PrgNode, Rgba, Rect } from "../format/types.ts";
import type { Camera, Viewport } from "../scene/camera.ts";
import { invertForContrast, rgbaToCss } from "../scene/color.ts";
import { parseCssColor } from "../scene/css-color.ts";
import { edgeMidpoint } from "../scene/edge-geometry.ts";
import { fontSpecOf, fitTextRect, layoutTextNode, type TextLayout } from "../scene/text-layout.ts";
import type { TextMeasurer } from "../scene/text-measurer.ts";
import type { Scene, SceneEdge } from "../scene/scene.ts";
import type { RenderTheme } from "./theme.ts";

const SECTION_TITLE_SIZE = 20;
const EDGE_LABEL_SIZE = 20;
const ARROW_SIZE = 11;
const GRID_STEP = 96;
const MIN_DRAWN_FONT = 6;
/** Below this on-screen font size, transparent nodes get a hint of fill. */
const LOW_ZOOM_FILL_THRESHOLD = 12;
const LOW_ZOOM_FILL_ALPHA = 0.2;

export interface RenderOptions {
  scene: Scene;
  camera: Camera;
  viewport: Viewport;
  selection: ReadonlySet<string>;
  hoveredId: string | null;
  showGrid: boolean;
}

export interface RendererDeps {
  theme: RenderTheme;
  measurer: TextMeasurer;
  imageFor(attachmentId: string): CanvasImageSource | null;
  requestImage(attachmentId: string): void;
}

/** Paints a scene in world coordinates onto a device-pixel-ratio aware canvas. */
export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private dpr = 1;
  private readonly layouts = new Map<string, { rect: Rect; layout: TextLayout }>();
  private readonly visualRects = new Map<string, { source: Rect; rect: Rect }>();
  private lowZoomFill = "rgba(128, 128, 128, 0.2)";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private dependencies: RendererDeps,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas context is unavailable");
    this.context = context;
  }

  setDependencies(dependencies: RendererDeps): void {
    this.dependencies = dependencies;
    this.layouts.clear();
    this.visualRects.clear();
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
  }

  clear(): void {
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(options: RenderOptions): void {
    const { scene, camera, viewport, selection } = options;
    const context = this.context;
    const dpr = this.dpr;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(
      dpr * camera.scale,
      0,
      0,
      dpr * camera.scale,
      -camera.x * camera.scale * dpr,
      -camera.y * camera.scale * dpr,
    );

    const world = camera.worldViewport(viewport);
    this.lowZoomFill = withAlpha(this.dependencies.theme.border, LOW_ZOOM_FILL_ALPHA);
    if (options.showGrid) this.drawGrid(world, camera.scale);

    for (const section of scene.sections) {
      if (rectVisible(section.rect, world)) this.drawSection(section, camera);
    }

    for (const node of scene.nodes) {
      if (!rectVisible(node.rect, world)) continue;
      this.drawNode(node, camera, selection.has(node.id));
      if (options.hoveredId === node.id && !selection.has(node.id)) {
        this.strokeOutline(this.visualRect(node), 1 / camera.scale, true, 0.45);
      }
    }

    for (const item of scene.edges) {
      if (edgeVisible(item, world)) this.drawEdge(item);
    }

    for (const id of selection) {
      const node = scene.nodeById.get(id);
      if (node) this.strokeOutline(this.visualRect(node), 2 / camera.scale, false, 1);
    }
  }

  /** The rectangle actually painted for a node (text boxes grow to fit their text). */
  private visualRect(node: PrgNode): Rect {
    if (node.kind !== "text") return node.rect;
    const cached = this.visualRects.get(node.id);
    if (
      cached &&
      cached.source.x === node.rect.x &&
      cached.source.y === node.rect.y &&
      cached.source.width === node.rect.width &&
      cached.source.height === node.rect.height
    ) {
      return cached.rect;
    }
    const rect = fitTextRect(node, this.dependencies.measurer);
    this.visualRects.set(node.id, { source: node.rect, rect });
    return rect;
  }

  private drawNode(node: PrgNode, camera: Camera, selected: boolean): void {
    switch (node.kind) {
      case "text":
        this.drawTextNode(node, camera, selected);
        return;
      case "image":
        this.drawImageNode(node);
        return;
      case "unknown":
        this.drawUnknownNode(node);
        return;
      case "latex":
      case "section":
        return;
    }
  }

  private drawGrid(world: Rect, scale: number): void {
    const context = this.context;
    let step = GRID_STEP;
    while (step * scale < 24) step *= 2;
    while (step * scale > 192) step /= 2;
    const startX = Math.floor(world.x / step) * step;
    const startY = Math.floor(world.y / step) * step;

    context.save();
    context.strokeStyle = this.dependencies.theme.grid;
    context.lineWidth = 1 / scale;
    context.globalAlpha = 0.55;
    context.beginPath();
    for (let x = startX; x <= world.x + world.width; x += step) {
      context.moveTo(x, world.y);
      context.lineTo(x, world.y + world.height);
    }
    for (let y = startY; y <= world.y + world.height; y += step) {
      context.moveTo(world.x, y);
      context.lineTo(world.x + world.width, y);
    }
    context.stroke();
    context.restore();
  }

  private drawSection(section: Extract<PrgNode, { kind: "section" }>, camera: Camera): void {
    const context = this.context;
    const theme = this.dependencies.theme;
    const fill = section.color.a > 0 ? rgbaToCss(section.color) : theme.sectionFill;

    context.save();
    this.roundRectPath(section.rect, 12);
    context.fillStyle = fill;
    context.fill();
    if (section.borderStyle !== "none") {
      context.strokeStyle = theme.border;
      context.lineWidth = 2;
      context.setLineDash(section.borderStyle === "dashed" ? [12 / camera.scale, 8 / camera.scale] : []);
      this.roundRectPath(section.rect, 12);
      context.stroke();
    }
    context.setLineDash([]);
    if (section.text.length > 0) {
      context.fillStyle = section.color.a === 1 ? rgbaToCss(invertForContrast(section.color)) : theme.text;
      context.font = this.dependencies.measurer.fontString(SECTION_TITLE_SIZE);
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(section.text, section.rect.x + 12, section.rect.y + 8 + SECTION_TITLE_SIZE * 0.8);
    }
    context.restore();
  }

  private drawTextNode(node: Extract<PrgNode, { kind: "text" }>, camera: Camera, selected: boolean): void {
    const context = this.context;
    const theme = this.dependencies.theme;
    const drawRect = this.visualRect(node);
    const layout = this.layoutOf(node, drawRect);
    const renderedFontSize = layout.fontSize * camera.scale;

    if (node.color.a > 0) {
      this.roundRectPath(drawRect, layout.radius);
      context.fillStyle = rgbaToCss(node.color);
      context.fill();
    } else if (renderedFontSize < LOW_ZOOM_FILL_THRESHOLD) {
      // At low zoom the text becomes unreadable; a translucent fill keeps the
      // node silhouette visible, mirroring Project Graph's behaviour.
      this.roundRectPath(drawRect, layout.radius);
      context.fillStyle = this.lowZoomFill;
      context.fill();
    }
    if (node.borderStyle !== "none") {
      this.roundRectPath(drawRect, layout.radius);
      context.strokeStyle = selected ? theme.selection : theme.border;
      context.lineWidth = layout.borderWidth;
      context.setLineDash(node.borderStyle === "dashed" ? [8 / camera.scale, 6 / camera.scale] : []);
      context.stroke();
      context.setLineDash([]);
    }

    if (renderedFontSize < MIN_DRAWN_FONT) return;

    context.fillStyle = textColorFor(node.color, theme.text);
    context.font = this.dependencies.measurer.fontString(layout.fontSize, fontSpecOf(node));
    context.textAlign = "left";
    context.textBaseline = "middle";
    layout.lines.forEach((line, index) => {
      const y = layout.originY + index * layout.lineHeight + layout.lineHeight / 2;
      context.fillText(line, layout.originX, y);
    });
  }

  private drawImageNode(node: Extract<PrgNode, { kind: "image" }>): void {
    const context = this.context;
    const image = this.dependencies.imageFor(node.attachmentId);
    if (image) {
      context.drawImage(image, node.rect.x, node.rect.y, node.rect.width, node.rect.height);
      return;
    }
    this.dependencies.requestImage(node.attachmentId);
    this.placeholder(node.rect, "图片");
  }

  private drawUnknownNode(node: Extract<PrgNode, { kind: "unknown" }>): void {
    this.placeholder(node.rect, node.typeName);
  }

  private placeholder(rect: Rect, label: string): void {
    const context = this.context;
    const theme = this.dependencies.theme;
    this.roundRectPath(rect, 8);
    context.fillStyle = theme.unknownFill;
    context.fill();
    context.strokeStyle = theme.unknownBorder;
    context.lineWidth = 1.5;
    context.setLineDash([8, 6]);
    this.roundRectPath(rect, 8);
    context.stroke();
    context.setLineDash([]);
    if (rect.width > 40 && rect.height > 20) {
      context.fillStyle = theme.mutedText;
      context.font = this.dependencies.measurer.fontString(16);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
  }

  private drawEdge(item: SceneEdge): void {
    const context = this.context;
    const theme = this.dependencies.theme;
    const { edge, geometry } = item;
    const stroke = edge.color.a > 0 ? rgbaToCss(edge.color) : theme.edge;

    context.save();
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(geometry.start.x, geometry.start.y);
    context.bezierCurveTo(
      geometry.control1.x,
      geometry.control1.y,
      geometry.control2.x,
      geometry.control2.y,
      geometry.end.x,
      geometry.end.y,
    );
    context.stroke();

    if (edge.arrowType !== "none" && !geometry.selfLoop) {
      drawArrow(context, geometry.end, geometry.control2, stroke, ARROW_SIZE);
    }
    if (edge.text.length > 0) {
      // The label follows the drawn curve; a control point is pushed outward
      // along the edge normal and can sit far away from it (e.g. right → left).
      const anchor = edgeMidpoint(geometry);
      this.drawEdgeLabel(edge, anchor.x, anchor.y);
    }
    context.restore();
  }

  private drawEdgeLabel(edge: PrgEdge, x: number, y: number): void {
    const context = this.context;
    const theme = this.dependencies.theme;
    context.font = this.dependencies.measurer.fontString(EDGE_LABEL_SIZE);
    const width = context.measureText(edge.text).width;
    const height = EDGE_LABEL_SIZE * 1.3;
    context.fillStyle = theme.background;
    context.fillRect(x - width / 2 - 4, y - height / 2, width + 8, height);
    context.fillStyle = theme.text;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(edge.text, x, y);
  }

  private strokeOutline(rect: Rect, width: number, dashed: boolean, alpha: number): void {
    const context = this.context;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = this.dependencies.theme.selection;
    context.lineWidth = width;
    context.setLineDash(dashed ? [8 / Math.max(width, 0.01), 6 / Math.max(width, 0.01)] : []);
    this.roundRectPath(rect, 16);
    context.stroke();
    context.restore();
  }

  private layoutOf(node: Extract<PrgNode, { kind: "text" }>, rect: Rect): TextLayout {
    const cached = this.layouts.get(node.id);
    if (
      cached &&
      cached.rect.x === rect.x &&
      cached.rect.y === rect.y &&
      cached.rect.width === rect.width &&
      cached.rect.height === rect.height
    ) {
      return cached.layout;
    }
    const layout = layoutTextNode({ ...node, rect }, this.dependencies.measurer);
    this.layouts.set(node.id, { rect, layout });
    return layout;
  }

  private roundRectPath(rect: Rect, radius: number): void {
    const context = this.context;
    const clamped = Math.max(0, Math.min(radius, Math.min(rect.width, rect.height) / 2));
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(rect.x, rect.y, rect.width, rect.height, clamped);
      return;
    }
    context.moveTo(rect.x + clamped, rect.y);
    context.lineTo(rect.x + rect.width - clamped, rect.y);
    context.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + clamped);
    context.lineTo(rect.x + rect.width, rect.y + rect.height - clamped);
    context.quadraticCurveTo(
      rect.x + rect.width,
      rect.y + rect.height,
      rect.x + rect.width - clamped,
      rect.y + rect.height,
    );
    context.lineTo(rect.x + clamped, rect.y + rect.height);
    context.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - clamped);
    context.lineTo(rect.x, rect.y + clamped);
    context.quadraticCurveTo(rect.x, rect.y, rect.x + clamped, rect.y);
    context.closePath();
  }
}

function textColorFor(color: Rgba, themeText: string): string {
  if (color.a === 0) return themeText;
  if (color.a === 1) return rgbaToCss(invertForContrast(color));
  return themeText;
}

function rectVisible(rect: Rect, world: Rect): boolean {
  return (
    rect.x <= world.x + world.width &&
    rect.x + rect.width >= world.x &&
    rect.y <= world.y + world.height &&
    rect.y + rect.height >= world.y
  );
}

function edgeVisible(item: SceneEdge, world: Rect): boolean {
  const { geometry } = item;
  const minX = Math.min(geometry.start.x, geometry.end.x, geometry.control1.x, geometry.control2.x);
  const maxX = Math.max(geometry.start.x, geometry.end.x, geometry.control1.x, geometry.control2.x);
  const minY = Math.min(geometry.start.y, geometry.end.y, geometry.control1.y, geometry.control2.y);
  const maxY = Math.max(geometry.start.y, geometry.end.y, geometry.control1.y, geometry.control2.y);
  return (
    maxX >= world.x && minX <= world.x + world.width && maxY >= world.y && minY <= world.y + world.height
  );
}

function drawArrow(
  context: CanvasRenderingContext2D,
  tip: { x: number; y: number },
  from: { x: number; y: number },
  color: string,
  size: number,
): void {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(tip.x - size * Math.cos(angle - Math.PI / 7), tip.y - size * Math.sin(angle - Math.PI / 7));
  context.lineTo(tip.x - size * Math.cos(angle + Math.PI / 7), tip.y - size * Math.sin(angle + Math.PI / 7));
  context.closePath();
  context.fill();
  context.restore();
}

/** Re-colours any CSS colour string with a new alpha. */
function withAlpha(css: string, alpha: number): string {
  const color = parseCssColor(css, { r: 128, g: 128, b: 128, a: 1 });
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}
