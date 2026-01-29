/**
 * Shared Redis Client (ioredis)
 * Centralizes configuration, error handling, and connection management.
 */
import { env } from '$env/dynamic/private';
import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';

export type RedisClientOptions = RedisOptions & {
	url?: string;
	password?: string;
};

export interface RedisResolvedConfig {
	url: string;
	password?: string;
	finalPassword?: string;
}

function injectPassword(url: string, password?: string): string {
	if (!password) return url;
	try {
		const u = new URL(url);
		u.password = password;
		return u.toString();
	} catch {
		if (url.startsWith('redis://')) {
			return `redis://:${encodeURIComponent(password)}@${url.slice('redis://'.length)}`;
		}
		return url;
	}
}

export function resolveRedisConfig(overrides?: RedisClientOptions): RedisResolvedConfig {
	const envUrl = env.REDIS_URL || process.env.REDIS_URL;
	const envPassword = env.REDIS_PASSWORD || process.env.REDIS_PASSWORD;
	const url = overrides?.url ?? envUrl ?? 'redis://localhost:6379';
	const password = overrides?.password ?? envPassword ?? undefined;
	const finalPassword = password && password !== 'redis' ? password : undefined;

	return {
		url: finalPassword ? injectPassword(url, finalPassword) : url,
		password: finalPassword
	};
}

function buildRedisOptions(overrides?: RedisClientOptions): [string, RedisOptions] {
	const { url, password } = resolveRedisConfig(overrides);
	const rest = overrides
		? Object.fromEntries(
				Object.entries(overrides).filter(([key]) => key !== 'url' && key !== 'password')
		  )
		: {};

	const baseOptions: RedisOptions = {
		lazyConnect: true,
		maxRetriesPerRequest: 3,
		enableReadyCheck: true,
		retryStrategy: (times: number) => Math.min(times * 250, 4000),
		reconnectOnError: (err) => {
			const msg = err instanceof Error ? err.message : String(err ?? '');
			return msg.includes('READONLY') || msg.includes('ECONNRESET');
		},
		password,
		...rest
	};
	return [url, baseOptions];
}
// Local runtime-friendly shape for the client so we avoid casting to `any`
type RedisLike = Redis & {
	options?: Partial<RedisOptions & { path?: string }>;
	status?: string;
	connect?: () => Promise<void>;
	quit?: () => Promise<void>;
	disconnect?: () => void;
	on?: (event: string, listener: (...args: unknown[]) => void) => void;
	off?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export function createRedisClient(options?: RedisClientOptions): Redis {
 const [url, redisOptions] = buildRedisOptions(options);
 // ioredis v4 typically takes url as first arg if provided, otherwise host/port in options
 return new Redis(url, redisOptions);
}

const globalForRedis = globalThis as unknown as { sharedRedis?: Redis };

// Create or reuse a single shared Redis instance and ensure it's connected
export const redis: Redis = globalForRedis.sharedRedis ?? createRedisClient();
globalForRedis.sharedRedis = redis;

// Attach events once
const redisLike = redis as RedisLike;
redisLike.on?.('connect', () => {
 const host = redisLike.options?.host ?? redisLike.options?.path ?? 'redis';
 console.log(`[redis] connected to ${host}`);
});

redisLike.on?.('error', (err: unknown) => {
 const message = err instanceof Error ? err.message : String(err);
 if (message.includes('NOAUTH')) {
 console.warn(
 '[redis] authentication required. Supply REDIS_URL with credentials or REDIS_PASSWORD.'
 );
 return;
 }
 console.error('[redis] error', message);
});

redisLike.on?.('end', () => {
 console.warn('[redis] connection ended. awaiting reconnect');
});

function waitForEvent(obj: RedisLike, event: string, timeoutMs = 5000): Promise<void> {
 return new Promise<void>((resolve, reject) => {
 let settled = false;
 const onEvent = () => {
 if (settled) return;
 settled = true;
 cleanup();
 resolve();
 };
 const onError = (err: unknown) => {
 if (settled) return;
 settled = true;
 cleanup();
 reject(err instanceof Error ? err : new Error(String(err)));
 };
 const to = setTimeout(() => {
 if (settled) return;
 settled = true;
 cleanup();
 reject(new Error('timeout waiting for redis event, ' + event));
 }, timeoutMs);

 function cleanup() {
 clearTimeout(to);
 // prefer off/removeListener if available
 try {
 (obj as RedisLike).off?.(event, onEvent);
 (obj as RedisLike).off?.('error', onError);
 } catch {
 // ignore cleanup errors
 }
 }

 (obj as RedisLike).on?.(event, onEvent);
 (obj as RedisLike).on?.('error', onError);
 });
}

export async function ensureRedisReady(timeoutMs = 5000): Promise<void> {
 try {
 const status = redisLike.status;
 if (status === 'ready') return;

 // If it's currently connecting, just wait for ready (avoids calling connect twice)
 if (status === 'connecting' || status === 'connect' || status === 'reconnecting') {
 try {
 await waitForEvent(redisLike, 'ready', timeoutMs);
 return;
 } catch (err) {
 // If waiting failed, fall through to attempt connect (or log)
 console.warn(
 '[redis] waiting for ready failed: ',
 err instanceof Error ? err.message : String(err)
 );
 }
 }

 // If disconnected/end, attempt to connect (connect may throw if another actor calls it simultaneously)
 if (typeof redisLike.connect === 'function') {
 try {
 await redisLike.connect();
 // ensure ready (some servers may still require auth and emit NOAUTH)
 if (redisLike.status !== 'ready') {
 await waitForEvent(redisLike, 'ready', timeoutMs);
 }
 return;
 } catch (err: unknown) {
 const msg = err instanceof Error ? err.message : String(err);
 // Common benign race: "Redis is already connecting/connected"
 if (msg.includes('already connecting') || msg.includes('already connected')) {
 try {
 await waitForEvent(redisLike, 'ready', timeoutMs);
 return;
 } catch {
 // fallthrough to logging
 }
 }
 // Authentication issue: log clear actionable guidance
 if (msg.includes('NOAUTH') || msg.includes('NOAUTH Authentication required')) {
 console.warn(
 '[redis] NOAUTH received. Ensure REDIS_URL or REDIS_PASSWORD is set (e.g. redis://password@redis:6379) and restart the dev server.'
 );
 return;
 }
 console.error('[redis] connect failed', msg);
 }
 }
 } catch (err: unknown) {
 console.error(
 '[redis] ensure ready failed (unexpected)',
 err instanceof Error ? err.message : String(err)
 );
 }
}

export async function shutdownRedis(): Promise<void> {
 try {
 if (redisLike.status === 'end') return;
 if (typeof redisLike.quit === 'function') {
 await redisLike.quit();
 }
 } catch (err: unknown) {
 console.warn(
 '[redis] graceful shutdown failed, forcing disconnect',
 err instanceof Error ? err.message : String(err)
 );
 if (typeof redisLike.disconnect === 'function') {
 redisLike.disconnect();
 }
 }
}

export default redis;



