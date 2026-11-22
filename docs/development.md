# 本地开发

面向需要从源码构建、在本地库中调试插件的贡献者。一般用户的安装方式见 [README](../README.md)。

## 环境

- Node.js ≥ 22.18（使用内置 TypeScript 类型剥离运行脚本与测试）
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

1. `pnpm dev`：esbuild watch，输出根目录的 `main.js`。
2. 把构建产物安装到测试库，任选一种：
   - 脚本：`powershell -ExecutionPolicy Bypass -File scripts/install-to-vault.ps1 -Vault "C:\path\to\vault"`
     （`C:\path\to\vault` 是占位路径，换成你的测试库；加 `-WhatIf` 可预览）
   - 手动：把 `main.js`、`manifest.json`、`styles.css` 复制到
     `<库>/.obsidian/plugins/prg-viewer/`
3. 在 Obsidian 中重新加载插件（或使用 Hot Reload 类插件）。

脚本只复制三个产物，不会修改库中的笔记或 `.prg` 文件。

解析层与几何层的改动应先在 Node 下用 `pnpm test` 验证，不要只靠界面观察。

## 命令

| 命令                      | 作用                                                     |
| ------------------------- | -------------------------------------------------------- |
| `pnpm dev`                | esbuild watch 构建                                       |
| `pnpm build`              | 一次性构建 `main.js`                                     |
| `pnpm verify`             | format + lint + typecheck + check:version + test + build |
| `pnpm test`               | 单元测试（Node 内置测试运行器）                          |
| `pnpm test:coverage`      | 覆盖率与门槛检查                                         |
| `pnpm typecheck`          | `tsc --noEmit`                                           |
| `pnpm lint`               | ESLint                                                   |
| `pnpm format`             | Prettier 写入                                            |
| `pnpm check:version`      | package / manifest / versions / CHANGELOG 一致性         |
| `pnpm package:release`    | 打包发布 zip（`dist/prg-viewer.zip`，需先构建）          |
| `pnpm inspect <file.prg>` | 解码任意 `.prg` 并输出摘要或 JSON                        |
| `pnpm fixture`            | 重新生成 `fixtures/sample.prg`（合成样本）               |

发版命令（`pnpm bump`、打 tag）见 [releasing.md](releasing.md)。

## 测试库与样本

- 仓库内标准样本是 `fixtures/sample.prg`，由 `pnpm fixture` 生成；复制到测试库即可做冒烟测试。
- 也可以使用自己库中的真实 `.prg` 做额外验证，但**不要把本地库的路径或文件名写进仓库与文档**。
- `.tmp/` 是本地临时目录，已在 `.gitignore` 中忽略。

## 相关文档

- [CONTRIBUTING.md](../CONTRIBUTING.md)：代码结构、约束、提交与 PR 流程
- [architecture.md](architecture.md)：分层与数据流
- [testing.md](testing.md)：单测范围与手工冒烟清单
- [releasing.md](releasing.md)：版本推进与发布
