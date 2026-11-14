// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	authorizeLibraryDocument: vi.fn(),
	getVectorCache: vi.fn(),
	setVectorCache: vi.fn(),
	assembleACEContext: vi.fn(),
	langGraphSynthesize: vi.fn(),
	langGraphSynthesizeStream: vi.fn(),
	parseLangGraphSSE: vi.fn(),
	loadLibraryDocumentSynthesisChunks: vi.fn(),
	buildLibraryDocumentSynthesisContext: vi.fn(),
	buildACEPromptCached: vi.fn(),
	createCitationManifest: vi.fn(),
	verifyCitationReferences: vi.fn(),
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
vi.mock('$lib/server/ace/context-assembler.js', () => ({ assembleACEContext: h.assembleACEContext, buildACEPromptCached: h.buildACEPromptCached }));
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
vi.mock('$lib/server/library/library-document-access-v1.js', () => ({
	normalizeLibraryActorIdV1: (id: unknown) => Number(id) || null,
	authorizeLibraryDocumentV1: h.authorizeLibraryDocument,
}));
vi.mock('$lib/server/library/library-document-synthesis-context-v1.js', () => ({
	loadLibraryDocumentSynthesisChunksV1: h.loadLibraryDocumentSynthesisChunks,
	buildLibraryDocumentSynthesisContextV1: h.buildLibraryDocumentSynthesisContext,
}));
vi.mock('$lib/server/library/library-citation-provenance-v1.js', () => ({
	createLibraryCitationContextManifestV1: h.createCitationManifest,
	verifyLibraryCitationReferencesV1: h.verifyCitationReferences,
}));
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

	it.each([
		['202', '01932000-0000-8000-8000-00000000d0ca'],
		['101', '01932000-0000-8000-8000-00000000d0cb'],
	])('denies a document outside user %s scope before cache, retrieval, queue, or model calls', async (userId, documentId) => {
		h.authorizeLibraryDocument.mockResolvedValue({ allowed: false, reason: 'DOCUMENT_NOT_OWNED' });
		const response = await POST({
			request: new Request('http://x/api/synthesis/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					query: 'Summarize this evidence document',
					documentId,
					sourceRevision: '01932000-0000-8000-8000-00000000a001',
				}),
			}),
			locals: { user: { id: userId } },
		} as never);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Document revision not found' });
		expect(h.authorizeLibraryDocument).toHaveBeenCalledWith({ documentId, actorId: Number(userId), caseId: null });
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

	it('rejects a stale requested source revision before any downstream work', async () => {
		const documentId = '01932000-0000-8000-8000-00000000d0ca';
		h.authorizeLibraryDocument.mockResolvedValue({
			allowed: true,
			documentId,
			scope: 'owner',
			actorId: 202,
			sourceHash: 'a'.repeat(64),
			revisionId: '01932000-0000-8000-8000-00000000a002',
		});
		const response = await POST({
			request: new Request('http://x/api/synthesis/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					query: 'Summarize this evidence document',
					documentId,
					sourceRevision: '01932000-0000-8000-8000-00000000a001',
				}),
			}),
			locals: { user: { id: '202' } },
		} as never);

		expect(response.status).toBe(404);
		expect(h.getVectorCache).not.toHaveBeenCalled();
		expect(h.langGraphSynthesize).not.toHaveBeenCalled();
		expect(h.publishSynthesisGenerate).not.toHaveBeenCalled();
	});

	it('synthesizes only from the admitted document revision, bypassing global retrieval and queues', async () => {
		const documentId = '01932000-0000-8000-8000-00000000d0ca';
		const sourceRevision = '01932000-0000-8000-8000-00000000a001';
		const sourceHash = 'a'.repeat(64);
		const scopedChunks = [{
			id: 'chunk-current-revision',
			identityStatus: 'canonical',
			kind: 'legal_doc',
			source: 'pgvector',
			sourceId: documentId,
			content: 'The admitted document says the hearing occurred on June 4.',
			score: 1,
			tags: [],
			metadata: {
				chunk_id: 'chunk-current-revision',
				document_id: documentId,
				document_revision: sourceRevision,
				source_hash: sourceHash,
				parser_revision: 'legal-extract-v1:test',
				chunk_hash: 'b'.repeat(64),
				page_start: 1,
				page_end: 1,
				char_start: 0,
				char_end: 57,
				char_offset_unit: 'utf16_code_units',
			},
		}];
		h.authorizeLibraryDocument.mockResolvedValue({
			allowed: true,
			documentId,
			scope: 'owner',
			actorId: 202,
			sourceHash,
			revisionId: sourceRevision,
		});
		h.loadLibraryDocumentSynthesisChunks.mockResolvedValue(scopedChunks);
		h.buildLibraryDocumentSynthesisContext.mockReturnValue({
			userProfile: null, caseContext: null, glossaryMatches: null, ragChunks: [], kbChunks: [],
			caseChunks: scopedChunks, docChunks: [], kagNeighbors: [], chatHistory: [],
			entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
			persona: 'neutral',
		});
		h.buildACEPromptCached.mockResolvedValue({
			systemPrompt: 'Use only the supplied source.',
			contextWindow: 'Admitted document context',
			budgetProfile: { limits: { kbChunkCount: 0, caseChunkCount: 32, mergedChunkCount: 32 } },
		});
		h.createCitationManifest.mockResolvedValue(null);
		h.verifyCitationReferences.mockReturnValue(new Map());
		h.embedOrChatFetch.mockResolvedValue(new Response(
			'{"message":{"content":"The admitted document states the hearing date."}}\n{"done":true,"eval_count":9}\n',
			{ status: 200, headers: { 'content-type': 'application/x-ndjson' } },
		));

		const response = await POST({
			request: new Request('http://x/api/synthesis/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					query: 'When was the hearing?',
					documentId,
					sourceRevision,
					stream: true,
					enableACE: false,
					includeCitations: false,
				}),
			}),
			locals: { user: { id: '202' } },
		} as never);

		const streamBody = await response.text();
		expect(response.status).toBe(200);
		expect(streamBody).toContain('event: complete');
		expect(h.loadLibraryDocumentSynthesisChunks).toHaveBeenCalledWith(
			expect.objectContaining({ actorId: 202, documentId, sourceRevision, sourceHash, caseId: null }),
			'When was the hearing?',
		);
		expect(h.buildLibraryDocumentSynthesisContext).toHaveBeenCalledWith(scopedChunks, undefined);
		expect(h.assembleACEContext).not.toHaveBeenCalled();
		expect(h.langGraphSynthesize).not.toHaveBeenCalled();
		expect(h.langGraphSynthesizeStream).not.toHaveBeenCalled();
		expect(h.publishSynthesisGenerate).not.toHaveBeenCalled();
		expect(h.getVectorCache).not.toHaveBeenCalled();
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
