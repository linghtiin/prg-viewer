import { Plugin, TFile } from "obsidian";
import { copyFileLink, openFileInProjectGraph, openPrgFilePicker, registerCommands } from "./commands.ts";
import { PRG_EXTENSION, VIEW_TYPE_PRG } from "./constants.ts";
import type { CameraState } from "./scene/camera.ts";
import { DEFAULT_SETTINGS, normalizeSettings, type PrgViewerSettings } from "./settings.ts";
import { PrgSettingsTab } from "./settings-tab.ts";
import { PrgView } from "./view/prg-view.ts";

interface PluginData {
  settings?: unknown;
  cameras?: Record<string, CameraState>;
}

export default class PrgViewerPlugin extends Plugin {
  override settings: PrgViewerSettings = DEFAULT_SETTINGS;
  private cameras: Record<string, CameraState> = {};
  private saveTimer: number | null = null;

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_PRG, (leaf) => new PrgView(leaf, this));
    this.registerExtensions([PRG_EXTENSION], VIEW_TYPE_PRG);
    this.addSettingTab(new PrgSettingsTab(this.app, this));

    registerCommands(this);

    this.addRibbonIcon("network", "打开 Project Graph 文件", () => openPrgFilePicker(this));

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== PRG_EXTENSION) return;
        menu.addItem((item) => {
          item.setTitle("在 Project Graph 中打开");
          item.setIcon("external-link");
          item.onClick(() => {
            void openFileInProjectGraph(this.app, file);
          });
        });
        menu.addItem((item) => {
          item.setTitle("复制 prg:// 链接");
          item.setIcon("link");
          item.onClick(() => {
            void copyFileLink(this.app, file);
          });
        });
      }),
    );
  }

  override onunload(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  async loadSettings(): Promise<void> {
    const raw: unknown = await this.loadData();
    const data = raw as PluginData | null;
    this.settings = normalizeSettings(data?.settings);
    this.cameras =
      data?.cameras && typeof data.cameras === "object" && !Array.isArray(data.cameras) ? data.cameras : {};
  }

  async saveSettings(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persist();
  }

  getCameraState(path: string): CameraState | null {
    return this.cameras[path] ?? null;
  }

  setCameraState(path: string, state: CameraState): void {
    this.cameras[path] = state;
    this.schedulePersist();
  }

  get views(): PrgView[] {
    const views: PrgView[] = [];
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PRG)) {
      if (leaf.view instanceof PrgView) views.push(leaf.view);
    }
    return views;
  }

  applySettingsToViews(): void {
    for (const view of this.views) view.applySettings();
  }

  private schedulePersist(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, 500);
  }

  private async persist(): Promise<void> {
    const data: PluginData = { settings: this.settings, cameras: this.cameras };
    await this.saveData(data);
  }
}
