import { decode } from "@msgpack/msgpack";
import { PrgError, describeError } from "./errors.ts";

/** Decodes a MessagePack payload, normalising failures into a PrgError. */
export function decodeMsgpack(bytes: Uint8Array): unknown {
  try {
    return decode(bytes);
  } catch (error) {
    throw new PrgError("decode-failed", "MessagePack 数据无法解码。", describeError(error));
  }
}
