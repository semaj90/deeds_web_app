/**
 * lib/server/error-brain/transport/redis.ts
 *
 * PHASE 36: Redis transport (pub/sub + stream)
 */

import type { ErrorBrainEvent } from '../events.js';
import type { ErrorBrainTransport } from './interface.js';

/**
 * Redis transport implementation
 *
 * Channel: error-brain:<env>:events
 * Payload: JSON string of ErrorBrainEvent
 * Optional: XADD to stream for replay/debugging
 */
export class RedisTransport implements ErrorBrainTransport {
    name = 'redis';
    private redis: any = null; // Type from redis service
    private subscriber: any = null;
    private channel: string;
    private streamKey: string;

    constructor(redisClient?: any) {
        const env = process.env?.NODE_ENV ?? 'development';
        this.channel = `error-brain:${env}:events`;
        this.streamKey = `error-brain:${env}:stream`;

        // Use provided client or attempt to get from service
        if (redisClient) {
            this.redis = redisClient;
        }
    }

    /**
     * Initialize connection (call once)
     */
    async init(): Promise<void> {
        if (this.redis) return;

        try {
            // Dynamically import redis service
            // @ts-ignore
            const { getRedisService } = await import('$lib/services/redis-service');
            const service = getRedisService();
            this.redis = service;
            // Assuming the service provides a client that can be duplicated for subscription
            // Re-using same client for subscribing isn't usually recommended in node-redis, but typical wrappers might handle valid connections
            // Ideally we get a dedicated subscriber client
            this.subscriber = service.duplicate ? service.duplicate() : service;

            if (!this.redis) {
                console.warn('Redis client not available, transport disabled');
            }
        } catch (error) {
            console.warn(`Failed to load Redis service: ${error}`);
        }
    }

    async publish(evt: ErrorBrainEvent): Promise<void> {
        await this.init();

        if (!this.redis || typeof this.redis.publish !== 'function') {
            return; // Silent fail if Redis unavailable
        }

        try {
            const payload = JSON.stringify(evt);

            // Publish to channel
            await this.redis.publish(this.channel, payload);

            // Also add to stream (for replay/debugging)
            if (typeof this.redis.xadd === 'function') {
                await this.redis.xadd(
                    this.streamKey,
                    '*', // Auto-generate ID
                    'event',
                    payload,
                    'MAXLEN',
                    '~',
                    '1000' // Keep last 1000 events
                );
            }
        } catch (error) {
            console.error(`Redis publish error: ${error}`);
        }
    }

    async subscribe(handler: (evt: ErrorBrainEvent) => void): Promise<(() => void)> {
        await this.init();

        if (!this.subscriber || typeof this.subscriber.subscribe !== 'function') {
            throw new Error('Redis subscriber not available');
        }

        // Subscribe to channel
        await this.subscriber.subscribe(this.channel);

        // Setup message handler
        const messageHandler = (message: string, channel: string) => {
             // Verify channel match if needed, though subscribe filters usually
             if (channel !== this.channel) return;

             try {
                const evt = JSON.parse(message) as ErrorBrainEvent;
                handler(evt);
             } catch (error) {
                console.error(`Failed to parse event: ${error}`);
             }
        };

        if (typeof this.subscriber.on === 'function') {
            this.subscriber.on('message', messageHandler);
        }

        // Return unsubscribe function
        return async () => {
             if (this.subscriber && typeof this.subscriber.unsubscribe === 'function') {
                 await this.subscriber.unsubscribe(this.channel);
             }
             if (this.subscriber && typeof this.subscriber.off === 'function') {
                 this.subscriber.off('message', messageHandler);
             }
        };
    }

    async close(): Promise<void> {
        if (this.subscriber && typeof this.subscriber.quit === 'function') {
            await this.subscriber.quit();
        }
    }
}
