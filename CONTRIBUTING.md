# 贡献指南

感谢参与 Project Graph Viewer。本文档定义开发流程、代码约束与验收标准。

## 环境

- Node.js ≥ 22.18（使用内置 TypeScript 类型剥离运行测试）
- pnpm 11（`packageManager` 已固定版本）
- Obsidian ≥ 1.6（桌面端用于冒烟测试）

```bash
pnpm install
pnpm verify        # 提交前必须全绿
```

> Windows 说明：`pnpm-workspace.yaml` 使用 `nodeLinker: hoisted`（esbuild 可选平台包在 junction
> 下无法被解析），并显式禁止 esbuild 的安装脚本（它自带预编译二进制）。请勿改回默认布局，除非同时
> 验证 Windows 与 CI 都能构建。

## 开发循环

1. `pnpm dev`（esbuild watch，输出根目录 `main.js`）
2. 将 `main.js`、`manifest.json`、`styles.css` 复制/链接到测试库
   `<vault>/.obsidian/plugins/prg-viewer/`
3. 在 Obsidian 中重新加载插件（或使用 Hot Reload 类插件）

解析层与几何层的改动应先在 Node 下用 `pnpm test` 验证，不要只靠界面观察。

## 代码结构与约束

```
src/format/   纯解析：ZIP、MessagePack、序列化引用、文档模型
src/scene/    纯几何：相机、文本布局、连线几何、场景构建、颜色
src/render/   画布与浮层：Canvas 渲染、主题、图片缓存、LaTeX
src/view/     Obsidian 适配：视图、交互、大纲、详情
src/main.ts   插件入口
```

- `src/format/**` 与 `src/scene/**` **禁止** `import "obsidian"` 或访问 DOM（`test/purity.test.ts` 会失败）。
- 只使用可被 Node 类型剥离的语法：no `enum`、no `namespace`、no 构造器参数属性；
  类型导入必须写 `import type`（`verbatimModuleSyntax`）。
- 相对导入需带 `.ts` 扩展名（Node 原生 ESM 规则）。
- 不引入新的运行时依赖，除非在 PR 中说明体积与离线影响。
- 不使用 `any`（`@typescript-eslint/no-explicit-any`）；解析外部数据用窄化守卫。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

| 前缀             | 用途               |
| ---------------- | ------------------ |
| `feat:`          | 新功能             |
| `fix:`           | 修复               |
| `perf:`          | 性能               |
| `refactor:`      | 重构（无行为变化） |
| `docs:`          | 文档               |
| `test:`          | 测试               |
| `build:` / `ci:` | 构建与流水线       |
| `chore:`         | 杂项               |

示例：`feat: support nested section frames`

分支：主干 + 短生命周期分支，命名 `feat/<topic>`、`fix/<topic>`、`docs/<topic>`。

## PR 清单（Definition of Done）

- [ ] `pnpm verify` 全绿
- [ ] 新逻辑有单测；覆盖率不低于门槛（行 85 / 分支 75 / 函数 85）
- [ ] 解析或渲染行为变化更新了 `docs/compatibility.md`
- [ ] 用户可见变化更新了 `CHANGELOG.md` 的 `Unreleased`
- [ ] 无新增 `any`、无 Obsidian 依赖泄漏到核心层
- [ ] 涉及界面变化时附截图（浅色 + 深色）

## 如何支持一种新的节点类型

以 `SvgNode` 为例：

1. `src/format/build-document.ts`：在 `visitEntity` 的 `switch` 中新增分支，映射为 `PrgNode`
   的联合成员（必要时扩展 `src/format/types.ts`）。
2. `src/scene/scene.ts`：确认其层级/裁剪语义；分组类节点需要参与 `collectHiddenIds`。
3. `src/render/canvas-renderer.ts`：实现绘制分支；无法绘制的保持 `unknown` 占位。
4. `src/view/outline-panel.ts` / `details-panel.ts`：补充分组标题与详情字段。
5. 单测：`build-document.test.ts` 增加字段映射与降级用例；几何逻辑进 `scene/` 测试。
6. 更新 `docs/prg-format.md` 的字段表与 `docs/compatibility.md`。
7. 用真实 `.prg` 跑 `pnpm inspect <file>` 确认计数与告警。

## 测试

- 单元测试：Node 内置测试运行器（`node:test` + `node:assert/strict`），文件同目录 `*.test.ts`。
- 夹具：`pnpm fixture` 生成 `fixtures/sample.prg`（合成内容，可提交）。
- 真实文件体检：`pnpm inspect <file.prg> [--json]`；基准见 `docs/compatibility.md`。
- 手工冒烟：见 `docs/testing.md`，重点验证只读性（打开前后 SHA256 不变）。

## 版本与发布

```bash
pnpm bump 0.2.0     # 同步 package.json / manifest.json / versions.json，并检查 CHANGELOG
git commit -am "chore(release): 0.2.0"
git tag v0.2.0
git push origin main --tags
```

`release.yml` 会在 tag 上构建并发布 `main.js`、`manifest.json`、`styles.css`。
