import { setIcon } from "obsidian";

/** Builds the static DOM of a PRG view and exposes the handles the view needs. */

export interface ChromeActions {
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  toggleOutline(): void;
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
  detailsPanel: HTMLElement;
  outlineButton: HTMLButtonElement;
  setLoading(visible: boolean): void;
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
  iconButton(ownerDocument, sidebarHeader, "x", "关闭侧栏", () => actions.toggleOutline());
  sidebarHeader.prepend(sidebarTitle);
  const panel = ownerDocument.createElement("div");
  panel.className = "prg-viewer-panel";
  const outlinePanel = ownerDocument.createElement("div");
  const detailsHeading = ownerDocument.createElement("h4");
  detailsHeading.textContent = "详情";
  const detailsPanel = ownerDocument.createElement("div");
  panel.append(outlinePanel, detailsHeading, detailsPanel);
  sidebar.append(sidebarHeader, panel);

  body.append(canvasWrap, sidebar);
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
    detailsPanel,
    outlineButton,
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
      outlineButton.classList.toggle("is-active", visible);
    },
  };
}
