/**
 * Redis Pub/Sub Helper
 *
 * Creates dedicated Redis connections for publish/subscribe operations.
 * Subscriber connections MUST be dedicated because SUBSCRIBE blocks the connection.
 *
 * Architecture:
 *   - Primary: General-purpose connection from pool
 *   - Subscriber: Dedicated connection via duplicate() — blocked by SUBSCRIBE
 *   - Publisher: Dedicated connection via duplicate() — fast non-blocking publishes
 */
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PubSubHandlerOptions {
	/** Pattern-based subscriptions (psubscribe) */
	patterns?: string[];
	/** Direct channel subscriptions (subscribe) */
	channels?: string[];
	/** Message handler callback */
	onMessage: (info: { pattern?: string; channel: string; message: string }) => void;
	/** Auto-start subscriptions on creation */
	autoStart?: boolean;
}

export interface PubSubController {
	/** Publish a message to a channel */
	publish(channel: string, message: unknown): Promise<number>;
	/** Subscribe to additional channels */
	subscribe(channels: string[]): Promise<void>;
	/** Subscribe to additional patterns */
	psubscribe(patterns: string[]): Promise<void>;
	/** Unsubscribe from channels */
	unsubscribe(channels: string[]): Promise<void>;
	/** Stop all subscriptions and close connections */
	stop(): Promise<void>;
	/** Access underlying Redis clients (for advanced use) */
	clients: {
		primary: Redis;
		subscriber: Redis;
		publisher: Redis;
	};
}

// ── Client Set Factory ─────────────────────────────────────────────────────

/**
 * Create a set of Redis connections for pub/sub operations
 *
 * Uses .duplicate() to create dedicated connections that won't interfere
 * with the main connection pool or each other.
 */
function createRedisClientSet() {
	// Get a base connection from the pool
	const base = getRedis();

	// Create dedicated connections for pub/sub
	// These are separate TCP connections, not pool-shared
	const subscriber = base.duplicate();
	const publisher = base.duplicate();

	return {
		primary: base,
		subscriber,
		publisher,
		closeAll: async () => {
			try {
				// Disconnect dedicated connections
				await subscriber.quit();
				await publisher.quit();
				// Note: primary is from pool, don't close it
			} catch (err) {
				console.error('[PubSub] Failed to close connections:', err);
			}
		}
	};
}

// ── Pub/Sub Helper ─────────────────────────────────────────────────────────

/**
 * Create a pub/sub controller with automatic subscription management
 *
 * Example:
 * ```ts
 * const pubsub = createPubSubHelper({
 *   channels: ['notifications'],
 *   patterns: ['user:*'],
 *   onMessage: ({ channel, message }) => {
 *     console.log(`[${channel}] ${message}`);
 *   }
 * });
 *
 * await pubsub.publish('notifications', { type: 'info', text: 'Hello' });
 * await pubsub.stop();
 * ```
 */
export function createPubSubHelper(opts: PubSubHandlerOptions): PubSubController {
	const set = createRedisClientSet();
	const { primary, subscriber, publisher } = set;

	// Set up message handlers before subscribing
	subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
		opts.onMessage({ pattern, channel, message });
	});

	subscriber.on('message', (channel: string, message: string) => {
		opts.onMessage({ channel, message });
	});

	// Handle subscription errors
	subscriber.on('error', (err) => {
		console.error('[PubSub] Subscriber error:', err);
	});

	publisher.on('error', (err) => {
		console.error('[PubSub] Publisher error:', err);
	});

	// Auto-subscribe if requested
	if (opts.autoStart !== false) {
		if (opts.patterns?.length) {
			subscriber.psubscribe(...opts.patterns).catch((err) => {
				console.error('[PubSub] Failed to psubscribe:', err);
			});
		}

		if (opts.channels?.length) {
			subscriber.subscribe(...opts.channels).catch((err) => {
				console.error('[PubSub] Failed to subscribe:', err);
			});
		}
	}

	return {
		async publish(channel: string, message: unknown): Promise<number> {
			const payload = typeof message === 'string' ? message : JSON.stringify(message);
			return await publisher.publish(channel, payload);
		},

		async subscribe(channels: string[]): Promise<void> {
			if (channels.length > 0) {
				await subscriber.subscribe(...channels);
			}
		},

		async psubscribe(patterns: string[]): Promise<void> {
			if (patterns.length > 0) {
				await subscriber.psubscribe(...patterns);
			}
		},

		async unsubscribe(channels: string[]): Promise<void> {
			if (channels.length > 0) {
				await subscriber.unsubscribe(...channels);
			}
		},

		async stop(): Promise<void> {
			// Unsubscribe from all before closing
			try {
				await subscriber.unsubscribe();
				await subscriber.punsubscribe();
			} catch (err) {
				console.error('[PubSub] Error during unsubscribe:', err);
			}
			await set.closeAll();
		},

		clients: { primary, subscriber, publisher }
	};
}
