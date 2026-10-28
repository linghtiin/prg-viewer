import { DEFAULT_IMAGE_CACHE_MB } from "../constants.ts";

interface CacheEntry {
  state: "loading" | "ready" | "failed";
  bitmap: ImageBitmap | null;
  bytes: number;
}

/**
 * Decodes attachment blobs into `ImageBitmap`s with a byte-budgeted LRU.
 * Bitmaps are closed on eviction so long sessions do not leak memory.
 */
export class ImageCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;
  private disposed = false;

  constructor(private readonly maxBytes: number = DEFAULT_IMAGE_CACHE_MB * 1024 * 1024) {}

  get(key: string): ImageBitmap | null {
    const entry = this.entries.get(key);
    if (!entry || entry.state !== "ready") return null;
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.bitmap;
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Starts decoding `key` if it was never requested. `onReady` fires once the
   * bitmap is available (or immediately if `createImageBitmap` is missing).
   */
  request(key: string, createBlob: () => Blob | null, onReady: () => void): void {
    if (this.disposed || key.length === 0 || this.entries.has(key)) return;
    if (typeof createImageBitmap !== "function") return;

    const blob = createBlob();
    if (!blob) return;

    const entry: CacheEntry = { state: "loading", bitmap: null, bytes: blob.size };
    this.entries.set(key, entry);
    this.totalBytes += blob.size;

    createImageBitmap(blob)
      .then((bitmap) => {
        if (this.disposed) {
          bitmap.close();
          return;
        }
        entry.bitmap = bitmap;
        entry.state = "ready";
        this.evict();
        onReady();
      })
      .catch(() => {
        entry.state = "failed";
      });
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.bitmap?.close();
    }
    this.entries.clear();
    this.totalBytes = 0;
  }

  private evict(): void {
    if (this.totalBytes <= this.maxBytes) return;
    for (const [key, entry] of this.entries) {
      if (this.totalBytes <= this.maxBytes) break;
      if (entry.state === "loading") continue;
      entry.bitmap?.close();
      this.totalBytes -= entry.bytes;
      this.entries.delete(key);
    }
  }
}
