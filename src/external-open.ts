import { type App, FileSystemAdapter, type TFile, Platform } from "obsidian";
import { buildPrgUri } from "./util/deep-link.ts";

export interface LinkExtras {
  target?: string;
  location?: { x: number; y: number };
  zoom?: number;
}

/** Absolute on-disk path of a vault file, or null on mobile / non-FS adapters. */
export function absolutePathOf(app: App, file: TFile): string | null {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return null;
  const base = adapter.getBasePath().replaceAll("\\", "/").replace(/\/+$/, "");
  const relative = file.path.replaceAll("\\", "/").replace(/^\/+/, "");
  return base.length > 0 ? `${base}/${relative}` : `/${relative}`;
}

/** Builds a `prg://` URI for a vault file, or null when unsupported. */
export function buildFileUri(app: App, file: TFile, extras: LinkExtras = {}): string | null {
  const path = absolutePathOf(app, file);
  if (!path) return null;
  return buildPrgUri({
    path,
    target: extras.target,
    location: extras.location,
    zoom: extras.zoom,
  });
}

function platformCommand(uri: string): [string, string[]] {
  if (Platform.isWin) return ["rundll32", ["url.dll,FileProtocolHandler", uri]];
  if (Platform.isMacOS) return ["open", [uri]];
  return ["xdg-open", [uri]];
}

interface ChildProcessModule {
  execFile(
    file: string,
    args: string[],
    options: { windowsHide?: boolean },
    callback: (error: Error | null) => void,
  ): void;
}

/**
 * Opens a URI with the OS handler. Obsidian's `window.open` is a fallback only:
 * it cannot report whether an unknown protocol was actually handled, so the
 * desktop path uses the shell directly.
 */
export async function openExternalUri(uri: string): Promise<boolean> {
  if (Platform.isDesktopApp) {
    const nodeRequire = window.require;
    if (typeof nodeRequire === "function") {
      try {
        const childProcess = nodeRequire("child_process") as ChildProcessModule;
        const [command, args] = platformCommand(uri);
        await new Promise<void>((resolve, reject) => {
          childProcess.execFile(command, args, { windowsHide: true }, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
        return true;
      } catch {
        // fall through to window.open
      }
    }
  }
  try {
    window.open(uri, "_blank");
    return true;
  } catch {
    return false;
  }
}
