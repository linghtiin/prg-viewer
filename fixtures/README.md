# 测试夹具

`sample.prg` 是合成文件，由脚本生成，可安全提交：

```bash
pnpm fixture
```

生成内容：

- 3 个 `TextNode`（含样式差异、富文本详情）
- 1 个 `ImageNode` + 1×1 PNG 附件
- 1 个 `LatexNode`
- 1 个 `Section`，内含一个嵌套子节点（用于验证 `$` 引用路径 `/5/children/0`）
- 1 个未知类 `FutureNode`（验证降级）
- 2 条 `LineEdge`

请勿手工编辑该文件；修改夹具请改 `scripts/make-fixture.ts` 后重新生成并提交。
