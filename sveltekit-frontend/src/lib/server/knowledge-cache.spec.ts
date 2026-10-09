import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const state = vi.hoisted(() => ({ values: new Map<string, string>(), deleted: [] as string[] }));

vi.mock('$lib/server/redis.js', () => ({
    getRedis: () => ({
        get: async (key: string) => state.values.get(key) ?? null,
        setex: async (key: string, _ttl: number, value: string) => { state.values.set(key, value); },
        del: async (key: string) => { state.deleted.push(key); state.values.delete(key); return 1; },
        pipeline: () => {
            const pipeline = {
                hincrby: () => pipeline,
                expire: () => pipeline,
                exec: async () => [],
            };
            return pipeline;
        },
    }),
}));

import { getCachedEmbedding, setCachedEmbedding } from './knowledge-cache.js';

const valid768 = [1, ...new Array(767).fill(0)];

describe('model-qualified knowledge embedding cache', () => {
    beforeEach(() => {
        state.values.clear();
        state.deleted.length = 0;
    });

    it('does not reuse another model cache entry for EmbeddingGemma', async () => {
        await setCachedEmbedding('same text', 'nomic-embed-text', new Array(384).fill(0.1));

        expect(await getCachedEmbedding('same text', 'embeddinggemma:latest')).toBeNull();
        expect(state.values.size).toBe(1);
    });

    it('evicts a 384-D EmbeddingGemma cache value', async () => {
        const model = 'embeddinggemma:latest';
        const hash = createHash('sha256').update(`${model}:same text`).digest('hex').substring(0, 16);
        const key = `emb:${model}:${hash}`;
        state.values.set(key, JSON.stringify(new Array(384).fill(0.1)));

        expect(await getCachedEmbedding('same text', model)).toBeNull();
        expect(state.values.size).toBe(0);
        expect(state.deleted).toEqual([key]);
    });

    it('accepts canonical 768-D EmbeddingGemma values', async () => {
        await setCachedEmbedding('same text', 'embeddinggemma:latest', valid768);

        expect(await getCachedEmbedding('same text', 'embeddinggemma:latest')).toEqual(valid768);
    });
});
