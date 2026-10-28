export interface Logger {
  debug(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
}

/** Small logger so debug output is opt-in via settings. */
export function createLogger(prefix: string, isDebugEnabled: () => boolean): Logger {
  return {
    debug: (message, ...details) => {
      if (isDebugEnabled()) console.debug(`[${prefix}] ${message}`, ...details);
    },
    warn: (message, ...details) => console.warn(`[${prefix}] ${message}`, ...details),
    error: (message, ...details) => console.error(`[${prefix}] ${message}`, ...details),
  };
}
