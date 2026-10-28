import assert from "node:assert/strict";
import test from "node:test";
import { decodeMsgpack } from "./msgpack.ts";
import { PrgError } from "./errors.ts";

test("decodeMsgpack decodes objects, arrays and binary", () => {
  const decoded = decodeMsgpack(
    Uint8Array.from([
      0x83, 0xa1, 0x61, 0x01, 0xa1, 0x62, 0x92, 0x02, 0x03, 0xa1, 0x63, 0xc4, 0x02, 0x00, 0xff,
    ]),
  );
  assert.deepEqual(decoded, { a: 1, b: [2, 3], c: new Uint8Array([0, 255]) });
});

test("decodeMsgpack normalises invalid payloads", () => {
  assert.throws(
    () => decodeMsgpack(Uint8Array.from([0xc1])),
    (error: unknown) => error instanceof PrgError && error.code === "decode-failed",
  );
  assert.throws(
    () => decodeMsgpack(Uint8Array.from([0x93, 0x01])),
    (error: unknown) => error instanceof PrgError && error.code === "decode-failed",
  );
});
