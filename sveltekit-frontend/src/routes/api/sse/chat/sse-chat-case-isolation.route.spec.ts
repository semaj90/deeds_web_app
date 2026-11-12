// @vitest-environment node
// 2-user x 2-case isolation for POST /api/sse/chat, run against the REAL route handler with an in-memory
// database. A denied request must stop at the authorization gate: 404 and zero retrieval, cache, queue,
// embedding, model or write calls. Every collaborator below is a spy so a call cannot go unnoticed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
	const tables = {
		cases: { __t: 'cases', id: 'cases.id', userId: 'cases.userId', assignedAttorney: 'cases.assignedAttorney' },
		chatMetadata: { __t: 'chatMetadata', chatId: 'chatMetadata.chatId', userId: 'chatMetadata.userId', caseId: 'chatMetadata.caseId' },
		chatMessages: { __t: 'chatMessages', id: 'chatMessages.id', chatId: 'chatMessages.chatId', role: 'chatMessages.role', content: 'chatMessages.content', timestamp: 'chatMessages.timestamp' },
		attachments: { __t: 'attachments', chat_session_id: 'attachments.chat_session_id' },
	};
	const state = {
		cases: [] as Array<{ id: string; userId: number; assignedAttorney: number | null }>,
		chatMetadata: [] as Array<{ chatId: string; userId: number; caseId: string | null }>,
		chatMessages: [] as Array<{ id: string; chatId: string }>,
		selects: [] as string[],
		inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
	};
	const spies = {
		fetch: vi.fn(),
		generateEmbedding: vi.fn(),
		setCache: vi.fn(),
		getFromMemoryCache: vi.fn(),
		setFragment: vi.fn(),
		getFragment: vi.fn(),
		dispatchOrExecuteInline: vi.fn(),
		streamTrtLLM: vi.fn(),
		streamTritonLLM: vi.fn(),
		loadCodebaseContext: vi.fn(),
		fetchCachedACEChunks: vi.fn(),
		persistACEChunks: vi.fn(),
		fetchGlossaryMatches: vi.fn(),
		getCaseGraphNeighborIds: vi.fn(),
		getNeo4jMultiHopNeighbors: vi.fn(),
		routeQuery: vi.fn(),
		recordSearchQuery: vi.fn(),
		lookupCachedResponse: vi.fn(),
		storeCachedResponse: vi.fn(),
		getCachedStreamResponse: vi.fn(),
		produceTokenChunk: vi.fn(),
		acquireGpuLease: vi.fn(),
	};
	const column = (token: unknown) => String(token).split('.')[1];
	const evaluate = (predicate: any, row: Record<string, unknown>): boolean => {
		if (!predicate) return true;
		if (predicate.op === 'eq') return row[column(predicate.a)] === predicate.b;
		if (predicate.op === 'and') return predicate.args.every((p: any) => evaluate(p, row));
		if (predicate.op === 'or') return predicate.args.some((p: any) => evaluate(p, row));
		return true;
	};
	return { tables, state, spies, evaluate };
});

vi.mock('drizzle-orm', () => ({
	eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
	and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
	or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
	desc: (x: unknown) => x,
	sql: () => ({ op: 'sql' }),
}));
vi.mock('$lib/server/db/client', () => ({
	db: {
		select: () => ({
			from: (table: { __t: keyof typeof h.state; }) => {
				h.state.selects.push(table.__t);
				const rows = () => (h.state as any)[table.__t] ?? [];
				return {
					where: (predicate: unknown) => {
						const matched = () => rows().filter((row: Record<string, unknown>) => h.evaluate(predicate, row));
						const chain: any = { limit: async () => matched(), orderBy: () => chain };
						return chain;
					},
				};
			},
		}),
		insert: (table: { __t: string }) => ({
			values: (values: Record<string, unknown>) => {
				const commit = () => {
					h.state.inserts.push({ table: table.__t, values });
					if (table.__t === 'chatMetadata') {
						h.state.chatMetadata.push({ chatId: String(values.chatId), userId: Number(values.userId), caseId: (values.caseId as string) ?? null });
					}
				};
				return {
					onConflictDoNothing: async () => commit(),
					then: (resolve: (v: unknown) => unknown) => Promise.resolve().then(commit).then(resolve),
				};
			},
		}),
		execute: async () => ({ rows: [] }),
	},
}));
vi.mock('$lib/server/db/schema', () => ({ cases: h.tables.cases, chatMessages: h.tables.chatMessages, chatMetadata: h.tables.chatMetadata, savedCitations: {} }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ cases: h.tables.cases, chatDocumentAttachments: h.tables.attachments }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { QDRANT_URL: 'http://qdrant.invalid' } }));
vi.mock('$lib/server/case-access.js', () => ({
	getAuthorizedCase: async (caseId: string, actorId: number) =>
		h.state.cases.find((c) => c.id === caseId && (c.userId === actorId || c.assignedAttorney === actorId)) ?? null,
}));
vi.mock('$lib/server/ollama.js', () => ({ getChatModelKeepAlive: vi.fn() }));
vi.mock('$lib/server/features/rag/index.js', () => ({ loadCodebaseContext: h.spies.loadCodebaseContext }));
vi.mock('$lib/server/retrieval/summary-card-retrieval.js', () => ({ buildSummaryCardPromptSection: vi.fn(), retrieveSummaryCards: vi.fn() }));
vi.mock('$lib/server/retrieval/graph-context.js', () => ({
	getGraphContext: vi.fn(),
	getCaseGraphNeighborIds: h.spies.getCaseGraphNeighborIds,
	buildGraphShouldFilter: vi.fn(),
	applyGraphAuthorityScoring: vi.fn(),
	getNeo4jMultiHopNeighbors: h.spies.getNeo4jMultiHopNeighbors,
	formatNeo4jContext: vi.fn(),
}));
vi.mock('$lib/server/retrieval/graph-informed-retrieval.js', () => ({ graphExpandRetrieval: vi.fn() }));
vi.mock('$lib/server/config/vector-config.js', () => ({ buildVectorPayload: (_collection: string, vector: number[]) => vector }));
vi.mock('$lib/server/ai/llm-cache.js', () => ({ lookupCachedResponse: h.spies.lookupCachedResponse, storeCachedResponse: h.spies.storeCachedResponse }));
vi.mock('$lib/server/glyph-prompt-cache.js', () => ({
	getFragment: h.spies.getFragment,
	setFragment: h.spies.setFragment,
	getGlyphCacheMetrics: () => ({ entries: 0, hitRate: 0, avgCompressionRatio: 0 }),
	FragmentType: { CASE: 'case', RAG: 'rag', CODE: 'code', KAG: 'kag' },
}));
vi.mock('$lib/server/cache-keys.js', () => ({ synthesisKey: vi.fn(() => 'k'), getCaseVersion: vi.fn(), TTL: {} }));
vi.mock('$lib/server/cache.js', () => ({ setCache: h.spies.setCache, getFromMemoryCache: h.spies.getFromMemoryCache }));
vi.mock('$lib/server/observability/langfuse.js', () => ({
	traceEmbedding: async (_text: string, _model: string, fn: () => unknown) => fn(),
	traceLLM: vi.fn(),
}));
vi.mock('$lib/server/ace/self-prompt.js', () => ({ evaluateResponse: vi.fn(), generateCorrectionPrompt: vi.fn() }));
vi.mock('$lib/server/ace/context-assembler.js', () => ({
	fetchGlossaryMatches: h.spies.fetchGlossaryMatches,
	fetchCachedACEChunks: h.spies.fetchCachedACEChunks,
	persistACEChunks: h.spies.persistACEChunks,
}));
vi.mock('$lib/server/ace/query-router.js', () => ({ routeQuery: h.spies.routeQuery }));
vi.mock('$lib/server/search/engram-bigram.js', () => ({ recordEngramTransition: vi.fn() }));
vi.mock('$lib/server/analysis/hmm-ace-analyzer.js', () => ({ classifyQuerySection: () => ({ confidence: 0 }), getInterimInference: vi.fn() }));
vi.mock('$lib/server/retrieval/document-dag.js', () => ({ orderByDependency: vi.fn(), extractCitationRefs: vi.fn() }));
vi.mock('$lib/server/rag/tag-extractor.js', () => ({ extractLegalTags: vi.fn() }));
vi.mock('$lib/server/cache/dag-cache.js', () => ({ getCachedDAG: vi.fn(), setCachedDAG: vi.fn() }));
vi.mock('$lib/server/observability/inference-log.js', () => ({ logInference: vi.fn() }));
vi.mock('$lib/server/observability/tool-trace.js', () => ({ logToolTrace: vi.fn() }));
vi.mock('$lib/server/analytics/search-analytics.js', () => ({ queryHash: vi.fn(), recordSearchQuery: h.spies.recordSearchQuery }));
vi.mock('$lib/server/retrieval/authority-chain.js', () => ({ authorityChainExpansion: vi.fn() }));
vi.mock('$lib/server/trt-llm.js', () => ({ streamLLM: h.spies.streamTrtLLM, healthCheck: vi.fn() }));
vi.mock('$lib/server/triton-llm.js', () => ({ streamLLM: h.spies.streamTritonLLM, healthCheck: vi.fn() }));
vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({ acquireGpuLease: h.spies.acquireGpuLease, releaseGpuLease: vi.fn(), getGpuLeaseStatus: vi.fn() }));
vi.mock('$lib/server/redis-streams.js', () => ({ produceTokenChunk: h.spies.produceTokenChunk, trimTokenStream: vi.fn() }));
vi.mock('$lib/server/retrieval/auto-backfill.js', () => ({ shouldBackfill: vi.fn(), triggerBackfillAsync: vi.fn() }));
vi.mock('$lib/server/ace/policy.js', () => ({ determineACEPolicy: vi.fn() }));
vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({ fastJsonParse: (text: string) => JSON.parse(text) }));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateEmbedding: h.spies.generateEmbedding }));
vi.mock('$lib/server/ai/cached-stream.js', () => ({
	getCachedStreamResponse: h.spies.getCachedStreamResponse,
	storeCachedStreamResponse: vi.fn(),
	streamCachedResponse: vi.fn(),
}));
vi.mock('$lib/server/queue/dispatch-inline.js', () => ({ dispatchOrExecuteInline: h.spies.dispatchOrExecuteInline }));

import { POST } from './+server';

const USER_A = 101;
const USER_B = 202;
const CASE_A1 = 'a2b6d51c-5595-4ccd-a86b-ff89c0d349a1';
const CASE_A2 = 'a2b6d51c-5595-4ccd-a86b-ff89c0d349a2';
const CASE_B2 = 'b2b6d51c-5595-4ccd-a86b-ff89c0d349b2';

function call(body: Record<string, unknown>, userId: number | null = USER_A) {
	return POST({
		request: new Request('http://localhost/api/sse/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'summarize the evidence', ...body }),
		}),
		locals: { user: userId === null ? null : { id: userId } },
	} as never);
}

function expectNoDownstreamWork() {
	for (const [name, spy] of Object.entries(h.spies)) {
		expect(spy, `${name} must not be called`).not.toHaveBeenCalled();
	}
	expect(h.state.inserts, 'no database write').toEqual([]);
}

beforeEach(() => {
	for (const spy of Object.values(h.spies)) spy.mockReset();
	h.spies.getFragment.mockReturnValue(null);
	h.spies.generateEmbedding.mockResolvedValue(Array(768).fill(0.01));
	h.spies.getCaseGraphNeighborIds.mockResolvedValue([]);
	h.spies.getNeo4jMultiHopNeighbors.mockResolvedValue([]);
	h.spies.fetchCachedACEChunks.mockResolvedValue([]);
	h.spies.fetchGlossaryMatches.mockResolvedValue(null);
	h.spies.loadCodebaseContext.mockResolvedValue(null);
	h.spies.routeQuery.mockResolvedValue(null);
	// Only the retrieval tests reach fetch; denied requests must never get here (asserted by the spy loop).
	h.spies.fetch.mockImplementation(
		async () => new Response(JSON.stringify({ result: { points: [] } }), { status: 200, headers: { 'content-type': 'application/json' } })
	);
	vi.stubGlobal('fetch', h.spies.fetch);
	h.state.cases.length = 0;
	h.state.cases.push(
		{ id: CASE_A1, userId: USER_A, assignedAttorney: null },
		{ id: CASE_A2, userId: USER_A, assignedAttorney: null },
		{ id: CASE_B2, userId: USER_B, assignedAttorney: null }
	);
	h.state.chatMetadata.length = 0;
	h.state.chatMessages.length = 0;
	h.state.selects.length = 0;
	h.state.inserts.length = 0;
});

describe('POST /api/sse/chat: 2 users x 3 cases, denied requests stop at the gate', () => {
	it('answers 401 without a real actor and touches nothing', async () => {
		for (const user of [null, 0, -1]) {
			expect((await call({ conversationId: 'chat_x' }, user as number | null)).status).toBe(401);
		}
		expect(h.state.selects).toEqual([]);
		expectNoDownstreamWork();
	});

	it.each([
		['board-<foreign case> with the case in the body', `board-${CASE_B2}`, { caseId: CASE_B2 }],
		['case-<foreign case> parsed from the conversation id', `case-${CASE_B2}`, {}],
		['case-<foreign case> with a matching body caseId', `case-${CASE_B2}`, { caseId: CASE_B2 }],
	])('User A requesting User B case via %s gets 404 with zero downstream work', async (_label, conversationId, extra) => {
		const response = await call({ conversationId, ...extra });
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: 'Case not found' });
		expect(h.state.selects).toEqual(['cases']); // only the authorization query ran
		expectNoDownstreamWork();
	});

	it('refuses a body case that disagrees with a case-<uuid> conversation id before any lookup', async () => {
		const response = await call({ conversationId: `case-${CASE_A1}`, caseId: CASE_A2 });
		expect(response.status).toBe(400);
		expect(h.state.selects).toEqual([]);
		expectNoDownstreamWork();
	});

	it('refuses a same-user case switch inside an existing chat (A1 chat, A2 requested) with zero retrieval and no writes', async () => {
		h.state.chatMetadata.push({ chatId: `board-${CASE_A1}`, userId: USER_A, caseId: CASE_A1 });
		const response = await call({ conversationId: `board-${CASE_A1}`, caseId: CASE_A2 });
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: 'Conversation not found' });
		expectNoDownstreamWork();
	});

	it("refuses User B reusing User A's chat id, even for B's own case", async () => {
		h.state.chatMetadata.push({ chatId: 'chat_shared_id', userId: USER_A, caseId: null });
		const response = await call({ conversationId: 'chat_shared_id', caseId: CASE_B2 }, USER_B);
		expect(response.status).toBe(404);
		expectNoDownstreamWork();
	});

	it('refuses legacy chats that have messages but no owner row (409) without claiming them', async () => {
		h.state.chatMessages.push({ id: 'old', chatId: 'widget-7vp2uf' });
		const response = await call({ conversationId: 'widget-7vp2uf' });
		expect(response.status).toBe(409);
		expectNoDownstreamWork();
	});

	describe('shared legal_documents collection is scoped by case', () => {
		// The request body the route sent to Qdrant for one collection.
		const searchedPayloads = (collection: string) =>
			h.spies.fetch.mock.calls
				.filter(([url]) => String(url).includes(`/collections/${collection}/`))
				.map(([, init]) => JSON.parse(String((init as { body?: unknown })?.body ?? '{}')) as { filter?: unknown });

		async function waitForSearch(collection: string) {
			for (let i = 0; i < 200 && searchedPayloads(collection).length === 0; i++) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}

		it('a case chat searches public documents plus its own case only', async () => {
			const response = await call({ conversationId: `board-${CASE_A1}`, caseId: CASE_A1 });
			expect(response.status).toBe(200);
			await waitForSearch('legal_documents');
			const payloads = searchedPayloads('legal_documents');
			expect(payloads.length).toBeGreaterThan(0);
			for (const payload of payloads) {
				expect(payload.filter).toEqual({
					should: [{ is_empty: { key: 'case_id' } }, { key: 'case_id', match: { value: CASE_A1 } }],
				});
			}
			expect(JSON.stringify(payloads)).not.toContain(CASE_B2);
			await response.body?.cancel().catch(() => {});
		});

		it('a non-case chat searches public (case-less) documents only', async () => {
			const response = await call({ conversationId: 'chat_plain_1' });
			expect(response.status).toBe(200);
			await waitForSearch('legal_documents');
			const payloads = searchedPayloads('legal_documents');
			expect(payloads.length).toBeGreaterThan(0);
			for (const payload of payloads) {
				expect(payload.filter).toEqual({ must: [{ is_empty: { key: 'case_id' } }] });
			}
			await response.body?.cancel().catch(() => {});
		});

		it('leaves the other knowledge-base collections unfiltered, as before', async () => {
			const response = await call({ conversationId: 'chat_plain_2' });
			await waitForSearch('court_opinions');
			expect(searchedPayloads('court_opinions')[0]?.filter).toBeUndefined();
			await response.body?.cancel().catch(() => {});
		});
	});

	it('positive control: the owner of a case is admitted, claims the session and persists the message', async () => {
		const response = await call({ conversationId: `board-${CASE_A1}`, caseId: CASE_A1 });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		expect(h.state.inserts.map((entry) => entry.table)).toEqual(expect.arrayContaining(['chatMetadata', 'chatMessages']));
		expect(h.state.inserts.find((entry) => entry.table === 'chatMetadata')?.values).toMatchObject({
			chatId: `board-${CASE_A1}`,
			userId: USER_A,
			caseId: CASE_A1,
		});
		await response.body?.cancel().catch(() => {});
	});
});
