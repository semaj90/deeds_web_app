// @vitest-environment node
/**
 * /api/analytics/web-research job contract tests
 *
 * Covers the deferred background path:
 *   - POST returns jobId + queued status
 *   - polling surfaces queued -> running -> completed
 *   - failed jobs keep the same stable shape
 *   - missing/expired jobs return a non-null terminal job object
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockCrawlWebResearch,
	mockCrawlLegalCorpus,
	mockInvalidateWebResearchCache,
	mockInvalidateCorpusCache,
	mockRedisGet,
	mockRedisSet,
} = vi.hoisted(() => ({
	mockCrawlWebResearch: vi.fn(),
	mockCrawlLegalCorpus: vi.fn(),
	mockInvalidateWebResearchCache: vi.fn(),
	mockInvalidateCorpusCache: vi.fn(),
	mockRedisGet: vi.fn(),
	mockRedisSet: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/analytics/web-research-crawler.js', () => ({
	crawlWebResearch: (...args: unknown[]) => mockCrawlWebResearch(...args),
	queryWebResearchIndex: vi.fn(),
	getWebResearchStats: vi.fn(),
	invalidateWebResearchCache: (...args: unknown[]) => mockInvalidateWebResearchCache(...args),
	crawlLegalCorpus: (...args: unknown[]) => mockCrawlLegalCorpus(...args),
	queryCorpusIndex: vi.fn(),
	getCorpusSearchStats: vi.fn(),
	invalidateCorpusCache: (...args: unknown[]) => mockInvalidateCorpusCache(...args),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: (...args: unknown[]) => mockRedisGet(...args),
		set: (...args: unknown[]) => mockRedisSet(...args),
	}),
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makePostEvent(body: Record<string, unknown>) {
	return {
		request: new Request('http://localhost/api/analytics/web-research', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user: { id: 'user-1' } },
	};
}

function makeGetEvent(jobId?: string) {
	const url = jobId
		? `http://localhost/api/analytics/web-research?jobId=${encodeURIComponent(jobId)}`
		: 'http://localhost/api/analytics/web-research';
	return {
		url: new URL(url),
		request: new Request(url),
		locals: { user: { id: 'user-1' } },
	};
}

async function tick() {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('/api/analytics/web-research job contract', () => {
	let POST: (typeof import('../../src/routes/api/analytics/web-research/+server.js'))['POST'];
	let GET: (typeof import('../../src/routes/api/analytics/web-research/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		mockRedisGet.mockResolvedValue(null);
		mockRedisSet.mockResolvedValue('OK');
		const mod = await import('../../src/routes/api/analytics/web-research/+server.js');
		POST = mod.POST;
		GET = mod.GET;
	});

	it('POST returns jobId and queued status for deferred corpus search', async () => {
		const job = deferred<{ summaries: Array<Record<string, unknown>> }>();
		mockCrawlLegalCorpus.mockReturnValueOnce(job.promise);

		const res = await POST(makePostEvent({
			action: 'corpus-search',
			defer: true,
			selfPrompts: ['res judicata appellate jurisdiction final judgment'],
			pipeline: 'ace',
			maxResults: 3,
		}) as never);

		expect(res.status).toBe(202);
		const body = await res.json() as { jobId: string; status: string };
		expect(typeof body.jobId).toBe('string');
		expect(body.status).toBe('queued');
	});

	it('polling transitions queued -> running -> completed without null job', async () => {
		const job = deferred<{ summaries: Array<Record<string, unknown>> }>();
		mockCrawlLegalCorpus.mockReturnValueOnce(job.promise);

		const postRes = await POST(makePostEvent({
			action: 'corpus-search',
			defer: true,
			selfPrompts: ['legal evidence hearsay'],
			pipeline: 'ace',
			maxResults: 3,
		}) as never);
		const postBody = await postRes.json() as { jobId: string; status: string };
		expect(postBody.status).toBe('queued');

		const queuedRes = await GET(makeGetEvent(postBody.jobId) as never);
		const queuedBody = await queuedRes.json() as { job: { status: string; result: unknown; error: string | null } };
		expect(queuedBody.job).toBeTruthy();
		expect(queuedBody.job.status).toBe('queued');
		expect(queuedBody.job.result).toBeNull();

		await tick();
		const runningRes = await GET(makeGetEvent(postBody.jobId) as never);
		const runningBody = await runningRes.json() as { job: { status: string; result: unknown; error: string | null } };
		expect(runningBody.job.status).toBe('running');
		expect(runningBody.job.result).toBeNull();

		job.resolve({ summaries: [{ id: 'summary-1' }] });
		await tick();

		const completedRes = await GET(makeGetEvent(postBody.jobId) as never);
		const completedBody = await completedRes.json() as {
			job: {
				status: string;
				result: { totalSummaries?: number; source?: string } | null;
				error: string | null;
				batches?: Array<{ summaries: Array<Record<string, unknown>> }>;
			};
		};
		expect(completedBody.job.status).toBe('completed');
		expect(completedBody.job.error).toBeNull();
		expect(completedBody.job.result).not.toBeNull();
		expect(completedBody.job.result?.totalSummaries).toBe(1);
		expect(completedBody.job.batches?.[0]?.summaries).toHaveLength(1);
	});

	it('failed jobs keep a stable job shape with safe error text', async () => {
		mockCrawlLegalCorpus.mockRejectedValueOnce(new Error('upstream boom'));

		const postRes = await POST(makePostEvent({
			action: 'corpus-search',
			defer: true,
			selfPrompts: ['plain language'],
			pipeline: 'ace',
			maxResults: 3,
		}) as never);
		const postBody = await postRes.json() as { jobId: string };

		await tick();
		const failedRes = await GET(makeGetEvent(postBody.jobId) as never);
		const failedBody = await failedRes.json() as { job: { status: string; result: unknown; error: string | null; message: string } };
		expect(failedBody.job.status).toBe('failed');
		expect(failedBody.job.result).toBeNull();
		expect(failedBody.job.error).toBe('Research job failed');
		expect(failedBody.job.message).toBe('Research job failed');
	});

	it('missing jobs return a terminal timed_out job object instead of null', async () => {
		const res = await GET(makeGetEvent('00000000-dead-beef-cafe-000000000000') as never);
		expect(res.status).toBe(200);
		const body = await res.json() as { job: { status: string; result: unknown; error: string | null; message: string } };
		expect(body.job).toBeTruthy();
		expect(body.job.status).toBe('timed_out');
		expect(body.job.result).toBeNull();
		expect(body.job.error).toBe('Job expired or is no longer available');
	});
});