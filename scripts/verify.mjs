/**
 * Runs the full local quality gate without relying on a global `pnpm` binary.
 * Every step is executed with the current Node executable and the locally
 * installed tool, which keeps the command working in constrained sandboxes and
 * on CI images alike.
 *
 * Usage: pnpm verify
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const local = (relative) => join(root, "node_modules", relative);

const tools = {
  prettier: local("prettier/bin/prettier.cjs"),
  eslint: local("eslint/bin/eslint.js"),
  tsc: local("typescript/bin/tsc"),
};

for (const [name, path] of Object.entries(tools)) {
  if (!existsSync(path)) {
    console.error(`找不到本地工具 ${name}（${path}）。请先运行 pnpm install。`);
    process.exit(1);
  }
}

const testArgs = ["--test", "--test-isolation=none", "src/**/*.test.ts", "test/**/*.test.ts"];

const steps = [
  { name: "format:check", args: [tools.prettier, "--check", "."] },
  { name: "lint", args: [tools.eslint, "."] },
  { name: "typecheck", args: [tools.tsc, "--noEmit"] },
  { name: "check:version", args: ["--experimental-strip-types", join(root, "scripts", "check-version.ts")] },
  { name: "test", args: testArgs },
  { name: "build", args: [join(root, "scripts", "build.mjs")] },
];

for (const step of steps) {
  console.log(`\n▶ ${step.name}`);
  const result = spawnSync(process.execPath, step.args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    console.error(`✗ ${step.name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`✗ ${step.name} 失败（退出码 ${result.status ?? "unknown"}）`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n✓ verify 全部通过");
