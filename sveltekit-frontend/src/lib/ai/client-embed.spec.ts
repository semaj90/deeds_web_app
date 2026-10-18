// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
	getEmbedding: vi.fn(async (_key: string): Promise<number[] | null> => null),
	putEmbedding: vi.fn(async (_key: string, _vector: number[]): Promise<void> => undefined)
}));
vi.mock('./client-cache.js', () => ({ clientCache: cache }));

import { embedText, isEmbeddingModelReady, preloadEmbeddingModel } from './client-embed.js';

const vec = (n = 768, v = 0.01) => Array.from({ length: n }, () => v);
const okResponse = (embedding: unknown) =>
	new Response(JSON.stringify({ embedding, model: 'embeddinggemma:latest', dimensions: 768 }), { status: 200 });

describe('client-embed (server-backed)', () => {
	beforeEach(() => {
		cache.getEmbedding.mockReset().mockResolvedValue(null);
		cache.putEmbedding.mockReset().mockResolvedValue(undefined);
		vi.restoreAllMocks();
	});

	it('requests the canonical route with the embeddinggemma model and returns a 768 Float32Array', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(vec()));
		const out = await embedText('how are packets validated');
		expect(out).toBeInstanceOf(Float32Array);
		expect(out.length).toBe(768);
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(url).toBe('/api/embed');
		expect(JSON.parse(String((init as RequestInit).body))).toEqual({ text: 'how are packets validated', model: 'embeddinggemma' });
	});

	it('reads and writes only the versioned cache key, so entries from the old ONNX path are never served', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(vec()));
		await embedText('same text');
		expect(cache.getEmbedding).toHaveBeenCalledWith('server-embed-v1::same text');
		expect(cache.getEmbedding).not.toHaveBeenCalledWith('same text');
		expect(cache.putEmbedding).toHaveBeenCalledWith('server-embed-v1::same text', expect.any(Array));
	});

	it('serves a versioned cache hit without calling the server', async () => {
		cache.getEmbedding.mockResolvedValue(vec(768, 0.5));
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const out = await embedText('cached');
		expect(out.length).toBe(768);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('ignores a cached vector of the wrong length and refetches', async () => {
		cache.getEmbedding.mockResolvedValue(vec(384));
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(vec()));
		const out = await embedText('stale 384');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(out.length).toBe(768);
	});

	it.each([
		['server error', () => new Response('nope', { status: 500 }), 'CLIENT_EMBED_SERVER_500'],
		['wrong dimension', () => okResponse(vec(384)), 'CLIENT_EMBED_INVALID_VECTOR'],
		['non-finite value', () => okResponse([...vec(767), Number.NaN].map((v) => (Number.isNaN(v) ? null : v))), 'CLIENT_EMBED_INVALID_VECTOR'],
		['missing embedding', () => new Response(JSON.stringify({}), { status: 200 }), 'CLIENT_EMBED_INVALID_VECTOR']
	])('fails closed on %s and caches nothing', async (_name, makeResponse, code) => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse());
		await expect(embedText('x')).rejects.toThrow(code);
		expect(cache.putEmbedding).not.toHaveBeenCalled();
	});

	it('rejects empty text before any network call', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await expect(embedText('   ')).rejects.toThrow('CLIENT_EMBED_EMPTY_TEXT');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('keeps the readiness/preload API without loading any local model', async () => {
		expect(typeof isEmbeddingModelReady()).toBe('boolean');
		await expect(preloadEmbeddingModel()).resolves.toBeUndefined();
	});
});
