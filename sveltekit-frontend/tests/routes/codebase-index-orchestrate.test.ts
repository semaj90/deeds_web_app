// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const {
	mockReaddir,
	mockChunkFiles,
	mockIndexChunks,
	mockIndexChunksIncremental,
	mockRedisGet,
	mockRedisSetex,
	mockCuda,
	mockDbExecute,
} = vi.hoisted(() => ({
	mockReaddir: vi.fn(),
	mockChunkFiles: vi.fn(),
	mockIndexChunks: vi.fn(),
	mockIndexChunksIncremental: vi.fn(),
	mockRedisGet: vi.fn(),
	mockRedisSetex: vi.fn(),
	mockCuda: vi.fn(),
	mockDbExecute: vi.fn(),
}));

vi.mock('fs/promises', () => ({
	readdir: (...args: unknown[]) => mockReaddir(...args),
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		QDRANT_URL: 'http://localhost:6333',
	},
}));

vi.mock('$lib/server/indexer/ast-chunker.js', () => ({
	chunkFiles: (...args: unknown[]) => mockChunkFiles(...args),
}));

vi.mock('$lib/server/indexer/dual-embedder.js', () => ({
	indexChunks: (...args: unknown[]) => mockIndexChunks(...args),
	indexChunksIncremental: (...args: unknown[]) => mockIndexChunksIncremental(...args),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
	isCudaAvailable: () => mockCuda(),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: (...args: unknown[]) => mockRedisGet(...args),
		setex: (...args: unknown[]) => mockRedisSetex(...args),
	}),
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		execute: (...args: unknown[]) => mockDbExecute(...args),
	},
}));

function makeFileEntry(name: string) {
	return {
		name,
		isDirectory: () => false,
		isFile: () => true,
	};
}

function makeChunk() {
	return {
		id: 'src/routes/demo/+server.ts::GET::0',
		content: 'export const GET = async () => new Response("ok");',
		signature: 'export GET /demo [api, server]',
		metadata: {
			path: 'c:/repo/src/routes/demo/+server.ts',
			relativePath: 'src/routes/demo/+server.ts',
			kind: 'route-handler',
			symbol: 'GET',
			httpMethod: 'GET',
			routeId: '/demo',
			exports: ['GET'],
			tags: ['api', 'server'],
			lineStart: 1,
			lineEnd: 1,
		},
	};
}

function makeJsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function makeSseResponse(events: Array<{ event: string; data: unknown }>) {
	const body = events
		.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
		.join('');
	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/event-stream' },
	});
}

function parseSseText(text: string): Array<{ event: string; data: Record<string, unknown> }> {
	return text
		.split(/\r?\n\r?\n/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => {
			const eventMatch = chunk.match(/^event:\s*(.+)$/m);
			const dataLines = [...chunk.matchAll(/^data:\s*(.+)$/gm)].map((match) => match[1]);
			return {
				event: eventMatch?.[1] ?? 'message',
				data: dataLines.length ? (JSON.parse(dataLines.join('\n')) as Record<string, unknown>) : {},
			};
		});
}

function makePostEvent(
	body: Record<string, unknown>,
	options: { authenticated?: boolean; fetch?: typeof fetch } = {},
) {
	const request = new Request('http://localhost/api/codebase-index/orchestrate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	return {
		locals: { user: options.authenticated === false ? null : { id: 'user-1' } },
		request,
		url: new URL(request.url),
		fetch: options.fetch ?? (vi.fn() as unknown as typeof fetch),
		params: {},
		route: { id: '/api/codebase-index/orchestrate' },
	};
}

function makeGetEvent(
	url = 'http://localhost/api/codebase-index/orchestrate',
	options: { authenticated?: boolean; fetch?: typeof fetch } = {},
) {
	return {
		locals: { user: options.authenticated === false ? null : { id: 'user-1' } },
		request: new Request(url, { method: 'GET' }),
		url: new URL(url),
		fetch: options.fetch ?? (vi.fn() as unknown as typeof fetch),
		params: {},
		route: { id: '/api/codebase-index/orchestrate' },
	};
}

describe('GET /api/codebase-index/orchestrate', () => {
	let GET: (typeof import('../../src/routes/api/codebase-index/orchestrate/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		mockCuda.mockReturnValue(true);
		mockRedisGet.mockResolvedValue('job-latest-1');
		mockDbExecute
			.mockResolvedValueOnce([{ exists: true }])
			.mockResolvedValueOnce([
				{ column_name: 'qdrant_id' },
				{ column_name: 'content' },
				{ column_name: 'cluster_summary' },
				{ column_name: 'summary_embedding' },
				{ column_name: 'signature_embedding' },
			]);
		GET = (await import('../../src/routes/api/codebase-index/orchestrate/+server.js')).GET;
	});

	it('returns status with a healthy pgMirror contract', async () => {
		const eventFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = String(input);
			if (path === 'http://localhost:6333/collections/codebase_chunks_768') {
				return makeJsonResponse({
					result: {
						points_count: 16626,
						vectors_count: 0,
						status: 'green',
					},
				});
			}

			if (path === 'http://localhost:6333/collections/codebase_chunks_768/points/scroll') {
				expect(init?.method).toBe('POST');
				return makeJsonResponse({
					result: {
						points: [
							{ payload: { tags: ['api-route'] } },
							{ payload: { tags: [] } },
						],
					},
				});
			}

			throw new Error(`Unexpected forwarded fetch: ${path}`);
		}) as unknown as typeof fetch;

		const res = await GET(makeGetEvent('http://localhost/api/codebase-index/orchestrate', { fetch: eventFetch }) as never);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toMatchObject({
			endpoint: '/api/codebase-index/orchestrate',
			pgMirror: {
				table: 'codebase_chunk_index',
				healthy: true,
				exists: true,
				missingColumns: [],
				error: null,
			},
			tagCoverage: {
				total: 2,
				tagged: 1,
				pct: 50,
			},
			cuda: true,
		});

		expect(mockDbExecute).toHaveBeenCalledTimes(2);
		expect(eventFetch).toHaveBeenCalledTimes(2);
	});
});

describe('POST /api/codebase-index/orchestrate', () => {
	let POST: (typeof import('../../src/routes/api/codebase-index/orchestrate/+server.js'))['POST'];

	beforeEach(async () => {
		vi.clearAllMocks();
		mockCuda.mockReturnValue(true);
		mockReaddir.mockResolvedValue([makeFileEntry('+server.ts')]);
		mockChunkFiles.mockReturnValue([makeChunk()]);
		mockIndexChunks.mockResolvedValue({
			chunksProcessed: 1,
			embeddingsGenerated: 2,
			storedInQdrant: 1,
			failed: 0,
			durationMs: 12,
		});
		mockIndexChunksIncremental.mockResolvedValue({
			chunksProcessed: 1,
			embeddingsGenerated: 0,
			storedInQdrant: 0,
			failed: 0,
			skippedExisting: 1,
			durationMs: 3,
		});
		mockRedisGet.mockResolvedValue('job-latest-1');
		mockRedisSetex.mockResolvedValue('OK');
		POST = (await import('../../src/routes/api/codebase-index/orchestrate/+server.js')).POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST(makePostEvent({}, { authenticated: false }) as never);
		expect(res.status).toBe(401);
	});

	it('returns 400 when clusterRange is invalid', async () => {
		const res = await POST(makePostEvent({ clusterRange: 'bad-range' }) as never);
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({ error: 'Invalid clusterRange segment: bad-range' });
	});

	it('returns the async job contract via the existing wiki index path', async () => {
		const eventFetch = vi.fn(async (input: RequestInfo | URL) => {
			expect(String(input)).toBe('/api/codebase/wiki/index');
			return makeJsonResponse({
				success: true,
				jobId: 'job-123',
				backend: 'rabbitmq',
				message: 'Indexing queued via RabbitMQ',
			});
		}) as unknown as typeof fetch;

		const res = await POST(makePostEvent({ mode: 'async', scope: 'routes', incremental: true }, { fetch: eventFetch }) as never);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toMatchObject({
			success: true,
			mode: 'async',
			scope: 'routes',
			incremental: true,
			jobId: 'job-123',
			backend: 'rabbitmq',
			statusPath: '/api/codebase-index/orchestrate?jobId=job-123',
		});
	});

	it('streams the default core sync pipeline and skips heavy graph stages by default', async () => {
		const eventFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = String(input);
			if (path.startsWith('/api/codebase-index/cluster-assign')) {
				expect(path).toContain('dryRun=false');
				expect(init?.method).toBe('POST');
				return makeSseResponse([
					{ event: 'complete', data: { stage: 4, chunks: 10, updated: 10, k: 4, dryRun: false, totalMs: 25 } },
				]);
			}

			if (path.startsWith('/api/codebase-index/index-stream')) {
				expect(path).toContain('dryRun=false');
				return makeSseResponse([
					{ event: 'complete', data: { stage: 7, clusterId: 0, totalMs: 18 } },
				]);
			}

			if (path === '/api/codebase-index/karpathy-tag/gpu') {
				const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
				expect(payload.dryRun).toBe(false);
				return makeSseResponse([
					{
						event: 'complete',
						data: {
							stage: 3,
							totalProcessed: 50,
							totalTagged: 46,
							totalSkipped: 4,
							totalNoVector: 0,
							batches: 1,
							dryRun: false,
							forceRetag: false,
							threshold: 0.35,
							maxTags: 4,
							cuda: true,
							tagDist: { 'api-route': 46 },
							totalMs: 120,
							msPerChunk: 2.4,
						},
					},
				]);
			}

			throw new Error(`Unexpected forwarded fetch: ${path}`);
		}) as unknown as typeof fetch;

		const res = await POST(
			makePostEvent({ scope: 'routes', indexFileLimit: 1, clusterCount: 4, clusterRange: '0-0' }, { fetch: eventFetch }) as never,
		);
		expect(res.status).toBe(200);

		const text = await res.text();
		const events = parseSseText(text);
		const eventNames = events.map((event) => event.event);
		const started = events.find((event) => event.event === 'started');

		expect(eventNames).toContain('started');
		expect(eventNames).toContain('scan_done');
		expect(eventNames).toContain('chunk_done');
		expect(eventNames).toContain('embed_done');
		expect(eventNames).toContain('cluster_done');
		expect(eventNames).toContain('summary_done');
		expect(eventNames).toContain('tag_done');
		expect(eventNames).toContain('complete');
		expect(eventNames.at(-1)).toBe('complete');

		expect(started?.data).toMatchObject({
			mode: 'sync',
			runIndexing: true,
			dryRun: false,
			somTopology: false,
			neo4jSync: false,
			pageRank: false,
		});

		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ event: 'stage', data: expect.objectContaining({ stage: 'som_topology', step: 'skipped' }) }),
				expect.objectContaining({ event: 'stage', data: expect.objectContaining({ stage: 'neo4j_sync', step: 'skipped' }) }),
				expect.objectContaining({ event: 'stage', data: expect.objectContaining({ stage: 'pagerank', step: 'skipped' }) }),
			]),
		);

		const complete = events.find((event) => event.event === 'complete');
		expect(complete?.data.completedStages).toEqual(expect.arrayContaining(['ast_embed', 'cluster_assign', 'summarize', 'tag']));
		expect(complete?.data.cuda).toBe(true);

		expect(mockChunkFiles).toHaveBeenCalledTimes(1);
		expect(mockIndexChunks).toHaveBeenCalledTimes(1);
		expect(eventFetch).not.toHaveBeenCalledWith('/api/codebase/wiki/index', expect.anything());
	});

	it('streams the full dry-run core contract with simulated stage completion events', async () => {
		const eventFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = String(input);
			if (path.startsWith('/api/codebase-index/cluster-assign')) {
				expect(path).toContain('dryRun=true');
				return makeSseResponse([
					{ event: 'complete', data: { stage: 4, chunks: 10, updated: 0, k: 4, dryRun: true, simulated: true, totalMs: 25 } },
				]);
			}

			if (path.startsWith('/api/codebase-index/index-stream')) {
				expect(path).toContain('dryRun=true');
				return makeSseResponse([
					{ event: 'complete', data: { stage: 7, clusterId: 0, dryRun: true, simulated: true, totalMs: 18 } },
				]);
			}

			if (path === '/api/codebase-index/karpathy-tag/gpu') {
				const payload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
				expect(payload.dryRun).toBe(true);
				return makeSseResponse([
					{
						event: 'complete',
						data: {
							stage: 3,
							totalProcessed: 25,
							totalTagged: 25,
							dryRun: true,
							simulated: true,
							totalMs: 90,
						},
					},
				]);
			}

			throw new Error(`Unexpected forwarded fetch: ${path}`);
		}) as unknown as typeof fetch;

		const res = await POST(
			makePostEvent({ scope: 'routes', indexFileLimit: 1, clusterCount: 4, clusterRange: '0-0', dryRun: true }, { fetch: eventFetch }) as never,
		);
		expect(res.status).toBe(200);

		const text = await res.text();
		const events = parseSseText(text);
		const eventNames = events.map((event) => event.event);
		const started = events.find((event) => event.event === 'started');
		const embedDone = events.find((event) => event.event === 'embed_done');
		const complete = events.find((event) => event.event === 'complete');

		expect(eventNames).toContain('started');
		expect(eventNames).toContain('scan_done');
		expect(eventNames).toContain('chunk_done');
		expect(eventNames).toContain('embed_done');
		expect(eventNames).toContain('cluster_done');
		expect(eventNames).toContain('summary_done');
		expect(eventNames).toContain('tag_done');
		expect(eventNames).toContain('complete');
		expect(eventNames.at(-1)).toBe('complete');

		expect(started?.data).toMatchObject({
			mode: 'sync',
			runIndexing: true,
			dryRun: true,
			somTopology: false,
			neo4jSync: false,
			pageRank: false,
		});

		expect(embedDone?.data).toMatchObject({
			dryRun: true,
			simulated: true,
			executed: false,
			skippedWrites: true,
			filesProcessed: 1,
			chunksProcessed: 1,
			embeddingsGenerated: 0,
			storedInQdrant: 0,
		});

		expect(complete?.data.completedStages).toEqual(['ast_embed', 'cluster_assign', 'summarize', 'tag']);
		expect(complete?.data.simulatedStages).toEqual(['ast_embed', 'cluster_assign', 'summarize', 'tag']);
		expect(complete?.data.dryRun).toBe(true);

		expect(mockChunkFiles).toHaveBeenCalledTimes(1);
		expect(mockIndexChunks).not.toHaveBeenCalled();
		expect(mockIndexChunksIncremental).not.toHaveBeenCalled();
	});

	it('does not reintroduce route-level trace helpers', () => {
		const source = readFileSync(
			new URL('../../src/routes/api/codebase-index/orchestrate/+server.ts', import.meta.url),
			'utf8',
		);

		expect(source).not.toMatch(/traceLLM|traceRAG/);
	});

	it('uses incremental indexing (skips existing embeddings) on re-run', async () => {
		const eventFetch = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path.startsWith('/api/codebase-index/cluster-assign')) {
				return makeSseResponse([
					{ event: 'complete', data: { stage: 4, chunks: 10, updated: 10, k: 4, dryRun: false, totalMs: 15 } },
				]);
			}
			if (path === '/api/codebase-index/karpathy-tag/gpu') {
				return makeSseResponse([
					{ event: 'complete', data: { stage: 3, totalProcessed: 50, totalTagged: 46, totalMs: 90 } },
				]);
			}
			throw new Error(`Unexpected forwarded fetch: ${path}`);
		}) as unknown as typeof fetch;

		const res = await POST(
			makePostEvent(
				{ scope: 'routes', indexFileLimit: 1, clusterCount: 4, clusterRange: '0-0', incremental: true, summarize: false },
				{ fetch: eventFetch },
			) as never,
		);
		expect(res.status).toBe(200);

		const text = await res.text();
		const events = parseSseText(text);
		const embedDone = events.find((e) => e.event === 'embed_done');

		expect(embedDone).toBeDefined();
		expect(embedDone?.data.incremental).toBe(true);
		expect(embedDone?.data.skippedExisting).toBe(1);
		expect(embedDone?.data.embeddingsGenerated).toBe(0);

		// Should use incremental, NOT full indexChunks
		expect(mockIndexChunksIncremental).toHaveBeenCalledTimes(1);
		expect(mockIndexChunks).not.toHaveBeenCalled();

		const complete = events.find((e) => e.event === 'complete');
		expect(complete?.data.completedStages).toContain('ast_embed');
	});

	it('resumes a run by skipping cached stages and emitting step=cached events', async () => {
		const checkpoint = (stage: string, durationMs = 500) => JSON.stringify({
			stage,
			result: { stage, simulated: false, totalMs: durationMs },
			completedAt: '2026-04-19T12:00:00.000Z',
			durationMs,
		});

		// Return cached checkpoints for checkpoint keys, null otherwise
		mockRedisGet.mockImplementation(async (key: string) => {
			if (key === 'orchestrate:run:test-resume:ast_embed') return checkpoint('ast_embed', 1200);
			if (key === 'orchestrate:run:test-resume:cluster_assign') return checkpoint('cluster_assign', 800);
			if (key === 'orchestrate:run:test-resume:som_topology') return checkpoint('som_topology', 3500);
			return null;
		});

		// No eventFetch calls expected — all active stages are cached, optional stages disabled
		const eventFetch = vi.fn(async () => {
			throw new Error('No fetch calls expected during fully-cached resume');
		}) as unknown as typeof fetch;

		const res = await POST(
			makePostEvent(
				{
					scope: 'routes',
					indexFileLimit: 1,
					clusterCount: 4,
					clusterRange: '0-0',
					runId: 'test-resume',
					resume: true,
					somTopology: true,
					summarize: false,
					gpuTag: false,
				},
				{ fetch: eventFetch },
			) as never,
		);
		expect(res.status).toBe(200);

		const text = await res.text();
		const events = parseSseText(text);
		const eventNames = events.map((e) => e.event);

		// started event carries cached stage list
		const started = events.find((e) => e.event === 'started');
		expect(started?.data.runId).toBe('test-resume');
		expect(started?.data.resume).toBe(true);
		expect(started?.data.cachedStages).toEqual(
			expect.arrayContaining(['ast_embed', 'cluster_assign', 'som_topology']),
		);

		// Each cached stage emits a stage event with step=cached
		const cachedStageEvents = events.filter(
			(e) => e.event === 'stage' && e.data.step === 'cached',
		);
		const cachedStageNames = cachedStageEvents.map((e) => e.data.stage);
		expect(cachedStageNames).toContain('ast_embed');
		expect(cachedStageNames).toContain('cluster_assign');
		expect(cachedStageNames).toContain('som_topology');

		// Cached SOM stage also emits som_done with cached result
		const somDone = events.find((e) => e.event === 'som_done');
		expect(somDone?.data.stage).toBe('som_topology');

		// complete event lists all as completed + resumed
		expect(eventNames).toContain('complete');
		const complete = events.find((e) => e.event === 'complete');
		expect(complete?.data.completedStages).toEqual(
			expect.arrayContaining(['ast_embed', 'cluster_assign', 'som_topology']),
		);
		expect(complete?.data.resumedStages).toEqual(
			expect.arrayContaining(['ast_embed', 'cluster_assign', 'som_topology']),
		);
		expect(complete?.data.runId).toBe('test-resume');

		// setex was called to persist run metadata
		expect(mockRedisSetex).toHaveBeenCalled();

		// No sub-endpoint fetches were made (everything came from cache)
		expect(eventFetch).not.toHaveBeenCalled();
	});

	it('retries cleanly after a cancelled run', async () => {
		// Simulate a fresh run after a prior cancellation —
		// all mocks reset in beforeEach, so this tests the clean-slate path
		const eventFetch = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path.startsWith('/api/codebase-index/cluster-assign')) {
				return makeSseResponse([
					{ event: 'complete', data: { stage: 4, chunks: 1, updated: 1, k: 4, dryRun: false, totalMs: 5 } },
				]);
			}
			if (path.startsWith('/api/codebase-index/index-stream')) {
				return makeSseResponse([
					{ event: 'complete', data: { stage: 7, clusterId: 0, totalMs: 8 } },
				]);
			}
			if (path === '/api/codebase-index/karpathy-tag/gpu') {
				return makeSseResponse([
					{ event: 'complete', data: { totalMs: 20 } },
				]);
			}
			throw new Error(`Unexpected forwarded fetch: ${path}`);
		}) as unknown as typeof fetch;

		const res = await POST(
			makePostEvent({ scope: 'routes', indexFileLimit: 1, clusterCount: 4, clusterRange: '0-0' }, { fetch: eventFetch }) as never,
		);
		expect(res.status).toBe(200);

		const text = await res.text();
		const events = parseSseText(text);
		const complete = events.find((e) => e.event === 'complete');
		expect(complete).toBeDefined();
		expect(complete?.data.completedStages).toEqual(expect.arrayContaining(['ast_embed', 'cluster_assign']));
		expect(events.find((e) => e.event === 'failed')).toBeUndefined();
	});
});