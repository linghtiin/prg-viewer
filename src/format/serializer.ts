import { createWarning, pushWarning, type PrgWarning } from "./errors.ts";

/**
 * The Graphif Serializer format stores objects as `{ "_": "ClassName", ... }`
 * and may deduplicate repeated objects as `{ "$": "/path/to/object" }`.
 * This module resolves those references into a plain object graph.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isInstance(value: unknown): value is Record<string, unknown> & { _: string } {
  return isRecord(value) && typeof value._ === "string";
}

export function isReference(value: unknown): value is { $: string } {
  return isRecord(value) && typeof value.$ === "string";
}

/** Returns the serialized class name, if any. */
export function classNameOf(value: unknown): string | null {
  return isInstance(value) ? value._ : null;
}

/**
 * Resolves a JSON-pointer-like path such as `/0/children/1` against a root
 * value. Segments support the `~0` / `~1` escapes of JSON Pointer.
 */
export function resolvePointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith("/")) return undefined;
  let current: unknown = root;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else {
      current = current[segment];
    }
  }
  return current;
}

export interface ResolveOptions {
  /** Guards against pathological or cyclic reference chains. */
  maxDepth?: number;
}

/**
 * Replaces `{ "$": "..." }` references with the object they point at.
 * Broken references are reported as warnings and become inert placeholders.
 */
export function resolveReferences(
  root: unknown,
  warnings: PrgWarning[] = [],
  options: ResolveOptions = {},
): unknown {
  const maxDepth = options.maxDepth ?? 200;
  const active = new WeakSet<object>();
  if (isRecord(root)) active.add(root);

  const walk = (value: unknown, depth: number): unknown => {
    if (depth > maxDepth) {
      pushWarning(warnings, createWarning("invalid-reference", "序列化引用层级过深，已停止解析该分支。"));
      return value;
    }

    if (isReference(value)) {
      const pointer = value.$;
      const target = resolvePointer(root, pointer);
      if (target === undefined) {
        pushWarning(warnings, createWarning("invalid-reference", `引用路径不存在：${pointer}`, pointer));
        return { _: "MissingReference" };
      }
      if (isRecord(target)) {
        if (active.has(target)) {
          pushWarning(warnings, createWarning("invalid-reference", `检测到循环引用：${pointer}`, pointer));
          return { _: "CyclicReference" };
        }
        active.add(target);
        const resolved = walk(target, depth + 1);
        active.delete(target);
        return resolved;
      }
      return target;
    }

    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1));
    }

    if (isRecord(value)) {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        result[key] = walk(value[key], depth + 1);
      }
      return result;
    }

    return value;
  };

  return walk(root, 0);
}
