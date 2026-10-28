import assert from "node:assert/strict";
import test from "node:test";
import { zipSync } from "fflate";
import { PrgError } from "./errors.ts";
import { isSafeEntryName, readZipEntries } from "./zip.ts";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

test("isSafeEntryName rejects traversal and absolute names", () => {
  assert.equal(isSafeEntryName("stage.msgpack"), true);
  assert.equal(isSafeEntryName("attachments/abc.png"), true);
  assert.equal(isSafeEntryName("../evil.txt"), false);
  assert.equal(isSafeEntryName("a/../../b"), false);
  assert.equal(isSafeEntryName("/etc/passwd"), false);
  assert.equal(isSafeEntryName("C:/Windows/system32"), false);
  assert.equal(isSafeEntryName("a\\b"), false);
  assert.equal(isSafeEntryName(""), false);
});

test("readZipEntries returns stored and deflated entries", () => {
  const raw = zipSync({ "a.txt": bytes("hello"), "nested/b.bin": bytes("world") }, { level: 0 });
  const stored = readZipEntries(raw);
  assert.deepEqual(Array.from(stored.keys()).sort(), ["a.txt", "nested/b.bin"]);
  assert.equal(new TextDecoder().decode(stored.get("a.txt")), "hello");

  const deflated = readZipEntries(zipSync({ "a.txt": bytes("hello") }, { level: 9 }));
  assert.equal(new TextDecoder().decode(deflated.get("a.txt")), "hello");
});

test("readZipEntries rejects unsafe entry names", () => {
  const raw = zipSync({ "../evil.txt": bytes("x") });
  assert.throws(
    () => readZipEntries(raw),
    (error: unknown) => error instanceof PrgError && error.code === "unsafe-path",
  );
});

test("readZipEntries enforces the entry count limit", () => {
  const raw = zipSync({ "a.txt": bytes("a"), "b.txt": bytes("b") });
  assert.throws(
    () => readZipEntries(raw, { maxEntries: 1, maxTotalBytes: 1024, maxEntryBytes: 1024 }),
    (error: unknown) => error instanceof PrgError && error.code === "limit-exceeded",
  );
});

test("readZipEntries enforces per-entry and total size limits", () => {
  const raw = zipSync({ "big.txt": new Uint8Array(2048) });
  assert.throws(
    () => readZipEntries(raw, { maxEntries: 10, maxTotalBytes: 10_000, maxEntryBytes: 1024 }),
    (error: unknown) => error instanceof PrgError && error.code === "limit-exceeded",
  );
  const multi = zipSync({ "a.txt": new Uint8Array(600), "b.txt": new Uint8Array(600) });
  assert.throws(
    () => readZipEntries(multi, { maxEntries: 10, maxTotalBytes: 1000, maxEntryBytes: 1000 }),
    (error: unknown) => error instanceof PrgError && error.code === "limit-exceeded",
  );
});

test("readZipEntries normalises corrupt or empty input", () => {
  assert.throws(
    () => readZipEntries(new Uint8Array(0)),
    (error: unknown) => error instanceof PrgError && error.code === "invalid-container",
  );
  assert.throws(
    () => readZipEntries(new TextEncoder().encode("definitely not a zip")),
    (error: unknown) => error instanceof PrgError && error.code === "invalid-container",
  );
});
