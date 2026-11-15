import { type App, PluginSettingTab, Setting } from "obsidian";
import { MAX_DETAILS_RATIO, MAX_OUTLINE_WIDTH, MIN_DETAILS_RATIO, MIN_OUTLINE_WIDTH } from "./settings.ts";
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
      .setName("滚轮操作")
      .setDesc("默认：滚轮缩放，按住 Ctrl/⌘ 滚动平移。切换后：滚轮平移，按住 Ctrl/⌘ 缩放。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("zoom", "滚轮缩放（Ctrl/⌘ 平移）")
          .addOption("pan", "滚轮平移（Ctrl/⌘ 缩放）")
          .setValue(this.plugin.settings.wheelBehavior)
          .onChange(async (value) => {
            this.plugin.settings.wheelBehavior = value === "pan" ? "pan" : "zoom";
            await this.plugin.saveSettings();
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
      .setName("大纲视图")
      .setDesc("节点树按分组框的嵌套关系展示，可折叠分支；按类型分组则平铺列出全部节点。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("tree", "节点树（可折叠）")
          .addOption("category", "按类型分组")
          .setValue(this.plugin.settings.outlineMode)
          .onChange(async (value) => {
            this.plugin.settings.outlineMode = value === "category" ? "category" : "tree";
            await this.plugin.saveSettings();
            this.plugin.applyOutlineModeToViews();
          }),
      );

    new Setting(containerEl)
      .setName("大纲默认宽度")
      .setDesc("打开 .prg 时右侧大纲的像素宽度；打开后拖动只影响当前会话，不改写设置。")
      .addSlider((slider) =>
        slider
          .setLimits(MIN_OUTLINE_WIDTH, MAX_OUTLINE_WIDTH, 1)
          .setValue(this.plugin.settings.outlineWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.outlineWidth = value;
            await this.plugin.saveSettings();
            this.plugin.applyOutlineLayoutToViews();
          }),
      );

    new Setting(containerEl)
      .setName("详情默认高度")
      .setDesc("打开 .prg 时详情区占侧栏高度的百分比；打开后拖动只影响当前会话，不改写设置。")
      .addSlider((slider) =>
        slider
          .setLimits(Math.round(MIN_DETAILS_RATIO * 100), Math.round(MAX_DETAILS_RATIO * 100), 1)
          .setValue(Math.round(this.plugin.settings.detailsRatio * 100))
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.detailsRatio = value / 100;
            await this.plugin.saveSettings();
            this.plugin.applyOutlineLayoutToViews();
          }),
      );

    new Setting(containerEl)
      .setName("按文件记忆视图")
      .setDesc(
        `记住每个 .prg 的缩放和位置。状态单独写入 ${this.plugin.getReadingStatePath()}（可加入 .gitignore），不会修改 .prg 文件。`,
      )
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
