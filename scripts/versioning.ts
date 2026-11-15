/**
 * Pure helpers shared by `bump-version.ts` and `check-version.ts`.
 *
 * Nothing in here touches the filesystem: the release scripts read the files
 * and hand the values to these functions, which keeps the rules unit-testable.
 */

export interface SemverParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface ManifestInfo {
  readonly version: string;
  readonly minAppVersion: string;
  readonly description: string;
  readonly id: string;
  readonly name: string;
}

export interface VersionState {
  readonly packageVersion: string;
  readonly packageDescription: string;
  readonly manifest: ManifestInfo;
  readonly versions: Readonly<Record<string, string>>;
  readonly changelog: string;
}

export interface ValidateOptions {
  /** Release tag that triggered the check, when running in CI. */
  readonly tag?: string;
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a strict `x.y.z` version (no `v` prefix, no leading zeros). */
export function parseSemver(value: string): SemverParts | null {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every((part) => Number.isSafeInteger(part))) return null;
  return { major, minor, patch };
}

function comparePart(left: number, right: number): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Compares two versions, or returns `null` when either one is malformed. */
export function compareSemver(left: string, right: string): number | null {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  return comparePart(a.major, b.major) || comparePart(a.minor, b.minor) || comparePart(a.patch, b.patch);
}

/** Returns whether `value` is an existing calendar date in `YYYY-MM-DD` form. */
export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Promotes the `## [Unreleased]` section to `## [version] - date` and leaves a
 * fresh, empty `## [Unreleased]` heading above it.
 */
export function promoteUnreleased(changelog: string, version: string, date: string): string {
  if (!parseSemver(version)) {
    throw new Error(`版本号必须形如 x.y.z：${version}`);
  }
  if (!isValidDate(date)) {
    throw new Error(`日期必须形如 YYYY-MM-DD：${date}`);
  }
  if (new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "m").test(changelog)) {
    throw new Error(`CHANGELOG.md 已经存在 ${version} 小节，不能重复提升。`);
  }

  const heading = /^## \[Unreleased\][ \t]*$/m.exec(changelog);
  if (!heading) {
    throw new Error('CHANGELOG.md 缺少 "## [Unreleased]" 小节。');
  }

  const rest = changelog.slice(heading.index + heading[0].length);
  const next = /^## \[/m.exec(rest);
  const body = (next ? rest.slice(0, next.index) : rest).trim();
  if (!/^[ \t]*-[ \t]+\S/m.test(body)) {
    throw new Error("CHANGELOG.md 的 Unreleased 小节没有任何条目，无法发版。");
  }

  const tail = next ? rest.slice(next.index) : "";
  const combined = `${changelog.slice(0, heading.index)}## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n\n${tail}`;
  return tail.length > 0 ? combined : `${combined.trimEnd()}\n`;
}

/**
 * Collects every problem that would make a release inconsistent. An empty
 * array means the version files, CHANGELOG and (optional) tag agree.
 */
export function validateVersionState(state: VersionState, options: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  const { manifest } = state;
  const version = manifest.version;

  if (!parseSemver(version)) {
    errors.push(`manifest.json 的 version 不是合法的 x.y.z：${version}`);
  }
  if (!parseSemver(state.packageVersion)) {
    errors.push(`package.json 的 version 不是合法的 x.y.z：${state.packageVersion}`);
  }
  if (state.packageVersion !== version) {
    errors.push(`package.json（${state.packageVersion}）与 manifest.json（${version}）版本不一致。`);
  }
  if (!parseSemver(manifest.minAppVersion)) {
    errors.push(`manifest.json 的 minAppVersion 不是合法的 x.y.z：${manifest.minAppVersion}`);
  }

  if (parseSemver(version) && state.versions[version] !== manifest.minAppVersion) {
    errors.push(`versions.json 缺少 "${version}": "${manifest.minAppVersion}" 映射。`);
  }

  const keys = Object.keys(state.versions);
  if (keys.length === 0) {
    errors.push("versions.json 为空。");
  }
  let latest: string | null = null;
  for (const key of keys) {
    if (!parseSemver(key)) {
      errors.push(`versions.json 含非法版本号：${key}`);
      continue;
    }
    const order = latest === null ? 1 : (compareSemver(key, latest) ?? 0);
    if (order > 0) latest = key;
  }
  if (latest !== null && latest !== version) {
    errors.push(`versions.json 最新版本是 ${latest}，当前版本是 ${version}；请运行 pnpm bump 同步。`);
  }

  const releaseHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}[ \\t]*$`, "m");
  if (!releaseHeading.test(state.changelog)) {
    errors.push(`CHANGELOG.md 缺少 "## [${version}] - YYYY-MM-DD" 小节。`);
  }

  const description = manifest.description;
  if (description.length < 20 || description.length > 250) {
    errors.push("manifest.json 的 description 必须为 20–250 个字符。");
  }
  if (!/^[\x20-\x7e]+$/.test(description)) {
    errors.push("manifest.json 的 description 只能使用英文（ASCII）字符。");
  }
  if (!description.endsWith(".")) {
    errors.push("manifest.json 的 description 必须以句号结尾。");
  }
  if (/obsidian/i.test(description)) {
    errors.push('manifest.json 的 description 不能包含 "Obsidian"。');
  }
  if (description.toLowerCase().startsWith(manifest.name.toLowerCase())) {
    errors.push("manifest.json 的 description 不能以插件名开头。");
  }
  if (state.packageDescription !== description) {
    errors.push("package.json 的 description 必须与 manifest.json 保持一致。");
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
    errors.push(`manifest.json 的 id 只能包含小写字母、数字与连字符：${manifest.id}`);
  }

  if (options.tag !== undefined && options.tag !== version) {
    if (options.tag === `v${version}`) {
      errors.push(`tag 不能带 v 前缀：Obsidian 要求 tag 与 manifest 版本完全一致（${version}）。`);
    } else {
      errors.push(`tag（${options.tag}）与 manifest.json 的版本（${version}）不一致。`);
    }
  }

  return errors;
}
