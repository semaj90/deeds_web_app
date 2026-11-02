// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const evidenceRow = {
		id: '123e4567-e89b-42d3-a456-426614174000',
		caseId: null,
		fileUrl: 'minio://legal-evidence/evidence/7/source.pdf',
		fileName: 'source.pdf',
		contentType: 'application/pdf',
		sourceSha256: `sha256:${'a'.repeat(64)}`,
		uploadedBy: 7,
		userId: 7,
	};
	const limit = vi.fn();
	const query = {
		from: vi.fn(),
		leftJoin: vi.fn(),
		where: vi.fn(),
		limit,
	};
	for (const method of ['from', 'leftJoin', 'where'] as const) query[method].mockReturnValue(query);
	const insertReturning = vi.fn();
	const insertValues = vi.fn(() => ({ returning: insertReturning }));
	const tx = {
		select: vi.fn(() => query),
		insert: vi.fn(() => ({ values: insertValues })),
		execute: vi.fn(),
	};
	const db = { transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
	return { evidenceRow, limit, query, insertReturning, insertValues, tx, db };
});

vi.mock('$lib/server/db/client.js', () => ({ db: mocks.db }));
vi.mock('$lib/server/auth-helpers.js', () => ({ requireAuth: async () => ({ user: { id: '7' } }) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { RABBITMQ_URL: 'amqp://unused.invalid' } }));

type Handler = (event: {
	request: Request;
	locals: Record<string, unknown>;
	params: Record<string, string>;
}) => Promise<Response>;

describe('autotag evidence trigger durable ownership', () => {
	let post: Handler;
	const makeRequest = () => new Request('http://localhost/api/worker/autotag/trigger', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			type: 'evidence_uploaded',
			evidenceId: mocks.evidenceRow.id,
			action: 'process',
			metadata: { priority: 'medium', trigger: 'manual' },
		}),
	});
	const makeCaseRequest = () => new Request('http://localhost/api/worker/autotag/trigger', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			type: 'case_created',
			caseId: 'case-1',
			action: 'process',
			metadata: { priority: 'medium', trigger: 'manual' },
		}),
	});

	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.query.from.mockReturnValue(mocks.query);
		mocks.query.leftJoin.mockReturnValue(mocks.query);
		mocks.query.where.mockReturnValue(mocks.query);
		mocks.tx.select.mockReturnValue(mocks.query);
		mocks.limit.mockResolvedValueOnce([mocks.evidenceRow]).mockResolvedValueOnce([]);
		mocks.insertReturning.mockResolvedValue([{ id: '223e4567-e89b-42d3-a456-426614174000' }]);
		const route = await import('./+server.js') as unknown as { POST: Handler };
		post = route.POST;
	});

	it('transactionally queues source-bound evidence work in analysis_jobs', async () => {
		const response = await post({ request: makeRequest(), locals: { user: { id: '7' } }, params: {} });
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({
			success: true,
			data: { jobId: '223e4567-e89b-42d3-a456-426614174000', status: 'queued' },
		});
		expect(mocks.db.transaction).toHaveBeenCalledOnce();
		expect(mocks.tx.insert).toHaveBeenCalledOnce();
		expect(mocks.tx.execute).toHaveBeenCalledTimes(2);
	});

	it('reuses an active durable job instead of enqueuing a duplicate', async () => {
		mocks.limit.mockReset().mockResolvedValueOnce([mocks.evidenceRow]).mockResolvedValueOnce([
			{ id: '323e4567-e89b-42d3-a456-426614174000', status: 'running' },
		]);
		const response = await post({ request: makeRequest(), locals: { user: { id: '7' } }, params: {} });
		expect(response.status).toBe(202);
		expect(await response.json()).toMatchObject({
			data: { jobId: '323e4567-e89b-42d3-a456-426614174000', status: 'running' },
		});
		expect(mocks.tx.insert).not.toHaveBeenCalled();
	});

	it('does not acknowledge unsupported RabbitMQ-backed trigger types', async () => {
		const response = await post({ request: makeCaseRequest(), locals: { user: { id: '7' } }, params: {} });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ success: false, error: 'DURABLE_TRIGGER_UNSUPPORTED' });
		expect(mocks.db.transaction).not.toHaveBeenCalled();
	});
});
