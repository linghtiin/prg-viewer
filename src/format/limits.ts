/**
 * Safety limits for the ZIP container, mirroring the recommendations of the
 * PRG specification (§6, "Security Considerations").
 */
export interface ZipLimits {
  /** Maximum number of entries inside the ZIP archive. */
  maxEntries: number;
  /** Maximum total uncompressed size of all entries. */
  maxTotalBytes: number;
  /** Maximum uncompressed size of a single entry. */
  maxEntryBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 1000,
  maxTotalBytes: 500 * 1024 * 1024,
  maxEntryBytes: 200 * 1024 * 1024,
};
