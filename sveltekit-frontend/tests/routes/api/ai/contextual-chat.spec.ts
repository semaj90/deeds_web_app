// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockContextualChat,
	mockExecuteChain,
	mockRecordSearchQuery,
	mockDbInsert,
	mockDbValues,
} = vi.hoisted(() => ({
	mockContextualChat: vi.fn(),
	mockExecuteChain: vi.fn(),
	mockRecordSearchQuery: vi.fn(),
	mockDbInsert: vi.fn(),
	mockDbValues: vi.fn(),
}));

vi.mock('$lib/server/llm/contextual-chat.js', () => ({
	contextualChat: mockContextualChat,
}));

vi.mock('$lib/server/analytics/search-analytics.js', () => ({
	recordSearchQuery: mockRecordSearchQuery,
}));

vi.mock('$lib/server/ai/intent-router.js', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/ai/intent-router.js')>('$lib/server/ai/intent-router.js');
	return {
		...actual,
		executeChain: mockExecuteChain,
	};
});

vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: mockDbInsert,
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	contextTimeline: { name: 'context_timeline' },
}));

describe('src/routes/api/ai/contextual-chat/+server.ts', () => {
	let POST: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

	beforeEach(async () => {
		vi.resetAllMocks();
		mockDbInsert.mockReturnValue({ values: mockDbValues });
		mockDbValues.mockResolvedValue({});
		mockExecuteChain.mockResolvedValue({
			result: { step: 'ok' },
			trace: [{ tool: 'kb.search_notecards', ms: 1, ok: true }],
		});
		mockContextualChat.mockResolvedValue({
			turnId: 'turn-1',
			answer: 'answer',
			keywords: ['answer'],
			keyPhrases: ['phrase'],
			suggestions: [{ query: 'Explore: phrase', reason: 'Key phrase from analysis', score: 0.8 }],
			latencyMs: 42,
			citations: [],
		});
		const mod = await import('../../../../src/routes/api/ai/contextual-chat/+server.js') as Record<string, unknown>;
		POST = mod.POST as typeof POST;
	});

	function makeReq(body?: unknown) {
		return new Request(
			'http://localhost/api/ai/contextual-chat',
			body !== undefined
				? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
				: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
		);
	}

	function makeUrl() { return new URL('http://localhost/api/ai/contextual-chat'); }

	it('401 — returns Unauthorized when locals.user is missing', async () => {
		const res = await POST({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
		expect(res.status).toBe(401);
	});

	it('400 — returns validation error for empty payload', async () => {
		const res = await POST({ request: makeReq({}), locals: { user: { id: 7 } }, url: makeUrl(), params: {} });
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toBeDefined();
	});

	it('200 — routes intent, records chat.intent, and returns contextual chat payload', async () => {
		const res = await POST({
			request: makeReq({ message: 'upload the pdf evidence' }),
			locals: { user: { id: 7 } },
			url: makeUrl(),
			params: {},
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.response).toBe('answer');
		expect(data.intent.label).toBe('evidence_upload');
		expect(data.route.chain[0].tool).toBe('kb.search_notecards');
		expect(mockExecuteChain).toHaveBeenCalledTimes(1);
		expect(mockRecordSearchQuery).toHaveBeenCalledWith(expect.objectContaining({ pipeline: 'contextual', userId: 7 }));
		expect(mockDbInsert).toHaveBeenCalledTimes(1);
		const payload = mockDbValues.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(payload.eventType).toBe('chat.intent');
		expect((payload.payload as Record<string, unknown>).label).toBe('evidence_upload');
	});

	it('503 — returns service unavailable when contextual chat fails', async () => {
		mockContextualChat.mockRejectedValueOnce(new Error('boom'));
		const res = await POST({
			request: makeReq({ message: 'draft a legal brief' }),
			locals: { user: { id: 7 } },
			url: makeUrl(),
			params: {},
		});

		expect(res.status).toBe(503);
		const data = await res.json();
		expect(data.error).toBe('AI service unavailable');
	});
});
