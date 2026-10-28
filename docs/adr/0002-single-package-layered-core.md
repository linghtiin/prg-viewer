# ADR 0002：单包 + 分层核心

- 状态：已接受
- 日期：2026-10-28

## 背景

解析层与几何层不依赖 Obsidian，理论上可以拆成独立 npm 包（monorepo）。但当前只有插件一个消费者，
多包会带来工作区、构建与发布复杂度，收益不明显。

## 决策

使用单包，内部严格分层：

```
src/format  src/scene  src/util   ← 纯 TS，禁止 import "obsidian"
src/render  src/view  src/main    ← 集成层
```

用 `test/purity.test.ts` 与 ESLint `no-restricted-imports` 双重约束。相对导入带 `.ts` 扩展名，
使 Node 内置测试运行器可以直接执行 TypeScript（类型剥离）。

## 后果

- 核心层可以在 Node 中直接单测，无需模拟 Obsidian；
- 未来若要抽出 `prg-reader` 包，只需移动目录并补 `package.json`，无需重写逻辑；
- 单一构建（esbuild → CJS）简单，插件加载快。
