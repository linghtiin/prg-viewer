import { normalizePath, Plugin, TFile } from "obsidian";
import { copyFileLink, openFileInProjectGraph, openPrgFilePicker, registerCommands } from "./commands.ts";
import { PRG_EXTENSION, VIEW_TYPE_PRG } from "./constants.ts";
import {
  mergeCameraStates,
  normalizeCameraStates,
  parseViewState,
  readingStatePath,
  serializeViewState,
  type CameraStateMap,
} from "./reading-state.ts";
import type { CameraState } from "./scene/camera.ts";
import { DEFAULT_SETTINGS, normalizeSettings, type PrgViewerSettings } from "./settings.ts";
import { PrgSettingsTab } from "./settings-tab.ts";
import { createLogger, type Logger } from "./util/log.ts";
import { PrgView } from "./view/prg-view.ts";

/**
 * `data.json` only keeps settings now. `cameras` is still read once so installs
 * that predate the reading-state file migrate without losing their view
 * positions; it is dropped after a successful migration.
 */
interface PluginData {
  settings?: unknown;
  cameras?: unknown;
}

/** Debounce for per-file camera writes (one write per finished pan/zoom gesture). */
const CAMERA_SAVE_DEBOUNCE_MS = 500;

export default class PrgViewerPlugin extends Plugin {
  override settings: PrgViewerSettings = DEFAULT_SETTINGS;
  private cameras: CameraStateMap = {};
  private cameraSaveTimer: number | null = null;
  private stateWriteChain: Promise<void> = Promise.resolve();
  private lastStateText: string | null = null;
  private readonly logger: Logger = createLogger("prg-viewer", () => this.settings.debugLogging);

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
    if (this.cameraSaveTimer !== null) {
      window.clearTimeout(this.cameraSaveTimer);
      this.cameraSaveTimer = null;
      // Best effort: Obsidian does not await onunload, but the write usually lands.
      void this.writeReadingState();
    }
  }

  /** Loads settings and migrates legacy per-file cameras out of `data.json`. */
  async loadSettings(): Promise<void> {
    const raw: unknown = await this.loadData();
    const data = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as PluginData) : null;
    this.settings = normalizeSettings(data?.settings);

    const hasLegacy = data !== null && Object.hasOwn(data, "cameras");
    const legacy = hasLegacy ? normalizeCameraStates(data?.cameras) : null;
    const storedText = await this.readReadingState();
    const stored = storedText === null ? null : parseViewState(storedText);
    this.cameras = mergeCameraStates(stored, legacy);
    this.lastStateText = storedText !== null && stored !== null ? serializeViewState(stored) : null;

    if (hasLegacy) {
      const saved = await this.writeReadingState();
      // Only drop the old copy from data.json once the reading state is on disk.
      if (saved) await this.persistSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.persistSettings();
  }

  getCameraState(path: string): CameraState | null {
    return this.cameras[path] ?? null;
  }

  setCameraState(path: string, state: CameraState): void {
    this.cameras[path] = state;
    this.schedulePersist();
  }

  /** Vault path of the reading-state file (shown in settings, useful for .gitignore). */
  getReadingStatePath(): string {
    const configDir = this.app.vault.configDir;
    return normalizePath(readingStatePath(configDir, this.manifest.dir, this.manifest.id));
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

  /** Keeps every open pane's outline in sync when one of them switches the mode. */
  applyOutlineModeToViews(): void {
    for (const view of this.views) view.applyOutlineMode();
  }

  /** Applies the persisted outline width to every open pane without touching their caches. */
  applyOutlineWidthToViews(): void {
    for (const view of this.views) view.applyOutlineWidth();
  }

  /** Applies the persisted details-pane ratio to every open pane. */
  applyDetailsRatioToViews(): void {
    for (const view of this.views) view.applyDetailsRatio();
  }

  private async persistSettings(): Promise<void> {
    await this.saveData({ settings: this.settings });
  }

  private async readReadingState(): Promise<string | null> {
    try {
      const adapter = this.app.vault.adapter;
      const path = this.getReadingStatePath();
      if (!(await adapter.exists(path))) return null;
      return await adapter.read(path);
    } catch (error) {
      this.logger.warn("读取阅读状态文件失败", error);
      return null;
    }
  }

  /** Serialises writes so quick gestures cannot interleave; resolves to "state is on disk". */
  private async writeReadingState(): Promise<boolean> {
    const text = serializeViewState(this.cameras);
    if (text === this.lastStateText) return true;
    const path = this.getReadingStatePath();
    let failed = false;
    this.stateWriteChain = this.stateWriteChain
      .then(async () => {
        const current = serializeViewState(this.cameras);
        if (current === this.lastStateText) return;
        await this.app.vault.adapter.write(path, current);
        this.lastStateText = current;
      })
      .catch((error: unknown) => {
        failed = true;
        this.logger.warn("写入阅读状态文件失败", error);
      });
    await this.stateWriteChain;
    return !failed;
  }

  private schedulePersist(): void {
    if (this.cameraSaveTimer !== null) window.clearTimeout(this.cameraSaveTimer);
    this.cameraSaveTimer = window.setTimeout(() => {
      this.cameraSaveTimer = null;
      void this.writeReadingState();
    }, CAMERA_SAVE_DEBOUNCE_MS);
  }
}
