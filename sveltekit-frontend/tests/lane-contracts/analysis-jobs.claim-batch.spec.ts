import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute, sqlTag, pgRows } = vi.hoisted(() => ({
	execute: vi.fn(),
	sqlTag: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
	pgRows: vi.fn((result: unknown) => {
		if (Array.isArray(result)) return result;
		return (result as { rows?: unknown[] } | null)?.rows ?? [];
	}),
}));

vi.mock('$lib/server/db/client', () => ({ db: { execute }, pgRows }));
vi.mock('$lib/server/db/client.js', () => ({ db: { execute }, pgRows }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	analysisJobs: { id: 'id', evidenceId: 'evidence_id' },
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn(),
	sql: sqlTag,
}));

describe('analysis job batch claiming boundary', () => {
	beforeEach(() => {
		execute.mockReset();
		sqlTag.mockClear();
		pgRows.mockClear();
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])(
		'does not query or claim for invalid/non-positive capacity (%s)',
		async (limit) => {
			const { claimBatch } = await import('../../src/lib/server/analysis/analysis-jobs.js');

			await expect(claimBatch('entity_extraction', limit)).resolves.toEqual([]);
			expect(execute).not.toHaveBeenCalled();
		}
	);

	it('claims at most the four free slots in one SQL execution', async () => {
	execute.mockResolvedValue({
		rows: Array.from({ length: 4 }, (_, index) => ({
			id: `job-${index + 1}`,
			evidence_id: `evidence-${index + 1}`,
			case_id: null,
			job_type: 'entity_extraction',
			result: {},
		})),
	});
	const { claimBatch } = await import('../../src/lib/server/analysis/analysis-jobs.js');

	const jobs = await claimBatch('entity_extraction', 4);

	expect(jobs).toHaveLength(4);
	expect(jobs.map((job) => job.id)).toEqual(['job-1', 'job-2', 'job-3', 'job-4']);
	expect(execute).toHaveBeenCalledTimes(1);
	const statement = execute.mock.calls[0]?.[0] as { values?: unknown[] } | undefined;
	expect(statement?.values).toContain(4);
	});
});
