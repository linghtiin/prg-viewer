import { type App, PluginSettingTab, Setting } from "obsidian";
import type PrgViewerPlugin from "./main.ts";

export class PrgSettingsTab extends PluginSettingTab {
  private readonly plugin: PrgViewerPlugin;

  constructor(app: App, plugin: PrgViewerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("背景网格")
      .setDesc("在画布上绘制网格，便于对齐阅读。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("none", "无")
          .addOption("grid", "网格")
          .setValue(this.plugin.settings.background)
          .onChange(async (value) => {
            this.plugin.settings.background = value === "grid" ? "grid" : "none";
            await this.plugin.saveSettings();
            this.plugin.applySettingsToViews();
          }),
      );

    new Setting(containerEl)
      .setName("默认显示大纲")
      .setDesc("打开 .prg 时自动展开右侧的节点大纲。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showOutlineByDefault).onChange(async (value) => {
          this.plugin.settings.showOutlineByDefault = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("按文件记忆视图")
      .setDesc("记住每个 .prg 的缩放和位置。只写入插件配置，不会修改 .prg 文件。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.rememberCameraPerFile).onChange(async (value) => {
          this.plugin.settings.rememberCameraPerFile = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("图片缓存上限")
      .setDesc("解码后的图片最多占用多少内存（MB）。")
      .addSlider((slider) =>
        slider
          .setLimits(8, 512, 8)
          .setValue(this.plugin.settings.maxImageCacheMB)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxImageCacheMB = value;
            await this.plugin.saveSettings();
            this.plugin.applySettingsToViews();
          }),
      );

    new Setting(containerEl)
      .setName("调试日志")
      .setDesc("在开发者控制台输出解析与渲染细节。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.debugLogging).onChange(async (value) => {
          this.plugin.settings.debugLogging = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
