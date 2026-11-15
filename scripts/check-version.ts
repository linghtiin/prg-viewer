/**
 * Verifies that package.json, manifest.json, versions.json and CHANGELOG.md
 * describe the same release, and that a release tag (when given) matches the
 * manifest version exactly.
 *
 * Usage:
 *   pnpm check:version
 *   pnpm check:version --tag 0.2.0
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVersionFiles } from "./version-files.ts";
import { validateVersionState } from "./versioning.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const tagFlagIndex = args.indexOf("--tag");
const tag = tagFlagIndex >= 0 ? args[tagFlagIndex + 1] : undefined;

if (tagFlagIndex >= 0 && (tag === undefined || tag.length === 0 || tag.startsWith("--"))) {
  console.error("用法: pnpm check:version [--tag <版本号>]");
  process.exit(2);
}

try {
  const { state } = loadVersionFiles(root);
  const errors = validateVersionState(state, tag === undefined ? {} : { tag });
  if (errors.length > 0) {
    console.error("✗ 版本一致性检查失败：");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const suffix = tag === undefined ? "" : `（tag ${tag}）`;
  console.log(`✓ 版本一致性检查通过：${state.manifest.version}${suffix}`);
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
