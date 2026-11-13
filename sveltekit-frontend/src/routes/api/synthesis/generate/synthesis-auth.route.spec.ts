// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	getVectorCache: vi.fn(),
	setVectorCache: vi.fn(),
	assembleACEContext: vi.fn(),
	langGraphSynthesize: vi.fn(),
	langGraphSynthesizeStream: vi.fn(),
	parseLangGraphSSE: vi.fn(),
	publishSynthesisGenerate: vi.fn(),
	embedOrChatFetch: vi.fn(),
	routeInference: vi.fn(),
	trackTokenUsage: vi.fn(),
	logQuery: vi.fn(),
	logEvent: vi.fn(),
}));

vi.mock('$lib/server/auth-helpers.js', () => ({ requireAuth: vi.fn(async (event: { locals: { user: unknown } }) => ({ user: event.locals.user })) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
vi.mock('$lib/server/middleware/rate-limit.js', () => ({ rateLimitOrRespond: vi.fn(async () => null), RateLimitPresets: { aiEndpoint: {} } }));
vi.mock('$lib/server/observability/langfuse.js', () => ({ traceLLM: vi.fn() }));
vi.mock('$lib/server/vector-cache.js', () => ({ getVectorCache: h.getVectorCache, setVectorCache: h.setVectorCache }));
vi.mock('$lib/server/ace/context-assembler.js', () => ({ assembleACEContext: h.assembleACEContext, buildACEPromptCached: vi.fn() }));
vi.mock('$lib/server/ace/self-prompt.js', () => ({ evaluateResponse: vi.fn(), generateCorrectionPrompt: vi.fn() }));
vi.mock('$lib/server/queue/rabbitmq-manager-fixed.js', () => ({ rabbitmq: { publishSynthesisGenerate: h.publishSynthesisGenerate } }));
vi.mock('$lib/server/queue/dispatch-inline.js', () => ({ dispatchOrExecuteInline: vi.fn() }));
vi.mock('$lib/server/ollama.js', () => ({ embedOrChatFetch: h.embedOrChatFetch, getLlamaChatEndpoint: vi.fn() }));
vi.mock('$lib/server/inference/inference-router.js', () => ({ routeInference: h.routeInference }));
vi.mock('$lib/server/ai/token-tracker.js', () => ({ trackTokenUsage: h.trackTokenUsage }));
vi.mock('$lib/server/retrieval/document-dag.js', () => ({ orderByDependency: vi.fn(), extractCitationRefs: vi.fn() }));
vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({ fastJsonParse: (value: string) => JSON.parse(value) }));
vi.mock('$lib/server/db/client', () => ({ db: { insert: vi.fn() } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ synthesisRuns: {} }));
vi.mock('$lib/server/analytics/event-logger.js', () => ({ logQuery: h.logQuery, logEvent: h.logEvent }));
vi.mock('$lib/server/ai/langgraph-client.js', () => ({ langGraphSynthesize: h.langGraphSynthesize, langGraphSynthesizeStream: h.langGraphSynthesizeStream, parseLangGraphSSE: h.parseLangGraphSSE }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: h.getAuthorizedCase }));
vi.mock('$lib/server/library/library-document-access-v1.js', () => ({ normalizeLibraryActorIdV1: (id: unknown) => Number(id) || null }));
vi.mock('$lib/server/llm/runtime-contract.js', () => ({ LLM_MODEL_ID: 'test-model' }));

import { POST } from './+server.js';

describe('POST /api/synthesis/generate authorization boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		h.getAuthorizedCase.mockResolvedValue(null);
	});

	it.each([
		['202', '01932000-0000-7000-8000-00000000ca5a'],
		['101', '01932000-0000-7000-8000-00000000ca5b'],
	])('denies a foreign case for user %s before cache, retrieval, queue, or model calls', async (userId, caseId) => {
		const response = await POST({
			request: new Request('http://x/api/synthesis/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: 'Summarize the document', caseId }),
			}),
			locals: { user: { id: userId } },
		} as never);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Case not found' });
		expect(h.getAuthorizedCase).toHaveBeenCalledWith(caseId, Number(userId));
		for (const downstream of [
			h.getVectorCache,
			h.setVectorCache,
			h.assembleACEContext,
			h.langGraphSynthesize,
			h.langGraphSynthesizeStream,
			h.publishSynthesisGenerate,
			h.embedOrChatFetch,
			h.routeInference,
			h.trackTokenUsage,
			h.logQuery,
			h.logEvent,
		]) expect(downstream).not.toHaveBeenCalled();
	});

	it('marks LangGraph stream citations unverified when no canonical chunk identity is returned', async () => {
		h.langGraphSynthesizeStream.mockResolvedValue(new ReadableStream({
			start(controller) { controller.enqueue(new TextEncoder().encode('data: done\n\n')); controller.close(); },
		}));
		h.parseLangGraphSSE.mockReturnValue({
			stage: 'done',
			citations: [{ index: 1, title: 'Claimed source', score: 0.99, text: 'Unverified quote' }],
		});
		const response = await POST({
			request: new Request('http://x/api/synthesis/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: 'Summarize this record', stream: true }),
			}),
			locals: { user: { id: '101' } },
		} as never);

		const streamText = await response.text();
		const completePayload = streamText.split('event: complete\ndata: ')[1]?.split('\n\n')[0];
		expect(completePayload).toBeTruthy();
		expect(JSON.parse(completePayload!).citations).toEqual([
			expect.objectContaining({ sourceTitle: 'Claimed source', quote: 'Unverified quote', lineageStatus: 'unverified' }),
		]);
	});
});
