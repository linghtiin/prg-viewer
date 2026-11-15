# 贡献指南

感谢参与 Project Graph Viewer。本文档定义开发流程、代码约束与验收标准。

## 环境

- Node.js ≥ 22.18（使用内置 TypeScript 类型剥离运行测试）
- pnpm 11（`packageManager` 已固定版本）
- Obsidian ≥ 1.6（桌面端用于冒烟测试）

安装依赖、构建、安装到测试库与全部命令见 [docs/development.md](docs/development.md)。
提交前 `pnpm verify` 必须全绿。

## 开发循环

见 [docs/development.md](docs/development.md)。解析层与几何层的改动应先在 Node 下用 `pnpm test`
验证，不要只靠界面观察。

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

分支：主干 + 短生命周期分支，命名 `feat/<topic>`、`fix/<topic>`、`docs/<topic>`、`chore/<topic>`，
始终从最新 `master` 切出。功能分支**不要**修改 `package.json` / `manifest.json` / `versions.json`，
版本号只在发版分支推进（见下）。

## PR 清单（Definition of Done）

- [ ] `pnpm verify` 全绿
- [ ] 新逻辑有单测；覆盖率不低于门槛（行 85 / 分支 75 / 函数 85）
- [ ] 解析或渲染行为变化更新了 `docs/compatibility.md`
- [ ] 用户可见变化更新了 `CHANGELOG.md` 的 `Unreleased`
- [ ] 未改动 `package.json` / `manifest.json` / `versions.json`（发版 PR 除外）
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
- 回归基准：`pnpm inspect fixtures/sample.prg --json`，计数见 `docs/compatibility.md`。
- 真实 `.prg` 只在本机自查，不要把文件名或路径写入仓库与文档。
- 手工冒烟：见 `docs/testing.md`，重点验证只读性（打开前后 SHA256 不变）。

## 版本与发布

功能分支只维护 `CHANGELOG.md` 的 `Unreleased`；发版时从 `master` 切出 `chore/release-x.y.z`，
运行 `pnpm bump x.y.z`（提升 CHANGELOG 并同步三个版本文件），再 `pnpm check:version && pnpm verify`。
合并后使用**裸版本号** `x.y.z` 打 tag 并推送，GitHub release 才会构建三个资产。

完整的版本策略、文件矩阵、检查表与回滚方式见 [docs/releasing.md](docs/releasing.md)。
