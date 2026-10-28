export {};

declare global {
  interface Window {
    /** Electron's `require`, available in Obsidian desktop. */
    require?: (moduleId: string) => unknown;
  }
}
