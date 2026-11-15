# 测试

## 运行

```bash
pnpm test             # 单测（Node 内置测试运行器）
pnpm test:watch       # 监听模式
pnpm test:coverage    # 覆盖率 + 门槛检查
pnpm typecheck
pnpm lint
pnpm format:check
pnpm verify           # 以上全部 + 构建
```

门槛：行 85%、函数 85%、分支 75%（仅统计 `src/format`、`src/scene`）。低于门槛 `pnpm test:coverage`
直接失败。

## 单测范围

| 模块                    | 关注点                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- |
| `format/zip`            | 存储/压缩条目、路径穿越、条目数与体积上限、空/损坏输入                            |
| `format/msgpack`        | 原语/嵌套/二进制、截断与非法字节                                                  |
| `format/serializer`     | JSON Pointer、`~0`/`~1`、循环、失效引用、深度上限                                 |
| `format/build-document` | 各节点类型、嵌套 Section、重复 uuid、悬空连线、扩展包、版本告警、附件冲突         |
| `scene/camera`          | 世界/屏幕往返、锚点缩放、钳制、适配、持久化数据校验                               |
| `scene/text-layout`     | 字号/内边距公式、CJK 与拉丁折行、auto/manual                                      |
| `scene/edge-geometry`   | 哨兵 rate、中心裁剪、自环、控制点、箭头方向                                       |
| `scene/scene`           | 层级排序、折叠隐藏、视口裁剪、命中测试、空文档                                    |
| `scene/css-color`       | hex/rgb/rgba/百分比、非法回退                                                     |
| `util/deep-link`        | Windows/POSIX、空格/CJK/保留字符、可选参数                                        |
| `settings`              | 默认值、合并、非法值校正、范围钳制                                                |
| `view/outline-panel`    | 节点树构建（分组包含 + 连线方向）、父子顺序、重复归属、环保护、扁平化与方向键导航 |
| `render/theme`          | 主题变量映射与回退                                                                |
| `test/purity`           | 核心层不得依赖 Obsidian / DOM                                                     |

## 测试夹具

`fixtures/sample.prg` 由 `scripts/make-fixture.ts` 生成（合成内容，可安全提交）：

```bash
pnpm fixture
pnpm inspect fixtures/sample.prg
```

夹具包含 3 个文本节点、1 个图片（1×1 PNG）、1 个 LaTeX、1 个分组（含嵌套子节点）、1 个未知类、
2 条连线，其中一条引用嵌套路径 `/5/children/0`，用于验证序列化引用解析。

测试内构造变体请使用 `test/helpers/build-prg.ts`（`buildPrg`、`textNode`、`lineEdge` 等），不要写死
二进制夹具。

## 真实文件回归

```bash
pnpm inspect "<vault>/技术积累/AI/知识图谱-AI.prg" --json
```

对照 `docs/compatibility.md` 的类计数。解析层改动后若计数变化，需在 PR 中说明原因。

## 手工冒烟清单

在 Obsidian 中启用插件后逐项确认：

1. 打开 `数据结构与算法.prg`：25 个文本节点、23 条连线，连线端点贴合节点边缘。
2. 打开 `数学理论.prg`：7 个公式节点正确排版，缩放时清晰。
3. 打开 `知识图谱-AI.prg`（1.19 MB）：18 张图片显示完整，首帧 < 2 秒。
4. 打开 `Enneads.prg`：72 个节点、70 条连线，适配视图后全部可见。
5. 平移/缩放：`Ctrl+滚轮` 以光标为锚点；拖动跟手；`F` 适配；`0` 回到 100%。
6. 搜索：输入关键词，`Enter` 循环跳转并居中。
7. 键盘：画布聚焦时，方向键切换选中节点并在需要时平移到可见区域；大纲聚焦时方向键同样切换选中，
   左右键在父级/子级和折叠/展开间切换；`Shift+方向键` 仍平移画布。
8. 大纲：标题栏「树 / 分类」切换生效；节点树按分组嵌套，无分组的思维导图（如 `Enneads.prg`）按连线
   方向成树；单分支折叠/展开与「全部折叠 / 全部展开」正常；点击条目定位并高亮；在画布选中折叠分支内的
   节点时自动展开祖先；设置页可配置默认宽度，打开后拖动只影响当前会话且不改 `data.json`；鼠标悬停
   整棵树不再出现提示框；关闭后工具栏按钮可重新打开。
9. 详情：节点自身文本与「附加文本」在视觉上可区分；节点很多的 `.prg`（如 `Enneads.prg`）中，详情区
   始终固定在大纲下方并独立滚动，无需把大纲滚到底；设置页可配置详情默认高度；打开后拖动分隔条可拉高
   详情以完整阅读长文本，双击分隔条恢复设置中的默认高度；拖动不写 `data.json`，重新打开文件仍按设置值；
   文本、uuid、位置、富文本、图片预览正确；"复制节点链接"生成的 `prg://` 含 `target`。
10. 外部打开：点击 "在 Project Graph 中打开" 能唤起应用（未安装时应提示并复制链接）。
11. 深色/浅色主题切换后颜色正确，无需重新加载。
12. 窗口缩放、外接显示器（DPR 变化）后画面不模糊、不偏移。
13. 只读验证（PowerShell）：

```powershell
$f = "C:\Users\<你>\Documents\Mind Vault\技术积累\AI\知识图谱-AI.prg"
(Get-FileHash $f -Algorithm SHA256).Hash
# 在 Obsidian 中打开、缩放、选中节点后再执行一次，哈希必须一致
```

14. 异常路径：把 `fixtures/sample.prg` 改名为 `.zip` 以外的损坏文件后打开，应显示错误卡而不是崩溃。
15. 状态分离：打开并平移/缩放后，插件目录出现 `reading-state.json`，而 `data.json` 的内容与修改时间
    不变（`Get-FileHash` 校验）；拖动大纲宽度/详情高度后 `data.json` 仍不变；在设置页修改「大纲默认
    宽度 / 详情默认高度」时 `data.json` 更新，重新打开文件按新的默认值展示；重启 Obsidian 后相机位置
    恢复；关闭“按文件记忆视图”后不再写入。
