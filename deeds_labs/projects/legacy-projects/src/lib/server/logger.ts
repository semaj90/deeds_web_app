// Minimal structured logger with optional pino fallback
type LogArgs = Record<string, unknown>;

function format(level: string, msg: string, meta?: LogArgs) {
  const payload = { ts: new Date().toISOString(), level, msg, ...meta };
  try {
    console.log(JSON.stringify(payload));
  } catch (e) {
    console.log(level.toUpperCase(), msg, meta || '');
  }
}

const logger = {
  info: (msg: string, meta?: LogArgs) => format('info', msg, meta),
  warn: (msg: string, meta?: LogArgs) => format('warn', msg, meta),
  error: (msg: string, meta?: LogArgs) => format('error', msg, meta),
  debug: (msg: string, meta?: LogArgs) => format('debug', msg, meta),
};

export default logger;
export { logger };
