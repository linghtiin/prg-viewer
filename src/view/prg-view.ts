import { FileView, type IconName, Notice, Platform, type TFile, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_PRG } from "../constants.ts";
import { parsePrg } from "../format/build-document.ts";
import { PrgError } from "../format/errors.ts";
import { EMPTY_RECT } from "../format/types.ts";
import type { PrgDocument, PrgNode } from "../format/types.ts";
import { buildFileUri, openExternalUri } from "../external-open.ts";
import { ImageCache } from "../render/image-cache.ts";
import { LatexOverlay, type LatexItem } from "../render/latex-overlay.ts";
import { CanvasRenderer } from "../render/canvas-renderer.ts";
import { readThemeFromElement, type RenderTheme } from "../render/theme.ts";
import { Camera } from "../scene/camera.ts";
import { clamp, rectCenter, rectsIntersect } from "../scene/geometry.ts";
import { buildScene, type Scene } from "../scene/scene.ts";
import { fontSizeForLevel } from "../scene/text-layout.ts";
import {
  DEFAULT_DETAILS_RATIO,
  DEFAULT_OUTLINE_WIDTH,
  MAX_DETAILS_RATIO,
  MAX_OUTLINE_WIDTH,
  MIN_DETAILS_RATIO,
  MIN_OUTLINE_WIDTH,
  type OutlineMode,
} from "../settings.ts";
import {
  createApproximateTextMeasurer,
  createCanvasTextMeasurer,
  type TextMeasurer,
} from "../scene/text-measurer.ts";
import { copyText } from "../util/clipboard.ts";
import { bytesToBlob } from "../util/blob.ts";
import { createLogger, type Logger } from "../util/log.ts";
import { renderDetails } from "./details-panel.ts";
import { InteractionController, type InteractionHost } from "./interactions.ts";
import {
  collapsibleOutlineIds,
  flattenOutline,
  groupForOutline,
  nodeLabel,
  outlineAncestors,
  renderOutline,
  resolveOutlineNavigation,
  type NavigationDirection,
  type OutlineRow,
} from "./outline-panel.ts";
import { buildChrome, type ChromeActions, type ChromeHandles } from "./view-chrome.ts";
import type PrgViewerPlugin from "../main.ts";

const ARROW_DIRECTIONS: Record<string, NavigationDirection | undefined> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Read-only view that renders a Project Graph canvas inside Obsidian. */
export class PrgView extends FileView {
  override allowNoFile = false;

  private readonly plugin: PrgViewerPlugin;
  private readonly logger: Logger;
  private chrome: ChromeHandles | null = null;
  private renderer: CanvasRenderer | null = null;
  private latex: LatexOverlay | null = null;
  private images: ImageCache | null = null;
  private measurer: TextMeasurer | null = null;
  private interactions: InteractionController | null = null;
  private observer: ResizeObserver | null = null;
  private documentModel: PrgDocument | null = null;
  private scene: Scene | null = null;
  private camera = new Camera();
  private readonly selection = new Set<string>();
  private hoveredId: string | null = null;
  private theme: RenderTheme | null = null;
  private rafId = 0;
  private pendingFit = false;
  private pendingLoad = false;
  private outlineVisible = false;
  /** Sidebar geometry is session-only, never persisted to settings. */
  private outlineWidth = DEFAULT_OUTLINE_WIDTH;
  private detailsRatio = DEFAULT_DETAILS_RATIO;
  private readonly collapsedOutline = new Set<string>();
  private outlineFileKey: string | null = null;
  private matches: PrgNode[] = [];
  private matchIndex = 0;
  private cameraSaveTimer: number | null = null;
  private reloadTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: PrgViewerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.logger = createLogger("prg-viewer", () => this.plugin.settings.debugLogging);
  }

  override getViewType(): string {
    return VIEW_TYPE_PRG;
  }

  override getDisplayText(): string {
    return this.file?.basename ?? "Project Graph";
  }

  override getIcon(): IconName {
    return "network";
  }

  override async onOpen(): Promise<void> {
    this.chrome = buildChrome(this.contentEl, this.actions());
    this.outlineVisible = this.plugin.settings.showOutlineByDefault;
    this.chrome.setOutlineVisible(this.outlineVisible);
    this.chrome.setOutlineMode(this.plugin.settings.outlineMode);
    this.applyOutlineLayout();
    this.registerDomEvent(this.chrome.outlinePanel, "keydown", (event) => this.handleOutlineKeyDown(event));

    this.theme = readThemeFromElement(this.contentEl);
    this.measurer = this.createMeasurer();
    this.renderer = new CanvasRenderer(this.chrome.canvas, this.rendererDeps());
    this.latex = new LatexOverlay(this.chrome.latexLayer);
    this.images = new ImageCache(this.plugin.settings.maxImageCacheMB * 1024 * 1024);

    this.interactions = new InteractionController(this.interactionHost());
    this.interactions.attach();

    this.observer = new ResizeObserver(() => this.handleResize());
    this.observer.observe(this.chrome.canvasWrap);

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.file && file.path === this.file.path) this.scheduleReload();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.file && file.path === this.file.path) {
          this.clearDocument();
          this.chrome?.showError("文件已不可用", "该 .prg 文件已被删除或移动。", null, false);
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.applyTheme();
      }),
    );

    this.handleResize();
    if (this.pendingLoad) {
      this.pendingLoad = false;
      await this.loadDocument();
    }
  }

  override async onLoadFile(file: TFile): Promise<void> {
    this.file = file;
    if (this.chrome) {
      // A new file starts from the configured defaults; manual drags stay session-only.
      this.applyOutlineLayout();
      await this.loadDocument();
    } else {
      this.pendingLoad = true;
    }
  }

  override onUnloadFile(_file: TFile): Promise<void> {
    this.clearDocument();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.disposeAll();
    return Promise.resolve();
  }

  /** Called by the plugin when settings change. */
  applySettings(): void {
    this.applyTheme();
    this.applyOutlineMode();
    this.images?.dispose();
    this.images = new ImageCache(this.plugin.settings.maxImageCacheMB * 1024 * 1024);
    this.requestRender();
  }

  /** Re-reads the outline mode from settings and repaints the sidebar. */
  applyOutlineMode(): void {
    this.chrome?.setOutlineMode(this.plugin.settings.outlineMode);
    const selectedId = [...this.selection][0];
    if (selectedId) this.expandOutlineAncestors(selectedId);
    this.refreshOutline();
  }

  /** Applies the configured default sidebar layout to this view (used on open and settings changes). */
  applyOutlineLayout(): void {
    this.outlineWidth = Math.min(
      MAX_OUTLINE_WIDTH,
      Math.max(MIN_OUTLINE_WIDTH, Math.round(this.plugin.settings.outlineWidth)),
    );
    this.detailsRatio = Math.min(
      MAX_DETAILS_RATIO,
      Math.max(MIN_DETAILS_RATIO, this.plugin.settings.detailsRatio),
    );
    this.chrome?.setOutlineWidth(this.outlineWidth);
    this.chrome?.setDetailsRatio(this.detailsRatio);
  }

  private actions(): ChromeActions {
    return {
      fit: () => this.fitView(),
      zoomIn: () => this.zoomBy(1.25),
      zoomOut: () => this.zoomBy(1 / 1.25),
      resetZoom: () => this.resetZoom(),
      toggleOutline: () => this.toggleOutline(),
      setOutlineMode: (mode) => this.setOutlineMode(mode),
      setOutlineWidth: (width) => this.setOutlineWidth(width),
      setDetailsRatio: (ratio) => this.setDetailsRatio(ratio),
      copyLink: () => {
        void this.copyCurrentLink();
      },
      openExternal: () => {
        void this.openInProjectGraph();
      },
      reload: () => {
        void this.loadDocument();
      },
      search: (query) => this.search(query),
      searchNext: () => this.searchNext(),
    };
  }

  private rendererDeps() {
    return {
      theme: this.theme ?? readThemeFromElement(this.contentEl),
      measurer: this.measurer ?? this.createMeasurer(),
      imageFor: (attachmentId: string) => this.images?.get(attachmentId) ?? null,
      requestImage: (attachmentId: string) => this.requestAttachmentImage(attachmentId),
    };
  }

  private createMeasurer(): TextMeasurer {
    const canvas = this.contentEl.ownerDocument.createElement("canvas");
    const context = canvas.getContext("2d");
    return context ? createCanvasTextMeasurer(context) : createApproximateTextMeasurer();
  }

  private interactionHost(): InteractionHost {
    const element = this.chrome?.canvasWrap;
    if (!element) throw new Error("canvas wrapper missing");
    return {
      element,
      getScene: () => this.scene,
      getCamera: () => this.camera,
      getViewport: () => this.viewportSize(),
      getWheelBehavior: () => this.plugin.settings.wheelBehavior,
      requestRender: () => this.requestRender(),
      onSelect: (id: string | null) => this.select(id),
      onHover: (id: string | null) => {
        if (this.hoveredId === id) return;
        this.hoveredId = id;
        this.requestRender();
      },
      onFocus: (id: string) => this.focusNode(id),
      onNavigate: (direction) => this.navigateSelection(direction, "canvas"),
      onFit: () => this.fitView(),
      onResetZoom: () => this.resetZoom(),
      onClearSelection: () => this.select(null),
      onFocusSearch: () => this.chrome?.searchInput.focus(),
      onCameraChanged: () => {
        this.updateStatus();
        this.scheduleCameraSave();
      },
    };
  }

  async loadDocument(): Promise<void> {
    if (!this.file || !this.chrome) return;
    const file = this.file;
    this.chrome.setLoading(true);
    this.chrome.hideError();
    try {
      const buffer = await this.app.vault.readBinary(file);
      if (!this.file || this.file.path !== file.path) return;
      const model = parsePrg(new Uint8Array(buffer));
      this.documentModel = model;
      this.scene = buildScene(model);
      this.syncOutlineState(model, file.path);
      this.chrome.outlineScroll.scrollTop = 0;
      this.selection.clear();
      this.hoveredId = null;
      this.matches = [];
      this.matchIndex = 0;
      this.latex?.reset();
      this.images?.dispose();
      this.images = new ImageCache(this.plugin.settings.maxImageCacheMB * 1024 * 1024);
      this.renderer?.setDependencies(this.rendererDeps());

      this.updateMeta();
      this.refreshOutline();
      this.refreshDetails();

      const saved = this.plugin.settings.rememberCameraPerFile ? this.plugin.getCameraState(file.path) : null;
      if (saved) {
        this.camera = Camera.fromState(saved);
        this.pendingFit = false;
        this.requestRender();
      } else {
        this.pendingFit = true;
        this.handleResize();
      }
      this.updateStatus();
      this.logger.debug(
        `loaded ${file.path}: ${model.nodes.size} nodes, ${model.edges.length} edges, ${model.warnings.length} warnings`,
      );
    } catch (error) {
      this.clearDocument();
      this.showError(error);
    } finally {
      this.chrome?.setLoading(false);
    }
  }

  private clearDocument(): void {
    this.documentModel = null;
    this.scene = null;
    this.selection.clear();
    this.hoveredId = null;
    this.matches = [];
    this.matchIndex = 0;
    this.latex?.reset();
    this.images?.dispose();
    this.requestRender();
  }

  private disposeAll(): void {
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.cameraSaveTimer !== null) {
      window.clearTimeout(this.cameraSaveTimer);
      this.cameraSaveTimer = null;
    }
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    this.interactions?.dispose();
    this.interactions = null;
    this.observer?.disconnect();
    this.observer = null;
    this.latex?.dispose();
    this.latex = null;
    this.images?.dispose();
    this.images = null;
    this.renderer = null;
    this.scene = null;
    this.documentModel = null;
    this.chrome = null;
  }

  private showError(error: unknown): void {
    const title = "无法打开 Project Graph 文件";
    let message = "解析 .prg 文件时发生未知错误。";
    let details: string | null = null;
    if (error instanceof PrgError) {
      message = error.message;
      details = error.details ?? null;
    } else if (error instanceof Error) {
      message = error.message;
      details = error.stack ?? null;
    } else {
      details = String(error);
    }
    this.chrome?.showError(title, message, details, Platform.isDesktopApp);
    this.chrome?.setMeta("未加载");
  }

  private scheduleReload(): void {
    if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = null;
      void this.loadDocument();
    }, 400);
  }

  private viewportSize(): { width: number; height: number } {
    const element = this.chrome?.canvasWrap;
    return { width: element?.clientWidth ?? 0, height: element?.clientHeight ?? 0 };
  }

  private handleResize(): void {
    const viewport = this.viewportSize();
    if (viewport.width <= 0 || viewport.height <= 0) return;
    if (this.pendingFit) {
      this.pendingFit = false;
      this.camera.fit(this.scene?.bounds ?? EMPTY_RECT, viewport);
    }
    this.requestRender();
  }

  private requestRender(): void {
    if (this.rafId !== 0) return;
    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = 0;
      this.renderFrame();
    });
  }

  private renderFrame(): void {
    if (!this.renderer || !this.chrome) return;
    const viewport = this.viewportSize();
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.resize(viewport.width, viewport.height, dpr);
    if (!this.scene) {
      this.renderer.clear();
      return;
    }
    this.renderer.render({
      scene: this.scene,
      camera: this.camera,
      viewport,
      selection: this.selection,
      hoveredId: this.hoveredId,
      showGrid: this.plugin.settings.background === "grid",
    });
    this.renderLatex(viewport);
  }

  private renderLatex(viewport: { width: number; height: number }): void {
    if (!this.latex || !this.scene) return;
    const items: LatexItem[] = [];
    for (const node of this.scene.nodes) {
      if (node.kind !== "latex") continue;
      items.push({
        id: node.id,
        source: node.source,
        rect: node.rect,
        fontSize: fontSizeForLevel(node.fontScaleLevel),
      });
    }
    this.latex.update(items, this.camera, viewport);
  }

  private requestAttachmentImage(attachmentId: string): void {
    const attachment = this.documentModel?.attachments.get(attachmentId);
    if (!attachment) return;
    this.images?.request(
      attachmentId,
      () => bytesToBlob(attachment.bytes, attachment.mime),
      () => this.requestRender(),
    );
  }

  fitView(): void {
    const viewport = this.viewportSize();
    if (viewport.width <= 0 || viewport.height <= 0) {
      this.pendingFit = true;
      return;
    }
    this.camera.fit(this.scene?.bounds ?? EMPTY_RECT, viewport);
    this.afterCameraChange();
  }

  resetZoom(): void {
    const viewport = this.viewportSize();
    this.camera.zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, 1);
    this.afterCameraChange();
  }

  zoomBy(factor: number): void {
    const viewport = this.viewportSize();
    this.camera.zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, this.camera.scale * factor);
    this.afterCameraChange();
  }

  private afterCameraChange(): void {
    this.updateStatus();
    this.requestRender();
    this.scheduleCameraSave();
  }

  private updateStatus(): void {
    this.chrome?.setStatus(`${Math.round(this.camera.scale * 100)}%`);
  }

  private scheduleCameraSave(): void {
    if (!this.file || !this.plugin.settings.rememberCameraPerFile) return;
    if (this.cameraSaveTimer !== null) window.clearTimeout(this.cameraSaveTimer);
    this.cameraSaveTimer = window.setTimeout(() => {
      this.cameraSaveTimer = null;
      if (this.file) this.plugin.setCameraState(this.file.path, this.camera.toJSON());
    }, 500);
  }

  private select(id: string | null): void {
    this.selection.clear();
    if (id) {
      this.selection.add(id);
      this.expandOutlineAncestors(id);
    }
    this.refreshOutline();
    this.refreshDetails();
    this.requestRender();
  }

  private focusNode(id: string): void {
    const node = this.scene?.nodeById.get(id);
    if (!node) return;
    this.selection.clear();
    this.selection.add(id);
    this.expandOutlineAncestors(id);
    this.refreshOutline();
    this.refreshDetails();

    const viewport = this.viewportSize();
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const targetScale = clamp(this.camera.scale, 0.6, 1.5);
    this.camera.zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, targetScale);
    this.camera.centerOn(rectCenter(node.rect), viewport);
    this.afterCameraChange();
  }

  toggleOutline(): void {
    this.outlineVisible = !this.outlineVisible;
    this.chrome?.setOutlineVisible(this.outlineVisible);
    this.requestRender();
  }

  private get outlineMode(): OutlineMode {
    return this.plugin.settings.outlineMode;
  }

  private setOutlineMode(mode: OutlineMode): void {
    if (this.plugin.settings.outlineMode === mode) return;
    this.plugin.settings.outlineMode = mode;
    void this.plugin.saveSettings();
    this.plugin.applyOutlineModeToViews();
  }

  /** Reopens every collapsed branch on the path to `id` so the selection stays visible. */
  private expandOutlineAncestors(id: string): void {
    if (this.outlineMode !== "tree" || !this.documentModel) return;
    for (const ancestorId of outlineAncestors(this.documentModel, id)) {
      this.collapsedOutline.delete(ancestorId);
    }
  }

  private toggleOutlineCollapse(id: string): void {
    this.setOutlineCollapsed(id, !this.collapsedOutline.has(id));
  }

  private setOutlineCollapsed(id: string, collapsed: boolean): void {
    if (collapsed) {
      this.collapsedOutline.add(id);
    } else {
      this.collapsedOutline.delete(id);
    }
    this.refreshOutline();
  }

  private handleOutlineKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    this.navigateSelection(direction, "outline");
  }

  private navigateSelection(direction: NavigationDirection, context: "canvas" | "outline"): void {
    const model = this.documentModel;
    if (!model) return;

    if (context === "outline" && this.outlineMode === "category") {
      const rows: OutlineRow[] = groupForOutline(model).flatMap((group) =>
        group.nodes.map((node) => ({
          key: node.id,
          id: node.id,
          parentId: null,
          parentKey: null,
          hasChildren: false,
        })),
      );
      const move = resolveOutlineNavigation(rows, [...this.selection][0] ?? null, direction);
      if (move?.kind === "select") this.moveSelection(move.id);
      return;
    }

    const rows = flattenOutline(model, context === "outline" ? this.collapsedOutline : undefined);
    const current =
      context === "outline"
        ? (this.focusedOutlineKey() ?? this.navigationAnchor(rows))
        : this.navigationAnchor(rows);
    const move = resolveOutlineNavigation(rows, current, direction, {
      allowCollapse: context === "outline",
      collapsed: this.collapsedOutline,
    });
    if (!move) return;
    if (move.kind === "select") {
      this.moveSelection(move.id);
    } else {
      this.setOutlineCollapsed(move.id, move.kind === "collapse");
    }
  }

  /** Row key of the focused outline entry; rows are per group, so ids are ambiguous. */
  private focusedOutlineKey(): string | null {
    const active = this.chrome?.outlinePanel.ownerDocument.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const row = active.closest("[data-outline-key]");
    return row instanceof HTMLElement ? (row.dataset.outlineKey ?? null) : null;
  }

  /** Deepest row containing the selection, so navigation still works inside a collapsed branch. */
  private navigationAnchor(rows: readonly OutlineRow[]): string | null {
    const selectedId = [...this.selection][0] ?? null;
    if (!selectedId || !this.documentModel) return selectedId;
    if (rows.some((row) => row.id === selectedId)) return selectedId;
    const ancestors = outlineAncestors(this.documentModel, selectedId);
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const ancestorId = ancestors[index];
      if (ancestorId && rows.some((row) => row.id === ancestorId)) return ancestorId;
    }
    return null;
  }

  /** Selects a node and brings it into view without changing the zoom level. */
  private moveSelection(id: string): void {
    const node = this.scene?.nodeById.get(id);
    if (!node) return;
    this.selection.clear();
    this.selection.add(id);
    this.expandOutlineAncestors(id);
    this.refreshOutline();
    this.refreshDetails();
    this.revealNode(node);
    this.requestRender();
  }

  private revealNode(node: PrgNode): void {
    const viewport = this.viewportSize();
    if (viewport.width <= 0 || viewport.height <= 0) return;
    if (rectsIntersect(node.rect, this.camera.worldViewport(viewport))) return;
    this.camera.centerOn(rectCenter(node.rect), viewport);
    this.scheduleCameraSave();
  }

  /** Session-only outline width; never written to settings. */
  private setOutlineWidth(width: number): void {
    this.outlineWidth = Math.min(MAX_OUTLINE_WIDTH, Math.max(MIN_OUTLINE_WIDTH, Math.round(width)));
    this.chrome?.setOutlineWidth(this.outlineWidth);
  }

  /** Session-only details-pane ratio; zero resets to the configured default. */
  private setDetailsRatio(ratio: number): void {
    const source = ratio <= 0 ? this.plugin.settings.detailsRatio : ratio;
    this.detailsRatio =
      Math.round(Math.min(MAX_DETAILS_RATIO, Math.max(MIN_DETAILS_RATIO, source)) * 1000) / 1000;
    this.chrome?.setDetailsRatio(this.detailsRatio);
  }

  private expandOutlineAll(): void {
    this.collapsedOutline.clear();
    this.refreshOutline();
  }

  private collapseOutlineAll(): void {
    if (!this.documentModel) return;
    this.collapsedOutline.clear();
    for (const id of collapsibleOutlineIds(this.documentModel)) {
      this.collapsedOutline.add(id);
    }
    this.refreshOutline();
  }

  /** Drops collapse state when another file is opened; prunes ids that vanished on reload. */
  private syncOutlineState(model: PrgDocument, path: string): void {
    if (this.outlineFileKey !== path) {
      this.collapsedOutline.clear();
      this.outlineFileKey = path;
      return;
    }
    for (const id of this.collapsedOutline) {
      if (!model.nodes.has(id)) this.collapsedOutline.delete(id);
    }
  }

  private updateMeta(): void {
    const model = this.documentModel;
    if (!model || !this.chrome) return;
    const summary = `v${model.metadata.version} · ${model.nodes.size} 节点 · ${model.edges.length} 连线`;
    const warnings = model.warnings.length;
    this.chrome.setMeta(summary, warnings > 0 ? `${warnings} 条提示` : undefined);
  }

  private refreshOutline(): void {
    if (!this.chrome) return;
    const model = this.documentModel;
    if (!model) {
      this.chrome.outlinePanel.replaceChildren();
      return;
    }
    renderOutline(
      this.chrome.outlinePanel,
      model,
      { mode: this.outlineMode, selected: this.selection, collapsed: this.collapsedOutline },
      {
        select: (id) => this.focusNode(id),
        toggleCollapse: (id) => this.toggleOutlineCollapse(id),
        expandAll: () => this.expandOutlineAll(),
        collapseAll: () => this.collapseOutlineAll(),
      },
    );
  }

  private refreshDetails(): void {
    if (!this.chrome) return;
    this.chrome.detailsScroll.scrollTop = 0;
    const nodes: PrgNode[] = [];
    for (const id of this.selection) {
      const node = this.documentModel?.nodes.get(id);
      if (node) nodes.push(node);
    }
    renderDetails(this.chrome.detailsPanel, this.documentModel, nodes, {
      copyNodeLink: (id) => {
        void this.copyNodeLink(id);
      },
      openInProjectGraph: () => {
        void this.openInProjectGraph();
      },
    });
  }

  private search(query: string): void {
    if (!this.scene) return;
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) {
      this.matches = [];
      this.matchIndex = 0;
      return;
    }
    this.matches = this.scene.nodes.filter((node) => nodeLabel(node).toLowerCase().includes(trimmed));
    this.matchIndex = 0;
    const first = this.matches[0];
    if (first) {
      this.focusNode(first.id);
    } else {
      this.selection.clear();
      this.refreshOutline();
      this.refreshDetails();
      this.requestRender();
      new Notice("没有匹配的节点");
    }
  }

  private searchNext(): void {
    if (this.matches.length === 0) return;
    this.matchIndex = (this.matchIndex + 1) % this.matches.length;
    const node = this.matches[this.matchIndex];
    if (node) this.focusNode(node.id);
  }

  private selectionExtras(): { target?: string; location?: { x: number; y: number }; zoom?: number } {
    const selected = [...this.selection][0];
    if (selected) return { target: selected };
    const viewport = this.viewportSize();
    return {
      location: this.camera.screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }),
      zoom: this.camera.scale,
    };
  }

  private async copyCurrentLink(): Promise<void> {
    if (!this.file) return;
    const uri = buildFileUri(this.app, this.file, this.selectionExtras());
    if (!uri) {
      new Notice("深链仅在桌面端可用。");
      return;
    }
    const copied = await copyText(uri);
    new Notice(copied ? "已复制 prg:// 链接" : `复制失败，请手动复制：${uri}`);
  }

  private async copyNodeLink(id: string): Promise<void> {
    if (!this.file) return;
    const uri = buildFileUri(this.app, this.file, { target: id });
    if (!uri) {
      new Notice("深链仅在桌面端可用。");
      return;
    }
    const copied = await copyText(uri);
    new Notice(copied ? "已复制节点深链" : `复制失败，请手动复制：${uri}`);
  }

  private async openInProjectGraph(): Promise<void> {
    if (!this.file) return;
    const uri = buildFileUri(this.app, this.file, this.selectionExtras());
    if (!uri) {
      new Notice("深链仅在桌面端可用。");
      return;
    }
    const opened = await openExternalUri(uri);
    if (!opened) {
      const copied = await copyText(uri);
      new Notice(copied ? "无法自动打开 Project Graph，链接已复制。" : `无法自动打开，请手动打开：${uri}`);
    }
  }

  private applyTheme(): void {
    this.theme = readThemeFromElement(this.contentEl);
    this.renderer?.setDependencies(this.rendererDeps());
    this.requestRender();
  }

  /** Currently selected node id, if any (used by commands). */
  getSelectedId(): string | null {
    return [...this.selection][0] ?? null;
  }

  async copySelectedNodeLink(): Promise<void> {
    const id = this.getSelectedId();
    if (!id) {
      new Notice("请先选择一个节点。");
      return;
    }
    await this.copyNodeLink(id);
  }
}
