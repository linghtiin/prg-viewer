# PRG 格式备忘

本文记录本插件实现所依据的格式事实。上游规范：

- [PRG File Format Specification](https://graphif.dev/docs/spec/prg)（Version 2.3.0）
- [Serializer Specification](https://graphif.dev/docs/spec/serializer)
- [prg:// 协议链接](https://graphif.dev/docs/prg/features/feature/deep-link)

## 容器

`.prg` 是 ZIP。MIME 类型 `application/vnd.project-graph`。

| 条目                       | 必需   | 说明                                                              |
| -------------------------- | ------ | ----------------------------------------------------------------- |
| `metadata.msgpack`         | 是     | `{ version: "2.7.0", extension?: {...} }`；也接受 `metadata.json` |
| `stage.msgpack`            | 二选一 | 画布对象数组（序列化格式）                                        |
| `extension.js`             | 二选一 | 扩展包入口；本插件会提示"扩展包，非画布"                          |
| `tags.msgpack`             | 否     | `string[]`                                                        |
| `reference.msgpack`        | 否     | `{ sections: Record<string, string[]>, files: string[] }`         |
| `README.md`                | 否     | UTF-8 文本                                                        |
| `thumbnail.png`            | 否     | 应用生成的缩略图                                                  |
| `attachments/<uuid>.<ext>` | 否     | 附件；同一 UUID 最多一个文件                                      |

路径分隔符必须是 `/`，文件名 UTF-8；不允许绝对路径、盘符与 `..`。

## 序列化格式

对象以类名标记，重复对象以 JSON Pointer 引用：

```json
[
  { "_": "TextNode", "uuid": "...", "text": "起点", "collisionBox": { "_": "CollisionBox", "shapes": [...] } },
  { "$": "/0" }
]
```

- `_`：类名；其余键为属性。
- `$`：绝对路径（以 `/` 开头），支持 `~0` / `~1` 转义。
- 引用可能形成环；本实现用深度上限 + 活跃集合检测，环处替换为 `CyclicReference` 占位并告警。

## 实测字段（2.3.0 / 2.7.0）

| 类                                             | 字段                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TextNode`                                     | `uuid`, `text`, `collisionBox`, `color`, `fontScaleLevel`, `sizeAdjust`(`auto`/`manual`), `fontFamily`, `fontWeight`, `borderStyle`(`solid`/`dashed`/`none`), `details`(Plate 富文本) |
| `ImageNode`                                    | `uuid`, `collisionBox`, `attachmentId`, `scale`, `isBackground`                                                                                                                       |
| `LatexNode`                                    | `uuid`, `latexSource`, `collisionBox`, `color`, `fontScaleLevel`                                                                                                                      |
| `Section`                                      | `uuid`, `_collisionBoxNormal`(位置), `color`, `text`, `children`(内联实体数组), `isCollapsed`, `locked`, `borderStyle`                                                                |
| `LineEdge`                                     | `uuid`, `associationList`(引用数组), `text`, `color`, `lineType`, `arrowType`, `sourceRectangleRate`, `targetRectangleRate`                                                           |
| `PenStroke`                                    | `uuid`, `segments`, `color`, `collisionBox`, `location`                                                                                                                               |
| `SvgNode` / `MediaNode` / `ReferenceBlockNode` | `uuid`, `collisionBox`, `attachmentId`(等)                                                                                                                                            |

注意：

- `Section` 的几何存在 `_collisionBoxNormal`，而不是 `collisionBox` —— 后者只是运行期 getter，不参与序列化。
  其 `shapes` 由 4 条 `Line`（上、右、下、左边界）和一个标题条 `Rectangle` 组成，真实外框取 4 条线的包围盒；
  若只看 `Rectangle` 会得到 50px 高的标题条。
  折叠（`isCollapsed`）时不保存折叠框，读端需按标题文字估算居中框。
- `children` 内联的实体通常也出现在顶层 `stage`（或通过 `$` 指向同一对象），因此同一 `uuid` 出现两次是正常现象，
  读端应静默去重而不是报错。

几何基础类：

```
CollisionBox { shapes: Shape[] }
Rectangle { location: Vector, size: Vector }
Vector { x, y }
Color { r, g, b, a }        // a = 0 表示“无自定义颜色”
```

## 渲染语义

以下数值来自上游源码（`app/src/core/**`）的公开行为，用于视觉兼容：

| 项                | 规则                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| 字号              | `32 * 2^(fontScaleLevel / 2)`；结果 ≥ 2 时向下取整                                         |
| 内边距            | `字号 / 32 * 14`                                                                           |
| 边框宽            | `字号 / 32 * 2`                                                                            |
| 圆角              | 固定 16                                                                                    |
| 行高              | 1.5                                                                                        |
| 文本起点          | `location + padding + (0, 字号/4)`，逐行垂直居中                                           |
| 文本颜色          | `color.a === 1` 时取填充色的对比色；否则用主题文本色                                       |
| 边端点            | rate `0.01/0.99` → 矩形边中点；`(0.5,0.5)` → 中心连线与矩形边交点；其他 → 矩形内按比例取点 |
| 边上 x 轴哨兵优先 | rate 同时命中 x 与 y 哨兵时取 x                                                            |
| 边曲线            | 三次贝塞尔；`bending = min(距离/2, 沿法线投影/2)`，控制点沿法线偏移                        |
| 边标签位置        | 绘制曲线 t = 0.5 的中点（随连线走向，不用控制点）                                          |
| 边宽              | 默认 2；源为 `TextNode` 时取其边框宽                                                       |

## 安全建议（已在实现中执行）

- 条目数 ≤ 1000；单条目解压 ≤ 200 MiB；总解压 ≤ 500 MiB。
- 不解压到磁盘，只在内存中读取。
- 拒绝绝对路径、盘符、反斜杠与含 `..` 的条目。
- 附件 UUID 冲突直接判为损坏（规范要求报错而不是静默选择）。

## 深链

```
prg:///<绝对路径>?target=<uuid>&location=<x>,<y>&zoom=<n>
```

- 本插件生成 `prg:///` + 正斜杠路径（Windows 盘符保留 `:`），路径段做 URI 编码。
- `target` 定位节点；`location`/`zoom` 定位视野。
- 仅桌面端可用（需要注册协议处理器的 Project Graph 应用）。

## 兼容性策略

- `metadata.version` major > 2：继续解析并提示"可能无法完整显示"。
- 未知类：绘制占位框并只记录一次告警。
- 缺少 `stage.msgpack` 且无 `extension.js`：报错 `missing-stage`。
