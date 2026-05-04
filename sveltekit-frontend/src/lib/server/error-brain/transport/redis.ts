/**
 * Redis transport for error-brain
 * Publishes error events to Redis pub/sub channel `error-brain:events`
 */

import type { ErrorBrainEvent } from '../events.js';
import type { ErrorBrainTransport } from './interface.js';
import { getRedis } from '$lib/server/redis.js';

const CHANNEL = 'error-brain:events';

export class RedisTransport implements ErrorBrainTransport {
	name = 'redis';

	async publish(evt: ErrorBrainEvent): Promise<void> {
		try {
			const redis = getRedis();
			await redis.publish(CHANNEL, JSON.stringify(evt));
		} catch (err) {
			console.warn(`[error-brain:redis] publish failed for ${evt.type}:`, err);
		}
	}

	async subscribe(handler: (evt: ErrorBrainEvent) => void): Promise<() => void> {
		// Subscriber needs a dedicated connection (ioredis cannot share pub/sub + commands)
		const { default: Redis } = await import('ioredis');
		const sub = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

		await sub.subscribe(CHANNEL);
		sub.on('message', (_ch: string, msg: string) => {
			try { handler(JSON.parse(msg) as ErrorBrainEvent); } catch { /* malformed */ }
		});

		return async () => {
			await sub.unsubscribe(CHANNEL);
			await sub.quit();
		};
	}

	async close(): Promise<void> {
		// publisher uses the shared pool — nothing to close
	}
}
