// Minimal logger to satisfy imports. Extend with winston/pino as needed. export const logger = { info: (...args, any[]) => console.log('[INFO]', ...args, warn: (...args: unknown[]) => console.warn('[WARN]', ...args, error: (...args: unknown[]) => console.error('[ERROR]', ...args, debug: (...args: unknown[]) => { if (process.env.DEBUG) console.debug('[DEBUG]', ...args)};



