# Project Graph Viewer

在 Obsidian 中直接打开 [Project Graph](https://graphif.dev) 的 `.prg` 画布文件：节点、连线、图片、
LaTeX 公式与分组框都会按原作者排版渲染，并支持平移、缩放、搜索、大纲与深链。

> 只读查看器：不会修改 `.prg` 文件。编辑请回到 Project Graph。

## 功能

- 在文件列表中双击 `.prg`，或执行命令 **Project Graph Viewer: 打开 Project Graph 文件…**
- 画布：拖动平移、滚轮缩放（`Ctrl/⌘ + 滚轮` 平移，可在设置中互换）、双击节点聚焦、点击空白取消选择
- 搜索框实时定位节点（`Enter` 循环跳转）
- 右侧大纲支持「节点树」与「按类型」两种视图：节点树按分组框嵌套展示（没有分组框的文件按连线方向成树）、可折叠任意分支，点击即定位（同时是无障碍入口）；宽度可拖动调整
- 画布与大纲共用方向键导航：上下切换节点，左右在父级/子级间移动
- 详情面板区分「节点自身文本」与「附加文本」，并显示 uuid、位置与图片预览；详情与大纲分区滚动，详情高度可拖动调整
- 图片附件（`attachments/`）与 LaTeX 公式（KaTeX MathML，离线可用）
- 分组框：支持嵌套与折叠状态
- 深链：复制 `prg://` 链接（文件/节点/当前视野），或在 Project Graph 中打开
- 跟随 Obsidian 主题（浅色/深色），可开启网格背景
- 每个文件记住缩放与位置（写入插件目录的 `reading-state.json`，不修改 `.prg` 文件）

## 安装

### 方式一：安装脚本（推荐）

```powershell
# 在仓库根目录执行
pnpm install
pnpm build
powershell -ExecutionPolicy Bypass -File scripts/install-to-vault.ps1 -Vault "C:\Users\<你>\Documents\Mind Vault"
```

然后在 Obsidian 中打开 **设置 → 第三方插件**，启用 **Project Graph Viewer**。

### 方式二：手动复制

把 `main.js`、`manifest.json`、`styles.css` 复制到：

```
<你的库>/.obsidian/plugins/prg-viewer/
```

重新加载 Obsidian 并启用插件。

## 使用

| 操作             | 说明                                      |
| ---------------- | ----------------------------------------- |
| 拖动             | 平移画布                                  |
| 滚轮             | 缩放（默认；可在设置中改为平移）          |
| `Ctrl/⌘ + 滚轮`  | 平移（默认；可在设置中改为缩放）          |
| 双击节点         | 聚焦该节点                                |
| `+` / `-`        | 放大 / 缩小                               |
| `0`              | 重置为 100%                               |
| `F`              | 适配全部内容                              |
| `/`              | 聚焦搜索框                                |
| `Esc`            | 取消选择                                  |
| 方向键           | 切换选中节点（左右：父级 / 第一个子节点） |
| `Shift + 方向键` | 平移画布                                  |

设置 → Project Graph Viewer 可切换：滚轮操作（缩放/平移互换）、背景网格、默认展开大纲、大纲视图
（节点树/按类型）、大纲宽度、按文件记忆视图、图片缓存上限、调试日志。滚轮缩放以光标为锚点。

工具条：适配、放大、缩小、100%、搜索、大纲、复制深链、在 Project Graph 中打开、重新加载。

大纲：标题栏的「树 / 分类」切换两种视图。节点树中点击箭头折叠/展开分支，也可用「全部折叠 / 全部展开」；
拖动大纲左侧边缘可调整宽度（设置中也能改，宽度会被记住）。在画布或大纲中按方向键可切换选中节点，
大纲中左右键在父级/子级间移动，遇到折叠的分支会先展开或折叠它。选中节点时，大纲会自动展开它所在的
分支并高亮对应条目。大纲与详情分上下两个独立滚动区，详情固定在下方，不会随节点列表滚走；拖动两者之间的
分隔条可调整详情高度（双击恢复自动高度，比例会被记住）。

### 配置与阅读状态

插件目录（`<库>/.obsidian/plugins/prg-viewer/`）下有两个文件：

| 文件                 | 内容                     | 写入时机                     |
| -------------------- | ------------------------ | ---------------------------- |
| `data.json`          | 插件设置                 | 仅在修改设置时               |
| `reading-state.json` | 每个 `.prg` 的缩放与位置 | 打开、平移、缩放之后（防抖） |

`.prg` 文件本身始终只读。若库用 Git 管理，可以只忽略阅读状态，让设置仍可被追踪：

```gitignore
.obsidian/plugins/prg-viewer/reading-state.json
```

（使用自定义配置目录时按实际路径调整。）旧版本把阅读状态存在 `data.json` 的 `cameras` 字段里；升级后
首次加载会自动迁移，`data.json` 只会变化这一次。

### 深链

复制得到的链接形如：

```
prg:///C:/Users/me/Documents/Mind%20Vault/map.prg?target=<uuid>
```

可粘贴到任意笔记中；点击后由 Project Graph 打开对应文件并定位节点。`prg://` 仅桌面端可用。

### 命令

- `Project Graph Viewer: 打开 Project Graph 文件…`
- `Project Graph Viewer: 在 Project Graph 中打开`
- `Project Graph Viewer: 复制 prg:// 链接`
- `Project Graph Viewer: 复制选中节点的 prg:// 链接`
- `Project Graph Viewer: 适配视图` / `放大` / `缩小` / `重置为 100%`
- `Project Graph Viewer: 切换大纲侧栏`
- `Project Graph Viewer: 重新加载 .prg`

## 支持范围与已知限制

- 已完整支持：`TextNode`、`ImageNode`、`LatexNode`、`Section`、`LineEdge`（含自环）
- 占位显示（保留位置与类型名）：`PenStroke`、`SvgNode`、`UrlNode`、`MediaNode`、`ReferenceBlockNode`、
  以及未来版本的未知节点类型
- 多目标连线仅显示首尾两个端点
- 连线标签字号为 20 世界单位（Project Graph 内部按边宽推导，差异较大时以官方为准）
- 只读：不提供编辑、连线操作或回写
- 详见 [docs/compatibility.md](docs/compatibility.md)

## 开发

要求：Node ≥ 22.18、pnpm 11。

```bash
pnpm install
pnpm dev          # esbuild watch，改动后重新复制到库中
pnpm verify       # format + lint + typecheck + test + build
pnpm test:coverage
pnpm inspect fixtures/sample.prg     # 解码任意 .prg 并输出摘要
```

目录结构、分层约束与提交规范见 [CONTRIBUTING.md](CONTRIBUTING.md) 与
[docs/architecture.md](docs/architecture.md)。PR 请附测试与 CHANGELOG 更新。

## 版本

当前 `0.1.0`。变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可与致谢

本项目以 MIT 许可发布。PRG 格式与视觉约定的来源说明见 [NOTICE](NOTICE)：

- [Project Graph](https://graphif.dev)（GPL-3.0）—— 格式规范与视觉约定
- [fflate](https://github.com/101arrowz/fflate)（MIT）—— ZIP 解压
- [@msgpack/msgpack](https://github.com/msgpack/msgpack-javascript)（ISC）—— MessagePack
- [KaTeX](https://katex.org)（MIT）—— LaTeX → MathML
