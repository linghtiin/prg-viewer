# Project Graph Viewer

在 Obsidian 中直接打开 [Project Graph](https://graphif.dev) 的 `.prg` 画布文件：节点、连线、图片、
LaTeX 公式与分组框都会按原作者排版渲染，并支持平移、缩放、搜索、大纲与深链。

> 只读查看器：不会修改 `.prg` 文件。编辑请回到 Project Graph。

## 功能

- 在文件列表中双击 `.prg`，或执行命令 **Project Graph Viewer: 打开 Project Graph 文件…**
- 画布：拖动平移、`Ctrl/⌘ + 滚轮` 缩放、双击节点聚焦、点击空白取消选择
- 搜索框实时定位节点（`Enter` 循环跳转）
- 右侧大纲按类型列出全部节点，点击即定位（同时是无障碍入口）
- 详情面板显示节点文本、uuid、位置、富文本详情与图片预览
- 图片附件（`attachments/`）与 LaTeX 公式（KaTeX MathML，离线可用）
- 分组框：支持嵌套与折叠状态
- 深链：复制 `prg://` 链接（文件/节点/当前视野），或在 Project Graph 中打开
- 跟随 Obsidian 主题（浅色/深色），可开启网格背景
- 每个文件记住缩放与位置（仅写插件配置）

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

| 操作            | 说明                                        |
| --------------- | ------------------------------------------- |
| 拖动            | 平移画布                                    |
| `Ctrl/⌘ + 滚轮` | 以光标为中心缩放                            |
| 滚轮            | 上下平移（`Shift` 横向）                    |
| 双击节点        | 聚焦该节点                                  |
| `+` / `-`       | 放大 / 缩小                                 |
| `0`             | 重置为 100%                                 |
| `F`             | 适配全部内容                                |
| `/`             | 聚焦搜索框                                  |
| `Tab`           | 无法用 Tab 切换侧栏时，请用工具条按钮或命令 |
| `Esc`           | 取消选择                                    |
| 方向键          | 平移画布                                    |

工具条：适配、放大、缩小、100%、搜索、大纲、复制深链、在 Project Graph 中打开、重新加载。

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
