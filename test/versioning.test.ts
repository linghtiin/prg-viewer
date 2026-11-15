import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSemver,
  isValidDate,
  parseSemver,
  promoteUnreleased,
  validateVersionState,
} from "../scripts/versioning.ts";
import type { VersionState } from "../scripts/versioning.ts";

const DESCRIPTION =
  "Open Project Graph .prg canvas files in a read-only viewer with nodes, edges, images, LaTeX and sections.";

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- New thing

## [0.1.0] - 2026-10-28

### Added

- Old thing
`;

interface StateOverrides {
  version?: string;
  packageVersion?: string;
  packageDescription?: string;
  minAppVersion?: string;
  description?: string;
  id?: string;
  name?: string;
  versions?: Record<string, string>;
  changelog?: string;
}

function makeState(overrides: StateOverrides = {}): VersionState {
  const version = overrides.version ?? "0.2.0";
  return {
    packageVersion: overrides.packageVersion ?? version,
    packageDescription: overrides.packageDescription ?? DESCRIPTION,
    manifest: {
      version,
      minAppVersion: overrides.minAppVersion ?? "1.6.0",
      description: overrides.description ?? DESCRIPTION,
      id: overrides.id ?? "prg-viewer",
      name: overrides.name ?? "Project Graph Viewer",
    },
    versions: overrides.versions ?? { "0.1.0": "1.6.0", "0.2.0": "1.6.0" },
    changelog:
      overrides.changelog ??
      CHANGELOG.replace("## [Unreleased]", "## [Unreleased]\n\n## [0.2.0] - 2026-11-16"),
  };
}

test("parseSemver accepts strict x.y.z and rejects other shapes", () => {
  assert.deepEqual(parseSemver("0.2.0"), { major: 0, minor: 2, patch: 0 });
  assert.deepEqual(parseSemver(" 12.34.56 "), { major: 12, minor: 34, patch: 56 });
  for (const invalid of ["v0.2.0", "0.2", "0.2.0-beta.1", "01.2.3", "1.2.3.4", ""]) {
    assert.equal(parseSemver(invalid), null, invalid);
  }
});

test("compareSemver orders versions and reports malformed input", () => {
  assert.equal(compareSemver("0.2.0", "0.1.9"), 1);
  assert.equal(compareSemver("0.1.10", "0.1.9"), 1);
  assert.equal(compareSemver("0.2.0", "0.2.0"), 0);
  assert.equal(compareSemver("0.2.0", "0.3.0"), -1);
  assert.equal(compareSemver("v0.2.0", "0.2.0"), null);
});

test("isValidDate accepts real calendar dates only", () => {
  assert.equal(isValidDate("2026-11-16"), true);
  assert.equal(isValidDate("2024-02-29"), true);
  assert.equal(isValidDate("2026-02-29"), false);
  assert.equal(isValidDate("2026-13-01"), false);
  assert.equal(isValidDate("2026-1-1"), false);
  assert.equal(isValidDate("2026-11-16T00:00:00Z"), false);
});

test("promoteUnreleased moves the body under a dated version heading", () => {
  const promoted = promoteUnreleased(CHANGELOG, "0.2.0", "2026-11-16");
  assert.match(
    promoted,
    /^# Changelog\n\n## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-11-16\n\n### Added\n\n- New thing/,
  );
  assert.ok(promoted.includes("## [0.1.0] - 2026-10-28"), "older release sections are preserved");
  assert.equal(promoted.match(/## \[Unreleased\]/g)?.length, 1, "only one Unreleased heading remains");
  assert.match(promoted, /- New thing\n\n## \[0\.1\.0\]/, "new section keeps the old body");
});

test("promoteUnreleased keeps a trailing newline when Unreleased is last", () => {
  const promoted = promoteUnreleased(
    "# Changelog\n\n## [Unreleased]\n\n- Only entry\n",
    "0.2.0",
    "2026-11-16",
  );
  assert.ok(promoted.endsWith("- Only entry\n"));
  assert.ok(promoted.includes("## [0.2.0] - 2026-11-16"));
});

test("promoteUnreleased refuses missing, empty or duplicate sections", () => {
  assert.throws(
    () => promoteUnreleased("# Changelog\n\n## [0.1.0] - 2026-10-28\n", "0.2.0", "2026-11-16"),
    /Unreleased/,
  );
  assert.throws(
    () =>
      promoteUnreleased("# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-10-28\n", "0.2.0", "2026-11-16"),
    /没有任何条目/,
  );
  assert.throws(() => promoteUnreleased(CHANGELOG, "0.1.0", "2026-11-16"), /已经存在 0\.1\.0/);
  assert.throws(() => promoteUnreleased(CHANGELOG, "0.2.0", "2026-02-30"), /日期/);
});

test("validateVersionState accepts a consistent release", () => {
  assert.deepEqual(validateVersionState(makeState()), []);
  assert.deepEqual(validateVersionState(makeState(), { tag: "0.2.0" }), []);
});

test("validateVersionState reports version drift between package and manifest", () => {
  const errors = validateVersionState(makeState({ packageVersion: "0.1.9" }));
  assert.ok(errors.some((error) => error.includes("版本不一致")));
});

test("validateVersionState reports a missing versions.json mapping", () => {
  const errors = validateVersionState(makeState({ versions: { "0.1.0": "1.6.0" } }));
  assert.ok(errors.some((error) => error.includes('缺少 "0.2.0"')));
});

test("validateVersionState reports a stale latest versions.json entry", () => {
  const errors = validateVersionState(
    makeState({ versions: { "0.1.0": "1.6.0", "0.2.0": "1.6.0", "0.3.0": "1.6.0" } }),
  );
  assert.ok(errors.some((error) => error.includes("最新版本是 0.3.0")));
});

test("validateVersionState reports a missing or undated CHANGELOG section", () => {
  assert.ok(
    validateVersionState(makeState({ changelog: "# Changelog\n\n## [0.2.0]\n" })).some((error) =>
      error.includes('缺少 "## [0.2.0] - YYYY-MM-DD"'),
    ),
  );
});

test("validateVersionState enforces the Obsidian bare tag rule", () => {
  const errors = validateVersionState(makeState(), { tag: "v0.2.0" });
  assert.ok(errors.some((error) => error.includes("不能带 v 前缀")));
  assert.ok(validateVersionState(makeState(), { tag: "0.2.1" }).some((error) => error.includes("不一致")));
});

test("validateVersionState enforces the community description rules", () => {
  const chinese = validateVersionState(
    makeState({
      description: "在 Obsidian 中打开 .prg 文件的只读查看器。",
      packageDescription: "在 Obsidian 中打开 .prg 文件的只读查看器。",
    }),
  );
  assert.ok(chinese.some((error) => error.includes("英文")));

  assert.ok(
    validateVersionState(makeState({ description: "Read only viewer" })).some((error) =>
      error.includes("20–250"),
    ),
  );
  assert.ok(
    validateVersionState(
      makeState({
        description: "A viewer for .prg files without a period",
        packageDescription: "A viewer for .prg files without a period",
      }),
    ).some((error) => error.includes("句号")),
  );
  assert.ok(
    validateVersionState(
      makeState({
        description: "View .prg files inside Obsidian canvas windows.",
        packageDescription: "View .prg files inside Obsidian canvas windows.",
      }),
    ).some((error) => error.includes('"Obsidian"')),
  );
  assert.ok(
    validateVersionState(
      makeState({
        description: "Project Graph Viewer renders .prg files.",
        packageDescription: "Project Graph Viewer renders .prg files.",
      }),
    ).some((error) => error.includes("插件名")),
  );
});

test("validateVersionState keeps package.json and manifest descriptions equal", () => {
  const errors = validateVersionState(
    makeState({ packageDescription: "A different description for npm users." }),
  );
  assert.ok(errors.some((error) => error.includes("description 必须与 manifest.json 保持一致")));
});

test("validateVersionState rejects invalid plugin ids", () => {
  const errors = validateVersionState(makeState({ id: "Prg Viewer" }));
  assert.ok(errors.some((error) => error.includes("id 只能包含")));
});
