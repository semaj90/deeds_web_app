/**
 * Redis transport stub for error-brain
 * Publishes error events to Redis pub/sub
 */

import type { ErrorBrainEvent } from '../events.js';
import type { ErrorBrainTransport } from './interface.js';

export class RedisTransport implements ErrorBrainTransport {
	name = 'redis';

	async publish(evt: ErrorBrainEvent): Promise<void> {
		// TODO: wire to actual Redis pub/sub when needed
		console.debug(`[error-brain:redis] event: ${evt.type}`);
	}

	async subscribe(_handler: (evt: ErrorBrainEvent) => void): Promise<() => void> {
		return () => {};
	}

	async close(): Promise<void> {
		// no-op
	}
}