# 发布与版本管理

本文档定义版本号如何推进、功能分支三个阶段分别要改哪些文件，以及一次发布如何从
`master` 走到可被 Obsidian 安装的 release。相关工具：`pnpm bump`、`pnpm check:version`。

## 版本载体

| 文件            | 作用                                                          | 谁在读取                      |
| --------------- | ------------------------------------------------------------- | ----------------------------- |
| `package.json`  | 仓库内版本号，与 manifest 同步                                | 本地工具、CI                  |
| `manifest.json` | **版本的规范源**，Obsidian 用它显示与匹配 release             | Obsidian、社区插件目录        |
| `versions.json` | `插件版本 → minAppVersion` 映射，供旧版 Obsidian 选择可用版本 | Obsidian 安装器               |
| `CHANGELOG.md`  | 每个版本的用户可见变更                                        | 用户、reviewer、release notes |

`manifest.json` 的 `version` 与同名 release tag 必须完全一致。README 不写死版本号，避免第四处漂移；
`pnpm check:version` 会同时校验以上四处（含描述与 tag）。

## 版本号推进策略

0.x 阶段仍按 [Semantic Versioning](https://semver.org/) 推进：

| 变更类型                                                                                   | 版本位          | 例子                        |
| ------------------------------------------------------------------------------------------ | --------------- | --------------------------- |
| 新功能、新设置、新命令、新节点支持、用户可见行为变化                                       | minor           | `0.1.0` → `0.2.0`           |
| 缺陷修复、性能、依赖补丁、仅表现层调整                                                     | patch           | `0.2.0` → `0.2.1`           |
| 破坏性变更（设置键重命名、`reading-state.json` schema 升级且无迁移、提升 `minAppVersion`） | minor（1.0 前） | `0.3.0`，CHANGELOG 写明迁移 |
| 仅文档、CI、注释、测试                                                                     | 不单独发版      | 随下一个版本一起发布        |
| 已发布版本有错                                                                             | 新 patch        | `0.2.2`，不移动旧 tag       |

- `minAppVersion` 只在确实使用更新 Obsidian API 时提升；提升时同时更新 `manifest.json` 和
  `versions.json`，并至少发 minor。
- 版本号只在发布时推进，**功能分支永不修改** `package.json` / `manifest.json` / `versions.json`。
  发版使用独立分支 `chore/release-x.y.z`，避免并行分支在三个版本文件上反复冲突。
- 一次发布对应一个新版本号和一个 tag；`Unreleased` 没有任何条目时 `pnpm bump` 会拒绝发版。
- `versions.json` 中已发布的旧映射永不修改；新版本在末尾追加 `"x.y.z": "<minAppVersion>"`。

## 功能分支生命周期

分支命名：`feat/<topic>`、`fix/<topic>`、`docs/<topic>`、`chore/<topic>`，始终从最新 `master` 切出。
提交使用 Conventional Commits（见 `CONTRIBUTING.md`）。

| 阶段     | 必改                                                 | 按需改                                                                                                                                                                                                                                                               | 禁止                                                 |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **建立** | 无                                                   | —                                                                                                                                                                                                                                                                    | 改三个版本文件、打 tag、在分支上发版                 |
| **推进** | `CHANGELOG.md` 的 `Unreleased`（首个用户可见变更时） | 功能代码与同目录 `*.test.ts`；用户可见功能改 `README.md`；解析/渲染行为改 `docs/compatibility.md`（含真实文件计数）；分层/数据流/状态文件改 `docs/architecture.md`；冒烟清单改 `docs/testing.md`；架构决策新增 `docs/adr/`；关闭或新增路线图条目改 `docs/roadmap.md` | 改版本文件；提交 `main.js`（生成物）；复用已发布 tag |
| **关闭** | PR 按模板勾选；合并后删除本地与远端分支              | review 要求补的文档或测试                                                                                                                                                                                                                                            | 在功能分支上 bump 版本或打 tag                       |

功能分支合并后即可删除；发布是另一个动作，不随功能分支关闭而发生。

## 发版流程

1. 确认 `master` 全绿、`Unreleased` 已涵盖本次全部用户可见变更。
2. `git switch master && git pull --ff-only && git switch -c chore/release-x.y.z`。
3. `pnpm bump x.y.z`：把 `Unreleased` 提升为 `## [x.y.z] - YYYY-MM-DD`，重建空 `Unreleased`，
   同步 `package.json` / `manifest.json` / `versions.json`。需要指定日期时加 `--date YYYY-MM-DD`；
   只预览不写盘用 `--dry-run`。
4. `pnpm check:version && pnpm verify`（`verify` 已包含版本检查）。
5. 提 PR → review → 合并到 `master`。
6. 在合并后的提交上打 tag 并推送：

   ```bash
   git switch master
   git pull --ff-only
   git tag -a x.y.z -m "x.y.z"
   git show x.y.z:manifest.json   # 确认 version 与 tag 一致
   git push origin master
   git push origin x.y.z
   ```

7. GitHub Actions（`.github/workflows/release.yml`）构建并上传四个资产：`main.js`、`manifest.json`、
   `styles.css`，以及把这三者放在压缩包根目录的 `prg-viewer.zip`；确认 release 的 tag 与
   manifest 版本一致、资产齐全。
8. Obsidian 安装器按 `manifest.json` 的版本查找同名 release，因此**推 tag 才算发版**；只改版本号
   不推 tag，用户端仍是旧版本。

### 发布压缩包

发布页同时提供单文件压缩包，用户可以只下载一个文件：

- `pnpm package:release` 把 `main.js`、`manifest.json`、`styles.css` 按根目录结构打进
  `dist/prg-viewer.zip`（`dist/` 已被忽略，不会进仓库）。
- 该命令不负责构建：先在本地 `pnpm build`，或直接跑 `pnpm verify`（CI 在它之后执行本命令）。
- 压缩包内的三个文件必须直接在根目录；解压到 `<库>/.obsidian/plugins/prg-viewer/` 即可。
- Gitea 不自动产出 release，手动发布时同样上传三个文件与这个 zip，两者由同一脚本产出。

### tag 规则

- 使用**裸版本号** `x.y.z`，不要 `v` 前缀：Obsidian 要求 release tag 与 manifest 版本完全一致
  （[官方提交说明](https://docs.obsidian.md/plugins/releasing/submit-plugin)）。
- tag 一旦推送不可删除、不可移动；发现打错或资产缺失时，修好后发新的 patch 版本。
- `pnpm check:version --tag x.y.z` 可在本地模拟 CI 的 tag 校验；带 `v` 会直接失败。

### Gitea 与 GitHub

本仓库的 `origin` 是自建 Gitea，GitHub 是发布镜像。`.github/workflows` 不会在 Gitea 上运行：

- Gitea 的 tag 不会自动触发 GitHub Actions。确认镜像会同步 tag；否则手动推：

  ```bash
  git remote add github <GitHub 仓库地址>   # 只需一次
  git push github master
  git push github x.y.z
  ```

- 两个远端保持同一提交与 tag，避免用户从 GitHub 装到旧版本。

## 发布检查表

- [ ] `Unreleased` 覆盖本次全部变更，分类（Added / Changed / Fixed）正确
- [ ] `pnpm bump` 成功，`CHANGELOG.md` 出现带日期的新版本小节
- [ ] `pnpm check:version` 与 `pnpm check:version --tag x.y.z` 通过
- [ ] `pnpm verify`、`pnpm test:coverage` 通过
- [ ] tag 打在 `master` 的合并提交上，名字为裸版本号
- [ ] GitHub release 含四个资产（三个文件 + 同名 zip），manifest 版本与 tag 一致
- [ ] 本地安装该 release 后 Obsidian 显示新版本号
- [ ] 上架社区时按官方提交页更新插件信息（人工）

## 失败与回滚

| 情况                                 | 处理                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| `bump` 报 `Unreleased` 为空          | 先补 `Unreleased` 条目；确实没有变更就不发版                          |
| `versions.json` 最新版本与当前不一致 | 运行 `pnpm bump` 补齐映射，不要手工编辑旧键                           |
| tag 带 `v` 前缀                      | 删除本地错误 tag，用裸版本号重打；已推送的错误 tag 不要动，改发 patch |
| release 资产缺失或构建失败           | 不要复用同一 tag：修复 CI 后发新 patch，旧 tag 保持原样               |
| 用户端仍显示旧版本                   | 检查是否推了 tag、release 是否为最新、manifest 版本是否与 tag 一致    |
| 设置/阅读状态迁移出问题              | 发 patch 修复迁移逻辑，不修改已发布版本的 `versions.json` 映射        |

## 与 CI 的关系

- `ci.yml` 在 push / PR 上运行 `pnpm check:version` 与完整质量门禁。
- `release.yml` 由裸版本 tag 触发，先执行 `check-version.ts --tag "$GITHUB_REF_NAME"`，再
  `pnpm verify`、`pnpm inspect fixtures/sample.prg`、`pnpm package:release`，最后上传四个资产。
- 任何一项失败都不会产出 release；修正后按“失败与回滚”处理。
