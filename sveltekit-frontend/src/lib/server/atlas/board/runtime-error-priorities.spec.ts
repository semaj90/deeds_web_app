import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));

import { loadRuntimeErrorPriorities } from './runtime-error-priorities.js';

describe('runtime error priority projection', () => {
	beforeEach(() => query.mockReset());

	it('returns deterministic top-10 and top-100 views without writing tasks', async () => {
		query.mockResolvedValue({
			rows: Array.from({ length: 100 }, (_, index) => ({
				fingerprint: `fingerprint-${index}`,
				source: index % 2 === 0 ? 'error_events' : 'error_logs',
				route_path: `/route/${index}`,
				kind: 'runtime',
				severity: 'error',
				message: `error ${index}`,
				occurrences: 100 - index,
				last_seen: '2026-10-18T00:00:00.000Z',
				priority_score: 100 - index,
				total_count: 245,
			})),
		});

		const report = await loadRuntimeErrorPriorities();

		expect(report.status).toBe('AVAILABLE');
		expect(report.total).toBe(245);
		expect(report.top10).toHaveLength(10);
		expect(report.top100).toHaveLength(100);
		expect(report.top10[0]?.fingerprint).toBe('fingerprint-0');
		expect(report.top10[1]?.source).toBe('error_logs');
		expect(report.top100[99]?.priorityScore).toBe(1);
		expect(query).toHaveBeenCalledTimes(1);
		expect(query.mock.calls[0]?.[0]).toContain('FROM error_logs');
		expect(query.mock.calls[0]?.[0]).toContain("AND resolved = false");
		expect(query.mock.calls[0]?.[0]).toContain("WHEN 'warning' THEN 'warn'");
	});

	it('fails closed to an unavailable empty diagnostic lane', async () => {
		query.mockRejectedValue(new Error('database unavailable'));

		await expect(loadRuntimeErrorPriorities()).resolves.toEqual({
			status: 'UNAVAILABLE',
			total: 0,
			top10: [],
			top100: [],
		});
	});
});
