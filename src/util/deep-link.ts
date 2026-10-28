/** Builds `prg://` deep links understood by the Project Graph application. */

export interface PrgLinkTarget {
  /** Absolute path of the `.prg` file. */
  path: string;
  /** Optional node uuid to focus. */
  target?: string;
  /** Optional camera centre, in world coordinates. */
  location?: { x: number; y: number };
  zoom?: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * `prg:///C:/path/to/file.prg?target=<uuid>&location=1,2&zoom=1.5`
 *
 * The reference implementation accepts the `prg:///` form for absolute paths
 * on every platform; backslashes are normalised because Windows paths are what
 * the vault produces.
 */
export function buildPrgUri(link: PrgLinkTarget): string {
  const normalized = link.path.replaceAll("\\", "/");
  const stripped = normalized.replace(/^\/+/, "");
  const encodedPath = encodeURI(stripped).replaceAll("#", "%23").replaceAll("?", "%3F");
  const query: string[] = [];

  if (link.target) query.push(`target=${encodeURIComponent(link.target)}`);
  if (link.location) {
    query.push(`location=${round(link.location.x)},${round(link.location.y)}`);
  }
  if (typeof link.zoom === "number" && Number.isFinite(link.zoom)) {
    query.push(`zoom=${round(link.zoom)}`);
  }

  const suffix = query.length > 0 ? `?${query.join("&")}` : "";
  return `prg:///${encodedPath}${suffix}`;
}
