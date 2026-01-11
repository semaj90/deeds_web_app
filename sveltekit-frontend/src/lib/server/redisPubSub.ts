import { createRedisClientSet, type RedisBasicCommands } from '$lib/server/redis';

export interface PubSubHandlerOptions {
    patterns?: string[]; // pattern-based subscriptions (psubscribe)
    channels?: string[]; // direct channel subscriptions (subscribe)
    onMessage: (info: { pattern?: string; channel: string; message: string }) => void;
    autoStart?: boolean;
}

export interface PubSubController {
    publish(channel: string, message: unknown): Promise<number>;
    subscribe(channels: string[]): Promise<void>;
    psubscribe(patterns: string[]): Promise<void>;
    stop(): Promise<void>; clients: { primary: RedisBasicCommands; subscriber: unknown; publisher: unknown };
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
        publish(channel: string, message: unknown): Promise<number> {
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





