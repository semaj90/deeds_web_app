import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const state = vi.hoisted(() => ({
  buffers: new Map<string, Buffer>(),
  strings: new Map<string, string>(),
  writes: [] as string[],
  deletes: [] as string[],
  reads: [] as string[],
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    getBuffer: async (key: string) => {
      state.reads.push(key);
      return state.buffers.get(key) ?? null;
    },
    get: async (key: string) => {
      state.reads.push(key);
      return state.strings.get(key) ?? null;
    },
    setex: async (key: string) => {
      state.writes.push(key);
    },
    del: async (...keys: string[]) => {
      state.deletes.push(...keys);
      return keys.length;
    },
    pipeline: () => {
      const keys: string[] = [];
      return {
        getBuffer(key: string) {
          keys.push(key);
          return this;
        },
        setex(key: string) {
          state.writes.push(key);
          return this;
        },
        exec: async () => keys.map((key) => [null, state.buffers.get(key) ?? null]),
      };
    },
    keys: async () => [],
  }),
}));

import {
  batchGetCachedEmbeddings,
  cacheEmbedding,
  getEmbedding,
  hashTextSha256,
} from './embedding-cache-unified.js';

const cacheKey = (text: string, model = 'embeddinggemma:latest') =>
  `embed:v2:${model}:${hashTextSha256(text)}`;
const vectorBuffer = (values: number[]) => Buffer.from(new Float32Array(values).buffer);

describe('unified semantic embedding cache admission', () => {
  beforeEach(() => {
    state.buffers.clear();
    state.strings.clear();
    state.writes.length = 0;
    state.deletes.length = 0;
    state.reads.length = 0;
  });

  it('returns a finite 768-D model-qualified binary entry', async () => {
    const vector = new Array(768).fill(0.25);
    state.buffers.set(cacheKey('query'), vectorBuffer(vector));

    const result = await getEmbedding('query');

    expect(result).toHaveLength(768);
    expect(Array.from(result ?? [])).toEqual(vector);
  });

  it('rejects a 384-D model-qualified binary entry', async () => {
    state.buffers.set(cacheKey('query'), vectorBuffer(new Array(384).fill(0.25)));

    await expect(getEmbedding('query')).resolves.toBeNull();
  });

  it('does not read, migrate, or delete unqualified legacy text-only keys', async () => {
    const legacyHash = createHash('md5').update('query').digest('hex');
    const legacyKey = `embeddings:${legacyHash}`;
    state.strings.set(legacyKey, JSON.stringify(new Array(768).fill(0.25)));

    await expect(getEmbedding('query')).resolves.toBeNull();

    expect(state.reads).toEqual([cacheKey('query')]);
    expect(state.writes).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it('rejects a malformed batch entry instead of returning a 384-D vector', async () => {
    state.buffers.set(cacheKey('query'), vectorBuffer(new Array(384).fill(0.25)));

    const [result] = await batchGetCachedEmbeddings(['query']);

    expect(result).toBeNull();
  });

  it('refuses to write malformed or non-finite vectors', async () => {
    await expect(cacheEmbedding('short', new Float32Array(384))).rejects.toThrow(
      'SEMANTIC_768_CACHE_INVALID_DIMENSIONS:384',
    );
    await expect(cacheEmbedding('nan', new Float32Array([Number.NaN, ...new Array(767).fill(0)]))).rejects.toThrow(
      'SEMANTIC_768_CACHE_NON_FINITE_VALUE',
    );

    expect(state.writes).toEqual([]);
  });
});
