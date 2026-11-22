import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/db/client', () => ({
	db: { execute: vi.fn().mockRejectedValue(new Error('mock-db-offline')) },
}));

vi.mock('$lib/server/llm/runtime-contract.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/llm/runtime-contract.js')>();
	return {
		...actual,
		resolveLlamaInferenceTarget: vi.fn().mockResolvedValue({
			baseUrl: 'http://127.0.0.1:8090',
			model: 'gemma4-legal-iq4xs-direct.gguf',
			configuredModel: 'gemma4-legal-iq4xs-direct.gguf',
			modelSource: 'llama-server-loaded',
			selectionPolicy: 'configured-or-loaded',
			selectionReceiptChecksum: 'sha256:test',
		}),
	};
});

import { GET } from './+server.js';

describe('GET /api/codeintel/semantic-health (TASK-L284)', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				const url = String(input);
				if (url.includes('/api/tags')) {
					return new Response(
						JSON.stringify({ models: [{ name: 'embeddinggemma:latest' }] }),
						{ status: 200, headers: { 'content-type': 'application/json' } }
					);
				}
				return new Response(JSON.stringify({}), { status: 404 });
			})
		);
	});

	it('marks chatModelReady=true from llama-server even when Ollama /api/tags only lists embeddinggemma', async () => {
		const res = await GET({
			locals: { user: { id: 'u1' } } as never,
			url: new URL('http://localhost/api/codeintel/semantic-health'),
		} as never);
		expect([200, 503]).toContain(res.status);
		const body = await res.json();
		expect(body.model.ollamaReachable).toBe(true);
		expect(body.model.embedModelReady).toBe(true);
		expect(body.model.chatModelReady).toBe(true);
	});
});
