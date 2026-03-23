import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockEq = vi.fn(() => 'eq-clause');

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: mockSelect,
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	evidence: {
		id: 'id',
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: mockEq,
	sql: vi.fn(() => 'sql-fragment'),
}));

describe('/api/evidence/[id] GET route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 404 when the evidence row does not exist', async () => {
		mockLimit.mockResolvedValueOnce([]);

		const { GET } = await import('../src/routes/api/evidence/[id]/+server.js');

		const response = await GET({
			params: { id: 'missing-evidence' },
		} as never);

		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({ error: 'Evidence not found' });
	});

	it('parses stringified metadata so diagnostics are returned as JSON', async () => {
		mockLimit.mockResolvedValueOnce([
			{
				id: 'evidence-1',
				title: 'Processing log',
				metadata: JSON.stringify({
					processingDiagnostics: {
						startedAt: '2026-03-22T10:00:00.000Z',
						stages: {
							extraction: {
								status: 'success',
								detail: 'Text extracted',
							},
						},
						warnings: [],
					},
				}),
			},
		]);

		const { GET } = await import('../src/routes/api/evidence/[id]/+server.js');

		const response = await GET({
			params: { id: 'evidence-1' },
		} as never);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.metadata).toEqual({
			processingDiagnostics: {
				startedAt: '2026-03-22T10:00:00.000Z',
				stages: {
					extraction: {
						status: 'success',
						detail: 'Text extracted',
					},
				},
				warnings: [],
			},
		});
		expect(mockEq).toHaveBeenCalled();
	});

	it('leaves invalid metadata strings unchanged instead of throwing', async () => {
		mockLimit.mockResolvedValueOnce([
			{
				id: 'evidence-2',
				title: 'Corrupt metadata payload',
				metadata: '{not-valid-json',
			},
		]);

		const { GET } = await import('../src/routes/api/evidence/[id]/+server.js');

		const response = await GET({
			params: { id: 'evidence-2' },
		} as never);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.metadata).toBe('{not-valid-json');
	});
});