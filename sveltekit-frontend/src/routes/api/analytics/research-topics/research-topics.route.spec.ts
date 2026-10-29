// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildResearchIndex = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/analytics/research-cache.js', () => ({
	queryResearchIndex: vi.fn(),
	buildResearchIndex,
	getCachedPromptChain: vi.fn(),
	cachePromptChain: vi.fn(),
	getResearchIndexStats: vi.fn(),
	invalidateResearchIndex: vi.fn(),
}));
vi.mock('$lib/server/llm/runtime-contract.js', () => ({ LLM_MODEL_ID: 'test-model' }));
vi.mock('$lib/server/ollama.js', () => ({
	embedOrChatFetch: vi.fn(),
	getLlamaGenerationEndpoint: vi.fn(() => 'http://127.0.0.1:8090'),
}));

import { POST } from './+server.js';

describe('POST /api/analytics/research-topics', () => {
	beforeEach(() => {
		buildResearchIndex.mockReset();
	});

	it('rejects malformed JSON before rebuilding the research index', async () => {
		const request = new Request('http://localhost/api/analytics/research-topics', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{',
		});

		const response = await POST({ request, locals: { user: { id: 'user-1' } } } as any);

		expect(response.status).toBe(400);
		expect(buildResearchIndex).not.toHaveBeenCalled();
	});

	it('rejects unsupported actions before rebuilding the research index', async () => {
		const request = new Request('http://localhost/api/analytics/research-topics', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete' }),
		});

		const response = await POST({ request, locals: { user: { id: 'user-1' } } } as any);

		expect(response.status).toBe(400);
		expect(buildResearchIndex).not.toHaveBeenCalled();
	});

	it('rejects unauthenticated requests before reading their body', async () => {
		const json = vi.fn();
		const request = { json } as unknown as Request;

		const response = await POST({ request, locals: {} } as any);

		expect(response.status).toBe(401);
		expect(json).not.toHaveBeenCalled();
		expect(buildResearchIndex).not.toHaveBeenCalled();
	});
});
