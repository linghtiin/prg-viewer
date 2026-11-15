import { setIcon } from "obsidian";
import {
  MAX_DETAILS_RATIO,
  MAX_OUTLINE_WIDTH,
  MIN_DETAILS_RATIO,
  MIN_OUTLINE_WIDTH,
  type OutlineMode,
} from "../settings.ts";

/** Builds the static DOM of a PRG view and exposes the handles the view needs. */

export interface ChromeActions {
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  toggleOutline(): void;
  setOutlineMode(mode: OutlineMode): void;
  setOutlineWidth(width: number): void;
  setDetailsRatio(ratio: number): void;
  copyLink(): void;
  openExternal(): void;
  reload(): void;
  search(query: string): void;
  searchNext(): void;
}

export interface ErrorActions {
  retry(): void;
  openExternal(): void;
}

export interface ChromeHandles {
  root: HTMLElement;
  canvasWrap: HTMLElement;
  canvas: HTMLCanvasElement;
  latexLayer: HTMLElement;
  searchInput: HTMLInputElement;
  sidebar: HTMLElement;
  outlinePanel: HTMLElement;
  outlineScroll: HTMLElement;
  detailsPanel: HTMLElement;
  detailsScroll: HTMLElement;
  outlineButton: HTMLButtonElement;
  setLoading(visible: boolean): void;
  setOutlineMode(mode: OutlineMode): void;
  setOutlineWidth(width: number): void;
  setDetailsRatio(ratio: number): void;
  showError(title: string, message: string, details: string | null, canOpenExternal: boolean): void;
  hideError(): void;
  setMeta(text: string, extra?: string): void;
  setStatus(text: string): void;
  setOutlineVisible(visible: boolean): void;
}

function iconButton(
  ownerDocument: Document,
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const element = ownerDocument.createElement("button");
  element.type = "button";
  element.setAttribute("aria-label", label);
  element.title = label;
  setIcon(element, icon);
  element.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  parent.append(element);
  return element;
}

export function buildChrome(container: HTMLElement, actions: ChromeActions): ChromeHandles {
  const ownerDocument = container.ownerDocument;
  container.replaceChildren();

  const root = ownerDocument.createElement("div");
  root.className = "prg-viewer-root";
  const toolbar = ownerDocument.createElement("div");
  toolbar.className = "prg-viewer-toolbar";
  const body = ownerDocument.createElement("div");
  body.className = "prg-viewer-body";

  iconButton(ownerDocument, toolbar, "maximize", "适配视图 (F)", () => actions.fit());
  iconButton(ownerDocument, toolbar, "zoom-in", "放大 (+)", () => actions.zoomIn());
  iconButton(ownerDocument, toolbar, "zoom-out", "缩小 (-)", () => actions.zoomOut());
  iconButton(ownerDocument, toolbar, "scan", "重置为 100% (0)", () => actions.resetZoom());

  const searchInput = ownerDocument.createElement("input");
  searchInput.type = "search";
  searchInput.className = "prg-viewer-search";
  searchInput.placeholder = "搜索节点… (/)";
  searchInput.setAttribute("aria-label", "搜索节点");
  searchInput.addEventListener("input", () => actions.search(searchInput.value));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      actions.searchNext();
    } else if (event.key === "Escape") {
      searchInput.blur();
    }
  });
  toolbar.append(searchInput);

  const spacer = ownerDocument.createElement("div");
  spacer.className = "prg-viewer-spacer";
  toolbar.append(spacer);

  const meta = ownerDocument.createElement("span");
  meta.className = "prg-viewer-meta";
  toolbar.append(meta);

  const outlineButton = iconButton(ownerDocument, toolbar, "list", "大纲 (Tab)", () =>
    actions.toggleOutline(),
  );
  iconButton(ownerDocument, toolbar, "link", "复制 prg:// 链接", () => actions.copyLink());
  iconButton(ownerDocument, toolbar, "external-link", "在 Project Graph 中打开", () =>
    actions.openExternal(),
  );
  iconButton(ownerDocument, toolbar, "refresh-cw", "重新加载", () => actions.reload());

  const canvasWrap = ownerDocument.createElement("div");
  canvasWrap.className = "prg-viewer-canvas-wrap";
  canvasWrap.tabIndex = 0;
  canvasWrap.setAttribute("role", "application");
  canvasWrap.setAttribute("aria-label", "Project Graph 画布");

  const canvas = ownerDocument.createElement("canvas");
  canvas.className = "prg-viewer-canvas";
  const latexLayer = ownerDocument.createElement("div");
  latexLayer.className = "prg-viewer-latex-layer";
  canvasWrap.append(canvas, latexLayer);

  const status = ownerDocument.createElement("div");
  status.className = "prg-viewer-status";
  status.textContent = "100%";
  canvasWrap.append(status);

  const loading = ownerDocument.createElement("div");
  loading.className = "prg-viewer-loading";
  loading.textContent = "正在解析 .prg 文件…";
  loading.style.display = "none";
  canvasWrap.append(loading);

  const errorEl = ownerDocument.createElement("div");
  errorEl.className = "prg-viewer-error";
  errorEl.style.display = "none";
  const errorTitle = ownerDocument.createElement("h3");
  const errorMessage = ownerDocument.createElement("p");
  const errorDetails = ownerDocument.createElement("pre");
  const errorActions = ownerDocument.createElement("div");
  errorActions.className = "prg-viewer-error-actions";
  const retryButton = ownerDocument.createElement("button");
  retryButton.type = "button";
  retryButton.className = "mod-cta";
  retryButton.textContent = "重试";
  const externalButton = ownerDocument.createElement("button");
  externalButton.type = "button";
  externalButton.textContent = "在 Project Graph 中打开";
  errorActions.append(retryButton, externalButton);
  errorEl.append(errorTitle, errorMessage, errorDetails, errorActions);
  canvasWrap.append(errorEl);

  retryButton.addEventListener("click", () => actions.reload());
  externalButton.addEventListener("click", () => actions.openExternal());

  const sidebar = ownerDocument.createElement("aside");
  sidebar.className = "prg-viewer-sidebar";
  const sidebarHeader = ownerDocument.createElement("div");
  sidebarHeader.className = "prg-viewer-sidebar-header";
  const sidebarTitle = ownerDocument.createElement("span");
  sidebarTitle.textContent = "大纲";
  const closeButton = iconButton(ownerDocument, sidebarHeader, "x", "关闭侧栏", () =>
    actions.toggleOutline(),
  );

  const modeGroup = ownerDocument.createElement("div");
  modeGroup.className = "prg-viewer-outline-modes";
  const modeButtons = new Map<OutlineMode, HTMLButtonElement>();
  for (const [mode, label] of [
    ["tree", "树"],
    ["category", "分类"],
  ] as const) {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "prg-viewer-outline-mode";
    button.textContent = label;
    button.title = mode === "tree" ? "节点树视图" : "按类型分组视图";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => actions.setOutlineMode(mode));
    modeButtons.set(mode, button);
    modeGroup.append(button);
  }
  sidebarHeader.insertBefore(modeGroup, closeButton);
  sidebarHeader.prepend(sidebarTitle);
  const panel = ownerDocument.createElement("div");
  panel.className = "prg-viewer-panel";

  const outlineScroll = ownerDocument.createElement("div");
  outlineScroll.className = "prg-viewer-outline-scroll";
  const outlinePanel = ownerDocument.createElement("div");
  outlineScroll.append(outlinePanel);

  const detailsSection = ownerDocument.createElement("section");
  detailsSection.className = "prg-viewer-details-section";
  const detailsHeading = ownerDocument.createElement("h4");
  detailsHeading.textContent = "详情";
  const detailsScroll = ownerDocument.createElement("div");
  detailsScroll.className = "prg-viewer-details-scroll";
  const detailsPanel = ownerDocument.createElement("div");
  detailsScroll.append(detailsPanel);
  detailsSection.append(detailsHeading, detailsScroll);

  const detailsResizer = ownerDocument.createElement("div");
  detailsResizer.className = "prg-viewer-details-resizer";
  detailsResizer.tabIndex = 0;
  detailsResizer.setAttribute("role", "separator");
  detailsResizer.setAttribute("aria-orientation", "horizontal");
  detailsResizer.setAttribute("aria-label", "调整详情高度（双击恢复自动）");
  detailsResizer.setAttribute("aria-valuemin", String(MIN_DETAILS_RATIO * 100));
  detailsResizer.setAttribute("aria-valuemax", String(MAX_DETAILS_RATIO * 100));

  const panelHeight = (): number => Math.max(1, panel.getBoundingClientRect().height);
  const detailsHeight = (): number => detailsSection.getBoundingClientRect().height;
  const clampDetailsHeight = (height: number): number => {
    const minimum = 120;
    const maximum = Math.max(minimum, panelHeight() - 96);
    return Math.min(maximum, Math.max(minimum, height));
  };
  let detailsDragId: number | null = null;
  let detailsStartY = 0;
  let detailsStartHeight = 0;
  let detailsMoved = false;

  detailsResizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    detailsDragId = event.pointerId;
    detailsStartY = event.clientY;
    detailsStartHeight = detailsHeight();
    detailsMoved = false;
    detailsResizer.setPointerCapture(event.pointerId);
    detailsResizer.classList.add("is-resizing");
    event.preventDefault();
  });
  detailsResizer.addEventListener("pointermove", (event) => {
    if (detailsDragId !== event.pointerId) return;
    const delta = detailsStartY - event.clientY;
    if (Math.abs(delta) > 2) detailsMoved = true;
    if (!detailsMoved) return;
    const height = clampDetailsHeight(detailsStartHeight + delta);
    actions.setDetailsRatio(height / panelHeight());
  });
  const finishDetailsResize = (event: PointerEvent): void => {
    if (detailsDragId !== event.pointerId) return;
    detailsDragId = null;
    detailsResizer.classList.remove("is-resizing");
    if (detailsResizer.hasPointerCapture(event.pointerId)) {
      detailsResizer.releasePointerCapture(event.pointerId);
    }
    if (detailsMoved) {
      actions.setDetailsRatio(clampDetailsHeight(detailsHeight()) / panelHeight());
    }
    detailsMoved = false;
  };
  detailsResizer.addEventListener("pointerup", finishDetailsResize);
  detailsResizer.addEventListener("pointercancel", finishDetailsResize);
  detailsResizer.addEventListener("dblclick", () => actions.setDetailsRatio(0));
  detailsResizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? 32 : -32;
    actions.setDetailsRatio(clampDetailsHeight(detailsHeight() + delta) / panelHeight());
  });

  panel.append(outlineScroll, detailsResizer, detailsSection);
  sidebar.append(sidebarHeader, panel);

  const resizer = ownerDocument.createElement("div");
  resizer.className = "prg-viewer-resizer";
  resizer.tabIndex = 0;
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-label", "调整大纲宽度");

  const clampWidth = (width: number): number =>
    Math.min(MAX_OUTLINE_WIDTH, Math.max(MIN_OUTLINE_WIDTH, Math.round(width)));
  const sidebarWidth = (): number => sidebar.getBoundingClientRect().width;
  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartWidth = 0;

  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartWidth = sidebarWidth();
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add("is-resizing");
    event.preventDefault();
  });
  resizer.addEventListener("pointermove", (event) => {
    if (dragPointerId !== event.pointerId) return;
    actions.setOutlineWidth(clampWidth(dragStartWidth + (dragStartX - event.clientX)));
  });
  const finishResize = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    dragPointerId = null;
    resizer.classList.remove("is-resizing");
    if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
    actions.setOutlineWidth(clampWidth(sidebarWidth()));
  };
  resizer.addEventListener("pointerup", finishResize);
  resizer.addEventListener("pointercancel", finishResize);
  resizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 16 : -16;
    actions.setOutlineWidth(clampWidth(sidebarWidth() + delta));
  });

  body.append(canvasWrap, resizer, sidebar);
  root.append(toolbar, body);
  container.append(root);

  return {
    root,
    canvasWrap,
    canvas,
    latexLayer,
    searchInput,
    sidebar,
    outlinePanel,
    outlineScroll,
    detailsPanel,
    detailsScroll,
    outlineButton,
    setOutlineMode: (mode) => {
      for (const [candidate, button] of modeButtons) {
        const active = candidate === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      }
    },
    setOutlineWidth: (width) => {
      const rounded = Math.round(width);
      sidebar.style.flex = `0 0 ${rounded}px`;
      resizer.setAttribute("aria-valuemin", String(MIN_OUTLINE_WIDTH));
      resizer.setAttribute("aria-valuemax", String(MAX_OUTLINE_WIDTH));
      resizer.setAttribute("aria-valuenow", String(rounded));
    },
    setDetailsRatio: (ratio) => {
      if (ratio <= 0) {
        detailsSection.style.flex = "";
        detailsSection.style.maxHeight = "";
      } else {
        detailsSection.style.flex = `0 0 ${(ratio * 100).toFixed(2)}%`;
        detailsSection.style.maxHeight = "none";
      }
      detailsResizer.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    },
    setLoading: (visible) => {
      loading.style.display = visible ? "flex" : "none";
    },
    showError: (title, message, details, canOpenExternal) => {
      errorTitle.textContent = title;
      errorMessage.textContent = message;
      if (details && details.length > 0) {
        errorDetails.textContent = details;
        errorDetails.style.display = "block";
      } else {
        errorDetails.textContent = "";
        errorDetails.style.display = "none";
      }
      externalButton.style.display = canOpenExternal ? "" : "none";
      errorEl.style.display = "flex";
    },
    hideError: () => {
      errorEl.style.display = "none";
    },
    setMeta: (text, extra) => {
      meta.replaceChildren();
      meta.append(text);
      if (extra) {
        const badge = ownerDocument.createElement("span");
        badge.className = "prg-viewer-warning";
        badge.textContent = ` · ${extra}`;
        meta.append(badge);
      }
    },
    setStatus: (text) => {
      status.textContent = text;
    },
    setOutlineVisible: (visible) => {
      sidebar.style.display = visible ? "flex" : "none";
      resizer.style.display = visible ? "" : "none";
      outlineButton.classList.toggle("is-active", visible);
    },
  };
}
