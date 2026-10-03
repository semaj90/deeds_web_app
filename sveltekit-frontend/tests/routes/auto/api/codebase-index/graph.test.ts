// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({ ENV: { QDRANT_URL: 'http://qdrant.test' } }));
vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
	fastJsonParse: (value: string) => JSON.parse(value)
}));

type GraphEvent = {
	request: Request;
	locals: Record<string, unknown>;
	url: URL;
	params: Record<string, string>;
	fetch: typeof fetch;
};

type GraphResponse = {
	nodes: Array<{ id: string; path: string; type: string }>;
	edges: Array<{ source: string; target: string; type: string }>;
	degraded: boolean;
	error: { code: string } | null;
	stats: {
		totalFiles: number;
		totalChunks: number;
		totalDirs: number;
		importEdges: number;
		scannedPoints: number;
		skippedInvalidPayload: number;
		skippedMissingFilePath: number;
		skippedOutOfScope: number;
		skippedFileLimit: number;
		truncatedContentFiles: number;
		pagesFetched: number;
		upstreamResponseBytes: number;
		truncated: boolean;
	};
};

describe('GET /api/codebase-index/graph', () => {
	let handler: (event: GraphEvent) => Promise<Response>;

	beforeEach(async () => {
		vi.resetAllMocks();
		const route = await import('../../../../../src/routes/api/codebase-index/graph/+server.js');
		handler = route.GET as typeof handler;
	});

	function makeEvent(path: string, upstreamFetch: typeof fetch): GraphEvent {
		return {
			request: new Request(`http://localhost${path}`),
			locals: { user: { id: 'test-user' } },
			url: new URL(`http://localhost${path}`),
			params: {},
			fetch: upstreamFetch
		};
	}

	async function responseBody(response: Response): Promise<GraphResponse> {
		return (await response.json()) as GraphResponse;
	}

	function expectStableShape(body: GraphResponse) {
		expect(Object.keys(body).sort()).toEqual(['degraded', 'edges', 'error', 'nodes', 'stats']);
		expect(Object.keys(body.stats)).toEqual([
			'totalFiles',
			'totalChunks',
			'totalDirs',
			'importEdges',
			'extensionBreakdown',
			'domainBreakdown',
			'scannedPoints',
			'skippedInvalidPayload',
			'skippedMissingFilePath',
			'skippedOutOfScope',
			'skippedFileLimit',
			'truncatedContentFiles',
			'pagesFetched',
			'upstreamResponseBytes',
			'truncated'
		]);
	}

	it('returns a stable unauthorized envelope without querying Qdrant', async () => {
		const upstreamFetch = vi.fn();
		const event = makeEvent('/api/codebase-index/graph', upstreamFetch as typeof fetch);
		event.locals = {};

		const response = await handler(event);
		const body = await responseBody(response);

		expect(response.status).toBe(401);
		expectStableShape(body);
		expect(body.error?.code).toBe('GRAPH_UNAUTHORIZED');
		expect(body.nodes).toEqual([]);
		expect(upstreamFetch).not.toHaveBeenCalled();
	});

	it('rejects malformed scope and numeric query values before the upstream call', async () => {
		const upstreamFetch = vi.fn();
		const response = await handler(
			makeEvent('/api/codebase-index/graph?maxFiles=nope', upstreamFetch as typeof fetch)
		);
		const body = await responseBody(response);

		expect(response.status).toBe(400);
		expectStableShape(body);
		expect(body.error?.code).toBe('GRAPH_INVALID_QUERY');
		expect(upstreamFetch).not.toHaveBeenCalled();

		const unsafeDirectory = await handler(
			makeEvent('/api/codebase-index/graph?dir=..%2Fsecrets', upstreamFetch as typeof fetch)
		);
		expect(unsafeDirectory.status).toBe(400);
	});

	it('pages within the point budget, applies directory scope, and rejects malformed payload paths', async () => {
		const pages = [
			{
				result: {
					points: [{ id: 1, payload: { file_path: 'routes/elsewhere.ts', extension: 'ts' } }],
					next_page_offset: 'page-2'
				}
			},
			{
				result: {
					points: [
						{ id: 2, payload: null },
						{ id: 3, payload: { file_path: 42 } },
						{
							id: 4,
							payload: {
								file_path: 'routes/app/+page.ts',
								extension: 'ts',
								domain: 'app',
								content: "import { helper } from './lib';"
							}
						},
						{
							id: 5,
							payload: { file_path: 'routes/app/lib.ts', extension: 'ts', domain: 'app', content: '' }
						}
					]
				}
			}
		];
		const upstreamFetch = vi.fn(async () => new Response(JSON.stringify(pages.shift()), { status: 200 }));
		const response = await handler(
			makeEvent(
				'/api/codebase-index/graph?dir=routes%2Fapp&maxFiles=2&maxPoints=5',
				upstreamFetch as typeof fetch
			)
		);
		const body = await responseBody(response);

		expect(response.status).toBe(200);
		expectStableShape(body);
		expect(body.error).toBeNull();
		expect(body.degraded).toBe(false);
		expect(body.stats.totalFiles).toBe(2);
		expect(body.stats.totalChunks).toBe(2);
		expect(body.stats.scannedPoints).toBe(5);
		expect(body.stats.skippedOutOfScope).toBe(1);
		expect(body.stats.skippedInvalidPayload).toBe(1);
		expect(body.stats.skippedMissingFilePath).toBe(1);
		expect(body.stats.importEdges).toBe(1);
		expect(body.edges).toContainEqual({
			source: 'file:routes/app/+page.ts',
			target: 'file:routes/app/lib.ts',
			type: 'imports',
			weight: 1
		});
		expect(upstreamFetch).toHaveBeenCalledTimes(2);
		const firstRequest = JSON.parse(String(upstreamFetch.mock.calls[0][1]?.body));
		const secondRequest = JSON.parse(String(upstreamFetch.mock.calls[1][1]?.body));
		expect(firstRequest.limit).toBe(5);
		expect(secondRequest.limit).toBe(4);
		expect(secondRequest.offset).toBe('page-2');
	});

	it('caps unique files and marks the partial graph as truncated', async () => {
		const upstreamFetch = vi.fn(async () =>
			new Response(
				JSON.stringify({
					result: {
						points: [
							{ payload: { file_path: 'src/a.ts', extension: 'ts' } },
							{ payload: { file_path: 'src/b.ts', extension: 'ts' } }
						],
						next_page_offset: 'next'
					}
				}),
				{ status: 200 }
			)
		);
		const response = await handler(
			makeEvent('/api/codebase-index/graph?maxFiles=1&maxPoints=10', upstreamFetch as typeof fetch)
		);
		const body = await responseBody(response);

		expect(response.status).toBe(200);
		expect(body.stats.totalFiles).toBe(1);
		expect(body.stats.skippedFileLimit).toBe(1);
		expect(body.stats.truncated).toBe(true);
		expect(body.degraded).toBe(true);
	});

	it('hard caps requested unique files at 500', async () => {
		let page = 0;
		const upstreamFetch = vi.fn(async () => {
			const currentPage = page++;
			return new Response(
				JSON.stringify({
					result: {
						points: Array.from({ length: 100 }, (_, index) => ({
							payload: { file_path: `src/file-${currentPage * 100 + index}.ts` }
						})),
						next_page_offset: currentPage < 5 ? `page-${currentPage + 1}` : undefined
					}
				}),
				{ status: 200 }
			);
		});
		const response = await handler(
			makeEvent('/api/codebase-index/graph?maxFiles=501&maxPoints=1000', upstreamFetch as typeof fetch)
		);
		const body = await responseBody(response);

		expect(response.status).toBe(200);
		expect(body.stats.totalFiles).toBe(500);
		expect(body.stats.pagesFetched).toBe(5);
		expect(body.stats.truncated).toBe(true);
	});

	it('returns a non-200 stable envelope when Qdrant fails', async () => {
		const upstreamFetch = vi.fn(async () => new Response('unavailable', { status: 503 }));
		const response = await handler(
			makeEvent('/api/codebase-index/graph', upstreamFetch as typeof fetch)
		);
		const body = await responseBody(response);

		expect(response.status).toBe(502);
		expectStableShape(body);
		expect(body.error?.code).toBe('QDRANT_UPSTREAM_FAILED');
		expect(body.degraded).toBe(true);
	});

	it('reports parsing failures as server errors instead of successful empty graphs', async () => {
		const upstreamFetch = vi.fn(async () => new Response('not-json', { status: 200 }));
		const response = await handler(
			makeEvent('/api/codebase-index/graph', upstreamFetch as typeof fetch)
		);
		const body = await responseBody(response);

		expect(response.status).toBe(500);
		expectStableShape(body);
		expect(body.error?.code).toBe('GRAPH_GENERATION_FAILED');
		expect(body.degraded).toBe(true);
	});

	it('keeps repeated bounded graph requests within fixture budgets and reports memory observations', async () => {
		const memoryBefore = process.memoryUsage();
		let pageCursor = 0;
		let requests = 0;
		const upstreamFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			requests++;
			const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(requestBody.with_payload).toEqual(['file_path', 'extension', 'domain']);
			expect(requestBody.limit).toBe(100);
			const page = pageCursor++ % 10;
			const points = Array.from({ length: 100 }, (_, pointIndex) => {
				const fileOrdinal = (page * 100 + pointIndex) % 100;
				return {
					id: `${page}-${pointIndex}`,
					payload: {
						file_path: `routes/app/file-${fileOrdinal}.ts`,
						extension: 'ts',
						domain: 'app'
					}
				};
			});
			return new Response(
				JSON.stringify({
					result: {
						points,
						next_page_offset: page < 9 ? `page-${page + 1}` : undefined
					}
				}),
				{ status: 200 }
			);
		});

		let measuredResponseBytes = 0;
		for (let iteration = 0; iteration < 20; iteration++) {
			pageCursor = 0;
			const response = await handler(
				makeEvent(
					'/api/codebase-index/graph?dir=routes%2Fapp&maxFiles=200&maxPoints=1000&includeImports=false',
					upstreamFetch as typeof fetch
				)
			);
			const body = await responseBody(response);
			expect(response.status).toBe(200);
			expect(body.stats.totalFiles).toBe(100);
			expect(body.stats.scannedPoints).toBe(1000);
			expect(body.stats.pagesFetched).toBe(10);
			expect(body.stats.upstreamResponseBytes).toBeGreaterThan(0);
			expect(body.stats.upstreamResponseBytes).toBeLessThan(8 * 1024 * 1024);
			expect(body.stats.importEdges).toBe(0);
			measuredResponseBytes += body.stats.upstreamResponseBytes;
		}
		const memoryAfter = process.memoryUsage();
		expect(requests).toBe(200);
		expect(Number.isFinite(memoryBefore.rss + memoryAfter.rss)).toBe(true);
		console.info(
			JSON.stringify({
				kind: 'GRAPH_API_REPEATED_REQUEST_MEMORY_OBSERVATION',
				iterations: 20,
				requests,
				pagesPerRequest: 10,
				pointsPerRequest: 1000,
				uniqueFilesPerRequest: 100,
				upstreamResponseBytesTotal: measuredResponseBytes,
				rssBefore: memoryBefore.rss,
				rssAfter: memoryAfter.rss,
				heapUsedBefore: memoryBefore.heapUsed,
				heapUsedAfter: memoryAfter.heapUsed,
				fixtureOnly: true
			})
		);
	});
});
