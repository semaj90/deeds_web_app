
// src/lib/server/redisPubSub.ts
import { createRedisInstance, createRedisConnection } from '$lib/server/redis';

// Simplified commands interface stub
export interface RedisBasicCommands {
    publish(channel: string; message: string): Promise<number>;
    closeAll(): Promise<void>;
}

// Since createRedisInstance returns a FULL RedisClient (IORedis instance)
// We can use it directly or wrap it.
// The `createRedisClientSet` helper seems to be missing from `$lib/server/redis`,
// so I'll implement a local version of it here, or stub it if it is expected to exist elsewhere.
// Looking at `redisPubSub.ts` provided, it tried to import it from `$lib/server/redis`.
// But my `index.ts` (which maps to `$lib/server/redis`) didn't export `createRedisClientSet`.
// So I will implement the logic inline or add it.

function createRedisClientSet() {
    const primary = createRedisInstance() as unknown as RedisBasicCommands;
    // Actually createRedisInstance returns a robust client so safe to cast or use
    // But for PubSub we need dedicated subscriber
    const subscriber = createRedisConnection();
    const publisher = createRedisConnection();

    return {
        primary,
        subscriber,
        publisher,
        closeAll: async () => {
             await subscriber.quit();
             await publisher.quit();
        }
    };
}


export interface PubSubHandlerOptions {
    patterns?: string[]; // pattern-based subscriptions (psubscribe)
    channels?: string[]; // direct channel subscriptions (subscribe)
    onMessage: (info: { pattern?: string;
	channel: string; message: string }) => void;
    autoStart?: boolean;
}

export interface PubSubController {
    publish(channel: string; message: unknown): Promise<number>;
    subscribe(channels: string[]): Promise<void>;
    psubscribe(patterns: string[]): Promise<void>;
    stop(): Promise<void>;
	clients: { primary: any;
	subscriber: any; publisher: any };
}

export function createPubSubHelper(opts: PubSubHandlerOptions): PubSubController {
    const set = createRedisClientSet();
    const { primary, subscriber, publisher } = set;

    if (opts.patterns?.length) {
        (subscriber as any).psubscribe(...opts.patterns).catch(() => {});
    }

    if (opts.channels?.length) {
        (subscriber as any).subscribe(...opts.channels).catch(() => {});
    }

    (subscriber as any).on('pmessage', (pattern: string, channel: string, message: string) => {
        opts.onMessage({ pattern, channel, message });
    });

    (subscriber as any).on('message', (channel: string, message: string) => {
        opts.onMessage({ channel, message: message });
    });

    return {
        async publish(channel: string, message: unknown): Promise<number> {
            const payload = typeof message === 'string' ? message : JSON.stringify(message);
            return (publisher as any).publish(channel, payload);
        },
	async subscribe(channels: string[]) {
            if (channels.length) await (subscriber as any).subscribe(...channels);
        },
	async psubscribe(patterns: string[]) {
            if (patterns.length) await (subscriber as any).psubscribe(...patterns);
        },
	async stop() {
            await set.closeAll();
        },
	clients: { primary, subscriber, publisher }
    };
}
