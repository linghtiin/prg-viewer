/**
 * Reads the four release files and normalises them for the versioning helpers.
 *
 * Kept separate from `versioning.ts` so the rules stay pure and testable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ManifestInfo, VersionState } from "./versioning.ts";

export interface LoadedVersionFiles {
  readonly packageJson: Record<string, unknown>;
  readonly manifestJson: Record<string, unknown>;
  readonly versions: Record<string, string>;
  readonly changelog: string;
  readonly state: VersionState;
}

function fail(message: string): never {
  throw new Error(message);
}

function readText(root: string, name: string): string {
  try {
    return readFileSync(join(root, name), "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(`无法读取 ${name}：${reason}`);
  }
}

function parseObject(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(`${label} 不是合法 JSON：${reason}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`${label} 的顶层必须是对象。`);
  }
  return value as Record<string, unknown>;
}

function stringField(object: Record<string, unknown>, key: string, label: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    return fail(`${label} 缺少字符串字段 ${key}。`);
  }
  return value;
}

function versionMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("versions.json 的顶层必须是对象。");
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") {
      return fail(`versions.json 的 "${key}" 必须是字符串版本号。`);
    }
    result[key] = entry;
  }
  return result;
}

/** Loads `package.json`, `manifest.json`, `versions.json` and `CHANGELOG.md`. */
export function loadVersionFiles(root: string): LoadedVersionFiles {
  const packageJson = parseObject(readText(root, "package.json"), "package.json");
  const manifestJson = parseObject(readText(root, "manifest.json"), "manifest.json");
  const versions = versionMap(parseObject(readText(root, "versions.json"), "versions.json"));
  const changelog = readText(root, "CHANGELOG.md");

  const manifest: ManifestInfo = {
    version: stringField(manifestJson, "version", "manifest.json"),
    minAppVersion: stringField(manifestJson, "minAppVersion", "manifest.json"),
    description: stringField(manifestJson, "description", "manifest.json"),
    id: stringField(manifestJson, "id", "manifest.json"),
    name: stringField(manifestJson, "name", "manifest.json"),
  };

  const state: VersionState = {
    packageVersion: stringField(packageJson, "version", "package.json"),
    packageDescription: stringField(packageJson, "description", "package.json"),
    manifest,
    versions,
    changelog,
  };

  return { packageJson, manifestJson, versions, changelog, state };
}
