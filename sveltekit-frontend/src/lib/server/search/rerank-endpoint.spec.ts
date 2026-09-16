import { describe, expect, it } from 'vitest';
import { resolveRerankEndpoint } from './rerank-endpoint.js';

describe('rerank endpoint resolution', () => {
	it('prefers the explicit rerank URL', () => {
		expect(resolveRerankEndpoint({
			RERANK_URL: 'http://rerank-primary/',
			RERANK_BASE_URL: 'http://rerank-base',
		})).toBe('http://rerank-primary');
	});

	it('falls back to existing base or sidecar configuration', () => {
		expect(resolveRerankEndpoint({ RERANK_BASE_URL: 'http://rerank-base/' })).toBe('http://rerank-base');
		expect(resolveRerankEndpoint({ RERANKER_SIDECAR_URL: 'http://rerank-sidecar' })).toBe('http://rerank-sidecar');
	});

	it('returns unavailable instead of constructing an undefined URL', () => {
		expect(resolveRerankEndpoint({ RERANK_URL: undefined, RERANK_BASE_URL: 'undefined', RERANKER_SIDECAR_URL: null })).toBeNull();
	});
});
