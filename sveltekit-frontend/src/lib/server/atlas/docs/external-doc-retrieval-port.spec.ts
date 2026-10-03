import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../env.server.js', () => ({ ENV: { QDRANT_URL: 'http://qdrant.test', QDRANT_API_KEY: null } }));
vi.mock('./semantic-768-client.js', () => ({ embedSemantic768: vi.fn() }));

import { buildExternalDocQdrantFilter, createExternalDocRetrievalPort } from './external-doc-retrieval-port.js';

const baseFilter = {
	provider: 'nvidia',
	product: 'cuda-tile-ir',
	product_version: '13.2',
	architecture: 'ampere',
	source_authority: 'OFFICIAL' as const
};

describe('external document retrieval filters', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('requires exact product, version, architecture, authority and noncanonical projection', () => {
		expect(buildExternalDocQdrantFilter(baseFilter)).toEqual({
			must: [
				{ key: 'provider', match: { value: 'nvidia' } },
				{ key: 'product', match: { value: 'cuda-tile-ir' } },
				{ key: 'product_version', match: { value: '13.2' } },
				{ key: 'architecture', match: { value: 'ampere' } },
				{ key: 'source_authority', match: { value: 'OFFICIAL' } },
				{ key: 'canonical_authority', match: { value: false } }
			]
		});
	});

	it('expresses an explicitly null architecture as an is-null constraint', () => {
		expect(buildExternalDocQdrantFilter({ ...baseFilter, architecture: null }).must).toContainEqual({ is_null: { key: 'architecture' } });
	});

	it('applies the same exact filter before dense, BM25 and both hybrid prefetch rankings', async () => {
		const requests: Array<{ body: Record<string, any> }> = [];
		vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
			requests.push({ body: JSON.parse(String(init.body)) });
			return { ok: true, json: async () => ({ result: { points: [{ payload: { chunk_id: 'chunk-1' } }] } }) } as Response;
		}));
		const port = createExternalDocRetrievalPort();
		const queryVector = Array.from({ length: 768 }, () => 0.1);
		await port.queryDense({ queryVector, k: 5, documentFilter: baseFilter });
		await port.queryBm25({ queryText: 'kernel', k: 5, documentFilter: baseFilter });
		await port.queryHybridRrf({ queryText: 'kernel', queryVector, k: 5, prefetchK: 10, documentFilter: baseFilter });

		const expected = buildExternalDocQdrantFilter(baseFilter);
		expect(requests).toHaveLength(3);
		expect(requests[0].body.filter).toEqual(expected);
		expect(requests[1].body.filter).toEqual(expected);
		expect(requests[2].body.filter).toEqual(expected);
		expect(requests[2].body.prefetch).toHaveLength(2);
		expect(requests[2].body.prefetch.every((lane) => JSON.stringify(lane.filter) === JSON.stringify(expected))).toBe(true);
	});
});
