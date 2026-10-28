import assert from "node:assert/strict";
import test from "node:test";
import type { PrgWarning } from "./errors.ts";
import { isReference, resolvePointer, resolveReferences } from "./serializer.ts";

test("resolvePointer walks arrays and objects", () => {
  const root = [{ name: "first" }, { name: "second", nested: { deep: 42 } }];
  assert.deepEqual(resolvePointer(root, "/0"), { name: "first" });
  assert.equal((resolvePointer(root, "/1/nested") as Record<string, unknown>).deep, 42);
  assert.equal(resolvePointer(root, "/5"), undefined);
  assert.equal(resolvePointer(root, "/1/nope"), undefined);
  assert.equal(resolvePointer(root, "no-leading-slash"), undefined);
});

test("resolvePointer supports JSON Pointer escapes", () => {
  const root = { "a/b": 1, "c~d": 2 };
  assert.equal(resolvePointer(root, "/a~1b"), 1);
  assert.equal(resolvePointer(root, "/c~0d"), 2);
});

test("resolveReferences replaces references with their targets", () => {
  const shared = { _: "Shared", value: 7 };
  const root = [shared, { $: "/0" }];
  const resolved = resolveReferences(root) as unknown[];
  assert.deepEqual(resolved[1], { _: "Shared", value: 7 });
  assert.notEqual(resolved[1], shared, "resolved values are copies, not aliases");
});

test("resolveReferences reports broken references without throwing", () => {
  const warnings: PrgWarning[] = [];
  const resolved = resolveReferences([{ $: "/9" }], warnings) as unknown[];
  assert.deepEqual(resolved[0], { _: "MissingReference" });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.code, "invalid-reference");
});

test("resolveReferences detects cycles", () => {
  const node: Record<string, unknown> = { _: "Node" };
  const root = [node];
  node.self = { $: "/0" };
  const warnings: PrgWarning[] = [];
  const resolved = resolveReferences(root, warnings) as Record<string, unknown>[];
  const expanded = resolved[0]?.self as Record<string, unknown>;
  assert.equal(expanded._, "Node");
  const cut = expanded.self as Record<string, unknown>;
  assert.equal(cut._, "CyclicReference");
  assert.ok(warnings.some((warning) => warning.code === "invalid-reference"));
});

test("resolveReferences respects the depth guard", () => {
  const warnings: PrgWarning[] = [];
  let nested: Record<string, unknown> = { _: "Leaf" };
  for (let index = 0; index < 20; index += 1) {
    nested = { _: "Branch", child: nested };
  }
  resolveReferences(nested, warnings, { maxDepth: 5 });
  assert.ok(warnings.some((warning) => warning.message.includes("层级过深")));
});

test("isReference only accepts objects with a string $ key", () => {
  assert.equal(isReference({ $: "/0" }), true);
  assert.equal(isReference({ $: 1 }), false);
  assert.equal(isReference([{ $: "/0" }]), false);
  assert.equal(isReference(null), false);
});
