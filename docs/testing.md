# 测试

## 运行

```bash
pnpm test             # 单测（Node 内置测试运行器）
pnpm test:watch       # 监听模式
pnpm test:coverage    # 覆盖率 + 门槛检查
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:version    # package / manifest / versions / CHANGELOG 一致性
pnpm verify           # 以上全部 + 构建
```

门槛：行 85%、函数 85%、分支 75%（仅统计被测试加载的模块）。低于门槛 `pnpm test:coverage`
直接失败。

## 单测范围

| 模块                    | 关注点                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| `format/zip`            | 存储/压缩条目、路径穿越、条目数与体积上限、空/损坏输入                       |
| `format/msgpack`        | 原语/嵌套/二进制、截断与非法字节                                             |
| `format/serializer`     | JSON Pointer、`~0`/`~1`、循环、失效引用、深度上限                            |
| `format/build-document` | 各节点类型、嵌套 Section、重复 uuid、悬空连线、扩展包、版本告警、附件冲突    |
| `scene/camera`          | 世界/屏幕往返、锚点缩放、钳制、适配、持久化数据校验                          |
| `scene/text-layout`     | 字号/内边距公式、CJK 与拉丁折行、auto/manual                                 |
| `scene/edge-geometry`   | 哨兵 rate、中心裁剪、自环、控制点、箭头方向                                  |
| `scene/scene`           | 层级排序、折叠隐藏、视口裁剪、命中测试、空文档                               |
| `scene/css-color`       | hex/rgb/rgba/百分比、非法回退                                                |
| `util/deep-link`        | Windows/POSIX、空格/CJK/保留字符、可选参数                                   |
| `settings`              | 默认值、合并、非法值校正、范围钳制                                           |
| `view/outline-panel`    | 包含树与连接树两套森林、父子顺序、重复归属、环保护、行键、扁平化与方向键导航 |
| `render/theme`          | 主题变量映射与回退                                                           |
| `test/purity`           | 核心层不得依赖 Obsidian / DOM                                                |

## 测试夹具

`fixtures/sample.prg` 是仓库内的标准样本，由 `scripts/make-fixture.ts` 生成（合成内容，可安全提交）：

```bash
pnpm fixture
pnpm inspect fixtures/sample.prg --json
```

夹具包含 3 个文本节点、1 张图片（1×1 PNG）、1 个 LaTeX、1 个分组（含嵌套子节点）、1 个未知类、
2 条连线，其中一条引用嵌套路径 `/5/children/0`，用于验证序列化引用解析。

测试内构造变体请使用 `test/helpers/build-prg.ts`（`buildPrg`、`textNode`、`lineEdge` 等），不要写死
二进制夹具。

## 回归基准

仓库内的回归基准就是 `fixtures/sample.prg`：

```bash
pnpm inspect fixtures/sample.prg --json
```

基线：PRG `2.7.0`；`TextNode` 3、`ImageNode` 1、`LatexNode` 1、`Section` 1、未知类 1；2 条连线；
1 个附件；1 条 `unknown-class` 告警。修改解析层后计数必须保持一致，并同步 [compatibility.md](compatibility.md)。

自有库中的真实 `.prg` 只在本机做额外验证，**不要把文件名或路径写入仓库与文档**。

## 手工冒烟清单

在 Obsidian 中启用插件后，用 `fixtures/sample.prg`（复制到测试库）逐项确认：

1. 打开样本：3 个文本节点、1 张图片、1 个公式、1 个分组、1 个未知节点占位框、2 条连线，
   连线端点贴合节点边缘。
2. 公式节点排版正确，缩放时清晰；图片完整显示。
3. 平移/缩放：`Ctrl+滚轮` 以光标为锚点；拖动跟手；`F` 适配；`0` 回到 100%；`+` / `-` 生效。
4. 搜索：输入关键词，`Enter` 循环跳转并居中。
5. 键盘：画布聚焦时，方向键切换选中节点并在需要时平移到可见区域；大纲聚焦时方向键同样切换选中，
   左右键在父级/子级和折叠/展开间切换；`Shift+方向键` 仍平移画布。
6. 大纲：标题栏「树 / 分类」切换生效。「树」由 `包含` 与 `连接` 两组组成：`包含` 只按分组框的包含关系
   展开（不在其他框内的框是根）；`连接` 只按连线方向成树（没有入边的节点/框是根，只有出边的框也会成为根）；
   被框住的节点不会被框改变连线层级，同一个框可以在两组各出现一次、各显示各自的孩子。分组框的折叠角标带
   方框与强调色（无子级的框保留方框），普通节点保持淡色无框三角。单分支折叠/展开与「全部折叠 / 全部展开」
   正常；点击条目定位并高亮；在画布选中折叠分支内的节点时自动展开祖先；设置页可配置默认宽度，打开后拖动
   只影响当前会话且不改 `data.json`；鼠标悬停整棵树不再出现提示框；关闭后工具栏按钮可重新打开。
7. 详情：节点自身文本与「附加文本」在视觉上可区分；详情区固定在大纲下方并独立滚动；设置页可配置
   详情默认高度；打开后拖动分隔条可拉高详情，双击分隔条恢复设置中的默认高度；拖动不写 `data.json`，
   重新打开文件仍按设置值；文本、uuid、位置、富文本、图片预览正确；"复制节点链接"生成的 `prg://`
   含 `target`。
8. 外部打开：点击 "在 Project Graph 中打开" 能唤起应用（未安装时应提示并复制链接）。
9. 主题：深色/浅色切换后颜色正确，无需重新加载。
10. 窗口缩放、外接显示器（DPR 变化）后画面不模糊、不偏移。
11. 性能（可选）：打开自己库中较大的 `.prg`（例如 >1 MB），首帧应在 2 秒内。
12. 只读验证（PowerShell）：

```powershell
$f = "<你的库>/sample.prg"   # 任意 .prg
(Get-FileHash $f -Algorithm SHA256).Hash
# 在 Obsidian 中打开、缩放、选中节点后再执行一次，哈希必须一致
```

13. 异常路径：把 `fixtures/sample.prg` 截断或改成非 ZIP 内容后打开，应显示错误卡而不是崩溃。
14. 状态分离：打开并平移/缩放后，插件目录出现 `reading-state.json`，而 `data.json` 的内容与修改时间
    不变（`Get-FileHash` 校验）；拖动大纲宽度/详情高度后 `data.json` 仍不变；在设置页修改「大纲默认
    宽度 / 详情默认高度」时 `data.json` 更新，重新打开文件按新的默认值展示；重启 Obsidian 后相机位置
    恢复；关闭“按文件记忆视图”后不再写入。
