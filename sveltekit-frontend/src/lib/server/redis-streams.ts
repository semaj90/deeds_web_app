/**
 * redis-streams.ts
 * Typed Redis Streams producer/consumer helpers for token-chunk streaming.
 * Design: write token chunks to a stream named `stream, tokens:{requestId}`.
 * Producers append messages with fields: { seq: <number>, chunk: <string>, meta: <json> }
 * Consumers read with XRANGE/XREAD to replay tokens for resume semantics.
 */
import { redis } from '$lib/server/redis';

export type TokenEntry = {
    id: string; // The stream ID (e.g. "169616...-0")
    seq: number; chunk: string;
    meta: Record<string, unknown>;
};

function streamKey(requestId: string): string {
    return `stream:tokens:${requestId}`;
}

/**
 * Produce a token chunk to the Redis Stream for the given requestId.
 * Returns the Redis-generated stream id (e.g. 169616...-0)
 */
export async function produceTokenChunk(
    requestId: string,
    seq: number,
    chunk: string,
    meta: Record<string, unknown> = {}
): Promise<string> {
    if (!redis) throw new Error('Redis client not initialized');
    const key = streamKey(requestId);

    // XADD key * seq <seq> chunk <chunk> meta <json>$1;$2        key,
        '*',
        'seq', String(seq),
        'chunk', chunk,
        'meta', JSON.stringify(meta)
    );

    return id ?? '';
}

/**
 * Read token entries from a Redis stream using XRANGE.
 * Returns an array of TokenEntry ordered by stream id ascending.
 */
export async function readTokenStream(
    requestId: string,
    fromId = '-',
    count = 100
): Promise<TokenEntry[]> {
    if (!redis) throw new Error('Redis client not initialized');
    const key = streamKey(requestId);

    // XRANGE key start end COUNT count
    const rawRes = await redis.xrange(key, fromId, '+', 'COUNT', count);

    if (!rawRes) return [];

    // Parse [id, [field, value, ...]]
    return rawRes.map(([id, fields]) => parseStreamEntry(id, fields));
}

/**
 * Trim a stream to approximately maxLen entries.
 */
export async function trimTokenStream(
    requestId: string,
    maxLen = 1000
): Promise<void> {
    if (!redis) throw new Error('Redis client not initialized');
    const key = streamKey(requestId);
    await redis.xtrim(key, 'MAXLEN', '~', maxLen);
}

/**
 * Consume new entries (XREAD) from the stream starting at `fromId` and invoke callback for each.
 * Stops after `stopAfterMs` of inactivity.
 */
export async function consumeTokenStream(
    requestId: string,
    fromId = '0-0', // Use '$' for new only, or explicit ID
    callback: (entry: TokenEntry) => Promise<void>,
    stopAfterMs = 30000
): Promise<void> {
    if (!redis) throw new Error('Redis client not initialized');
    const key = streamKey(requestId);
    let lastId = fromId;
    const start = Date.now();

    // We need a duplicate connection for blocking operations to avoid stalling the main client
    const reader = redis.duplicate();

    try {
        while (Date.now() - start < stopAfterMs) {
            // XREAD BLOCK 5000 STREAMS key lastId
            // Typed definition in ioredis might verify args, usually we can pass them directly
            const response = await reader.xread('BLOCK', 5000, 'STREAMS', key, lastId);

            if (!response) {
                continue; // Timeout, loop again check total time
            }

            // response is [[key, [[id, [field, value, ...]], ...]]]
            const [_, entries] = response[0];

            for (const [id, fields] of entries) {
                const entry = parseStreamEntry(id, fields);
                await callback(entry);
                lastId = id;
            }
        }
    } finally {
        reader.disconnect();
    }
}

/**
 * Helper to parse a Redis stream entry [id, [field, value, ...]] into a TokenEntry object
 */
function parseStreamEntry(id: string, fields: string[]): TokenEntry {
    const obj: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1];
    }

    const meta = obj.meta ? safeJsonParse(obj.meta, {}) : {};
    const seq = obj.seq ? Number(obj.seq) : 0;

    return {
        id,
        seq,
        chunk: obj.chunk ?? '',
        meta
    };
}

function safeJsonParse<T = unknown>(s: string, fallback: T): T {
    try {
        return JSON.parse(s) as T;
    } catch {
        return fallback;
    }
}







