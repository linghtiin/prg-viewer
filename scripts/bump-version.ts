/**
 * Promotes `Unreleased` in CHANGELOG.md and synchronises the version across
 * package.json, manifest.json and versions.json.
 *
 * Usage:
 *   pnpm bump 0.2.0
 *   pnpm bump 0.2.0 --dry-run
 *   pnpm bump 0.2.0 --date 2026-11-16
 *
 * The Unreleased section must already describe the release. This script never
 * edits the README: user-facing prose belongs to the release branch by hand.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVersionFiles } from "./version-files.ts";
import {
  compareSemver,
  isValidDate,
  parseSemver,
  promoteUnreleased,
  validateVersionState,
} from "./versioning.ts";
import type { VersionState } from "./versioning.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((argument) => !argument.startsWith("-"));
const dateFlagIndex = args.indexOf("--date");
const date = dateFlagIndex >= 0 ? args[dateFlagIndex + 1] : today();

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function usage(message: string): never {
  console.error(message);
  console.error("用法: pnpm bump <x.y.z> [--dry-run] [--date YYYY-MM-DD]");
  process.exit(2);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function printErrors(errors: readonly string[]): void {
  for (const error of errors) console.error(`  - ${error}`);
}

if (!version || !parseSemver(version)) {
  usage(`版本号必须形如 x.y.z：${version ?? "(缺少)"}`);
}
if (date === undefined || !isValidDate(date)) {
  usage(`日期必须形如 YYYY-MM-DD：${date ?? "(缺少)"}`);
}

let loaded;
try {
  loaded = loadVersionFiles(root);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const { state } = loaded;
const currentErrors = validateVersionState(state);
if (currentErrors.length > 0) {
  console.error("✗ 当前版本文件不一致，请先修复：");
  printErrors(currentErrors);
  process.exit(1);
}

const currentVersion = state.manifest.version;
const order = compareSemver(version, currentVersion);
if (order === null) {
  fail(`无法比较版本号：${currentVersion} -> ${version}`);
}
if (order <= 0) {
  fail(`目标版本 ${version} 必须大于当前版本 ${currentVersion}。`);
}

let changelog: string;
try {
  changelog = promoteUnreleased(state.changelog, version, date);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const versions = { ...state.versions, [version]: state.manifest.minAppVersion };
const nextState: VersionState = {
  ...state,
  packageVersion: version,
  manifest: { ...state.manifest, version },
  versions,
  changelog,
};
const nextErrors = validateVersionState(nextState);
if (nextErrors.length > 0) {
  console.error("✗ 更新后的版本文件仍然不一致：");
  printErrors(nextErrors);
  process.exit(1);
}

if (dryRun) {
  console.log(`[dry-run] package.json   ${currentVersion} => ${version}`);
  console.log(`[dry-run] manifest.json  ${currentVersion} => ${version}`);
  console.log(`[dry-run] versions.json  + "${version}": "${state.manifest.minAppVersion}"`);
  console.log(`[dry-run] CHANGELOG.md   ## [Unreleased] => ## [${version}] - ${date}`);
  console.log("[dry-run] 未写入任何文件。");
  process.exit(0);
}

try {
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ ...loaded.packageJson, version }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "manifest.json"),
    `${JSON.stringify({ ...loaded.manifestJson, version }, null, 2)}\n`,
  );
  writeFileSync(join(root, "versions.json"), `${JSON.stringify(versions, null, 2)}\n`);
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
} catch (error) {
  fail(`写入版本文件失败：${error instanceof Error ? error.message : String(error)}`);
}

console.log(`版本已更新为 ${version}（CHANGELOG 已提升并重建 Unreleased）。`);
console.log("下一步：pnpm check:version && pnpm verify");
console.log(`提交并合并后：git tag -a ${version} -m "${version}" && git push origin master ${version}`);
