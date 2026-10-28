/**
 * Synchronises the version across package.json, manifest.json and versions.json.
 *
 * Usage:
 *   pnpm bump 0.2.0
 *   pnpm bump 0.2.0 --dry-run
 *
 * The CHANGELOG must already contain a `## [0.2.0]` section.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((argument) => !argument.startsWith("--"));

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("用法: pnpm bump <x.y.z> [--dry-run]");
  process.exit(2);
}

const paths = {
  package: join(root, "package.json"),
  manifest: join(root, "manifest.json"),
  versions: join(root, "versions.json"),
  changelog: join(root, "CHANGELOG.md"),
};

const packageJson = JSON.parse(readFileSync(paths.package, "utf8"));
const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
const versions = JSON.parse(readFileSync(paths.versions, "utf8"));
const changelog = readFileSync(paths.changelog, "utf8");

if (!changelog.includes(`## [${version}]`)) {
  console.error(`CHANGELOG.md 缺少 "## [${version}]" 小节，请先补写变更记录。`);
  process.exit(1);
}

const packageJsonText = `${JSON.stringify({ ...packageJson, version }, null, 2)}\n`;
const manifestText = `${JSON.stringify({ ...manifest, version }, null, 2)}\n`;
const versionsText = `${JSON.stringify({ ...versions, [version]: manifest.minAppVersion }, null, 2)}\n`;

if (dryRun) {
  console.log(`[dry-run] package.json   -> ${packageJson.version} => ${version}`);
  console.log(`[dry-run] manifest.json  -> ${manifest.version} => ${version}`);
  console.log(`[dry-run] versions.json  -> add "${version}": "${manifest.minAppVersion}"`);
  process.exit(0);
}

writeFileSync(paths.package, packageJsonText);
writeFileSync(paths.manifest, manifestText);
writeFileSync(paths.versions, versionsText);

console.log(`版本已更新为 ${version}`);
console.log(`下一步：pnpm verify && git commit -am "chore(release): ${version}" && git tag v${version}`);
