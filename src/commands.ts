import { type App, FuzzySuggestModal, Notice, type TFile } from "obsidian";
import { PRG_EXTENSION } from "./constants.ts";
import { buildFileUri, openExternalUri } from "./external-open.ts";
import { copyText } from "./util/clipboard.ts";
import { PrgView } from "./view/prg-view.ts";
import type PrgViewerPlugin from "./main.ts";

/** File picker limited to Project Graph documents. */
export class PrgFileSuggestModal extends FuzzySuggestModal<TFile> {
  private readonly onChoose: (file: TFile) => void;

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("选择要打开的 Project Graph 文件（.prg）");
  }

  override getItems(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension === PRG_EXTENSION)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  override getItemText(file: TFile): string {
    return file.path;
  }

  override onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

export function activePrgView(app: App): PrgView | null {
  const view = app.workspace.getActiveViewOfType(PrgView);
  return view instanceof PrgView ? view : null;
}

/** `.prg` file of the active PRG view, or the active file when it is a `.prg`. */
export function activePrgFile(app: App): TFile | null {
  const view = activePrgView(app);
  if (view?.file && view.file.extension === PRG_EXTENSION) return view.file;
  const file = app.workspace.getActiveFile();
  return file && file.extension === PRG_EXTENSION ? file : null;
}

export async function openFileInProjectGraph(app: App, file: TFile): Promise<void> {
  const uri = buildFileUri(app, file);
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

export async function copyFileLink(app: App, file: TFile): Promise<void> {
  const uri = buildFileUri(app, file);
  if (!uri) {
    new Notice("深链仅在桌面端可用。");
    return;
  }
  const copied = await copyText(uri);
  new Notice(copied ? "已复制 prg:// 链接" : `复制失败，请手动复制：${uri}`);
}

export function openPrgFilePicker(plugin: PrgViewerPlugin): void {
  new PrgFileSuggestModal(plugin.app, (file) => {
    void plugin.app.workspace.getLeaf(false).openFile(file);
  }).open();
}

function withActiveView(
  plugin: PrgViewerPlugin,
  checking: boolean,
  action: (view: PrgView) => void,
): boolean {
  const view = activePrgView(plugin.app);
  if (!view) return false;
  if (!checking) action(view);
  return true;
}

export function registerCommands(plugin: PrgViewerPlugin): void {
  plugin.addCommand({
    id: "open-file",
    name: "打开 Project Graph 文件…",
    callback: () => openPrgFilePicker(plugin),
  });

  plugin.addCommand({
    id: "open-in-project-graph",
    name: "在 Project Graph 中打开",
    checkCallback: (checking) => {
      const file = activePrgFile(plugin.app);
      if (!file) return false;
      if (!checking) void openFileInProjectGraph(plugin.app, file);
      return true;
    },
  });

  plugin.addCommand({
    id: "copy-file-link",
    name: "复制 prg:// 链接",
    checkCallback: (checking) => {
      const file = activePrgFile(plugin.app);
      if (!file) return false;
      if (!checking) void copyFileLink(plugin.app, file);
      return true;
    },
  });

  plugin.addCommand({
    id: "copy-node-link",
    name: "复制选中节点的 prg:// 链接",
    checkCallback: (checking) =>
      withActiveView(plugin, checking, (view) => {
        void view.copySelectedNodeLink();
      }),
  });

  plugin.addCommand({
    id: "fit-view",
    name: "适配视图",
    checkCallback: (checking) => withActiveView(plugin, checking, (view) => view.fitView()),
  });

  plugin.addCommand({
    id: "zoom-in",
    name: "放大",
    checkCallback: (checking) => withActiveView(plugin, checking, (view) => view.zoomBy(1.25)),
  });

  plugin.addCommand({
    id: "zoom-out",
    name: "缩小",
    checkCallback: (checking) => withActiveView(plugin, checking, (view) => view.zoomBy(1 / 1.25)),
  });

  plugin.addCommand({
    id: "reset-zoom",
    name: "重置为 100%",
    checkCallback: (checking) => withActiveView(plugin, checking, (view) => view.resetZoom()),
  });

  plugin.addCommand({
    id: "toggle-outline",
    name: "切换大纲侧栏",
    checkCallback: (checking) => withActiveView(plugin, checking, (view) => view.toggleOutline()),
  });

  plugin.addCommand({
    id: "reload",
    name: "重新加载 .prg",
    checkCallback: (checking) =>
      withActiveView(plugin, checking, (view) => {
        void view.loadDocument();
      }),
  });
}
