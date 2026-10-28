# 架构

## 分层

```mermaid
flowchart TD
  subgraph pure["纯 TypeScript（Node 可测）"]
    F[src/format<br/>ZIP / MessagePack / 序列化 → PrgDocument]
    S[src/scene<br/>Camera / 文本布局 / 连线几何 / Scene]
  end
  R[src/render<br/>CanvasRenderer / LatexOverlay / ImageCache / Theme]
  V[src/view<br/>PrgView / 交互 / 大纲 / 详情 / 工具栏]
  M[src/main.ts<br/>插件注册、设置、命令]
  O[(Obsidian API)]

  F --> S --> R --> V --> M --> O
```

依赖只允许自上而下。`test/purity.test.ts` 会扫描 `src/format`、`src/scene`、`src/util`，禁止出现
`import "obsidian"` 或直接的 DOM 创建调用。

## 数据流

```
vault.readBinary(file)
  → readZipEntries(bytes, limits)          // 大小/路径校验，内存解压
  → decodeMsgpack(stage.msgpack)
  → resolveReferences(root)                // "_" 类名 + "$" 指针
  → parsePrg(...)                          // 归一化为 PrgDocument（含 warnings）
  → buildScene(document)                   // 分组排序、折叠隐藏、连线几何、包围盒
  → Camera + CanvasRenderer + LatexOverlay // 每帧绘制
  → DOM
```

## 视图生命周期

1. `onOpen`：构建工具栏/画布/侧栏，创建渲染器、LaTeX 浮层、图片缓存、交互控制器与 `ResizeObserver`。
2. `onLoadFile`：读取并解析；成功后按设置恢复相机或 `fit`；刷新大纲、详情、元信息。
3. 文件被外部修改（`vault.modify`）时 400ms 防抖重载；删除时展示错误卡。
4. `onUnloadFile` / `onClose`：取消动画帧、断开观察器、释放图片与 LaTeX 元素。

`onOpen` 与 `onLoadFile` 的调用顺序在不同 Obsidian 版本/工作区恢复场景下可能互换，
因此 `onLoadFile` 在 DOM 尚未就绪时只设置 `pendingLoad`，由 `onOpen` 补一次加载。

## 坐标系与渲染

- 相机：`screen = (world - offset) * scale`；缩放以光标为锚点，范围 `0.05 – 8`。
- 画布：`devicePixelRatio` 缩放，世界坐标直接作为绘制坐标；线宽/圆角按世界单位。
- 每帧只绘制视口内对象（矩形相交 + 边包围盒），文本布局按节点缓存。
- 选中轮廓线宽 `2 / scale`，保证屏幕上恒为 2px；悬停轮廓为半透明 1px。
- 文本节点遵循 Project Graph 的规则：字号 `32 * 2^(fontScaleLevel/2)`、内边距 `字号/32*14`、
  边框 `字号/32*2`、圆角 16、行高 1.5、`manual` 模式下按宽度折行；文本块在节点内**垂直居中**，
  文字高于节点时从顶部内边距开始溢出。
- 缩放很小时（屏幕字号 < 12px），透明节点会叠加一层主题边框色 20% 的填充，避免缩略视图里节点"消失"。
- 滚轮行为可配置：默认滚轮缩放、`Ctrl/⌘ + 滚轮` 平移；设置中可互换（`resolveWheelAction` 纯函数负责判定）。
- LaTeX 节点不进入画布，由 HTML 浮层用 KaTeX MathML 渲染并按相机缩放字号（矢量清晰、无需字体资源）。

## 错误处理

- 所有解析失败收敛为 `PrgError { code, message, details }`，由视图渲染错误卡（可重试/外部打开）。
- 可恢复问题进入 `PrgWarning[]`：未知类型、失效引用、重复 uuid、缺失附件、版本过新等；
  未知类型绘制占位框，不中断其余内容。
- 容器安全：条目数 ≤ 1000、单文件 ≤ 200 MiB、总计 ≤ 500 MiB，解压前用 filter 拦截；
  拒绝绝对路径、盘符与 `..`；附件 UUID 冲突视为损坏文件。

## 性能

- 视口裁剪 + 文本布局缓存 + 脏标记 + `requestAnimationFrame` 合并重绘。
- 图片走 `ImageBitmap` LRU（默认 64 MiB，可配置），淘汰时 `close()` 释放显存/内存。
- 缩放小于 6px 字号时不绘制节点文字（与官方阈值行为一致）。
- 构建产物约 620 KiB，其中 KaTeX 占大头；它换来了离线、无字体依赖的公式渲染。

## 状态持久化

写入插件 `data.json`，不触碰 vault 文件：

```json
{
  "settings": { "background": "none", "rememberCameraPerFile": true, "maxImageCacheMB": 64 },
  "cameras": { "技术积累/AI/知识图谱-AI.prg": { "x": -1200, "y": -800, "scale": 0.4 } }
}
```

相机保存有 500ms 防抖；`rememberCameraPerFile` 关闭时不写入。

## 测试边界

- 纯层（format/scene/util）由 Node 单测覆盖，覆盖率门槛强制。
- 渲染层只测试纯函数（主题映射、颜色解析）；画布与 DOM 交互靠手工冒烟清单。
- 真实文件回归通过 `pnpm inspect` 的类计数对照完成，见 `docs/compatibility.md`。
