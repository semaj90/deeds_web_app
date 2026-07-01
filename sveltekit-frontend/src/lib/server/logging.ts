/**
 * src/lib/server/logging.ts
 *
 * Centralized logging utility for server-side operations.
 * Provides debug, info, warn, and error levels with optional timestamps.
 */

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown): void;
}

function formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level}] ${message}${contextStr}`;
}

export const log: Logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (process.env.DEBUG) {
      console.debug(formatMessage('DEBUG', message, context));
    }
  },

  info(message: string, context?: Record<string, unknown>) {
    console.info(formatMessage('INFO', message, context));
  },

  warn(message: string, context?: Record<string, unknown>) {
    console.warn(formatMessage('WARN', message, context));
  },

  error(message: string, error?: Error | unknown) {
    const errorStr = error instanceof Error
      ? `${error.message}\n${error.stack}`
      : String(error);
    console.error(formatMessage('ERROR', message));
    if (errorStr) console.error(errorStr);
  }
};
