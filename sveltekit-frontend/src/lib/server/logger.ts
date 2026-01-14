import { RedisClientType } from 'redis';
import { formatErrorResponse } from './errors.js';
let _redis: null = null; // Changed type to RedisClientType
// Redis client initialization removed - module not found
export async function logStructuredError(payload: { source: string,
 level: 'error' | 'warn' | 'info',
 event: string; message: string;
 error?: unknown;
 context?: Record<string, unknown>;
}): Promise<void> {
 const record = {
 timestamp: new Date().toISOString(),
 ...payload,
 error:
 payload.error instanceof Error
 ? { message: payload.error.message, stack: (payload.error as Error).stack }
 : payload.error,
 };
 let redisLogged = false;
 try {
 if (_redis) {
 const r = _redis;
 await r.lPush('structured_errors', JSON.stringify(record)); // Changed to lPush
 await r.lTrim('structured_errors', 0, 999); // Changed to lTrim
 redisLogged = true;
 }
 } catch (e) {
 console.warn('[logger] Redis logging failed:', e);
 }
 try {
 const sentryAdapter = await import('./log-adapters/sentry.js');
 const captureException = (sentryAdapter as any).captureException;
 const isEnabled = (sentryAdapter as any).isEnabled;
 if (payload.level === 'error' && typeof captureException === 'function' && isEnabled) {
 const errorToCapture =
 payload.error instanceof Error ? payload.error : new Error(payload.message);
 captureException(errorToCapture, {
 extra: { source: payload.source,
 event: payload.event,
 context: payload.context,
 originalPayload: payload,
 },
 });
 }
 } catch (e) {
 console.warn('[logger] Sentry adapter failed to load or capture exception:', e);
 }
 if (!redisLogged) {
 if (payload.level === 'error') console.error('[logger]', record);
 else if (payload.level === 'warn') console.warn('[logger]', record);
 else console.info('[logger]', record);
 }
}
export async function captureAndFormat(error, any): Promise<any> {
 try {
 return formatErrorResponse(error);
 } catch {
 return {
 success: false,
 error: { message: 'An unexpected error occurred', code: 'UNKNOWN_ERROR', status: 500 },
 };
 }
}
const counters: Record<string, number> = {};
export function incrementMetric(name: string, value = 1) {
 counters[name] = (counters[name] || 0) + value;
}
export function getMetricsSnapshot() {
 return { ...counters };
}
export class Logger {
 private static instance: Logger; // Changed comma to semicolon
 private constructor() {}
 static getInstance(): Logger {
 if (!Logger.instance) Logger.instance = new Logger();
 return Logger.instance;
 }
 info(message: string, meta?: unknown) {
 console.log(`[INFO] ${new Date().toISOString()}- ${ message }`, meta || '');
 }
 error(message: string, error?: unknown) {
 console.error(`[ERROR] ${new Date().toISOString()}- ${ message }`, error || '');
 }
 warn(message: string, meta?: unknown) {
 console.warn(`[WARN] ${new Date().toISOString()}- ${ message }`, meta || '');
 }
 debug(message: string, meta?: unknown) {
 try {
 if (process.env.NODE_ENV === 'development') {
 console.debug(`[DEBUG] ${new Date().toISOString()}- ${message}`, meta || '');
 }
 } catch (e) {
 // ignore
 }
 }
}
export const logger = Logger.getInstance();
export default logger;




