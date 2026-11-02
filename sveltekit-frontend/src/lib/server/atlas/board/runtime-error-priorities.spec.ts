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

	it('maps firstAppFrame (null when a group has only dependency frames)', async () => {
		query.mockResolvedValue({
			rows: [
				{ fingerprint: 'a', source: 'error_events', route_path: '/', kind: 'runtime', severity: 'error', message: 'm',
					occurrences: 2, last_seen: '2026-10-18T00:00:00.000Z', priority_score: 3, first_app_frame: 'src/routes/+page.svelte', total_count: 2 },
				{ fingerprint: 'b', source: 'error_events', route_path: '/', kind: 'runtime', severity: 'error', message: 'm',
					occurrences: 1, last_seen: '2026-10-18T00:00:00.000Z', priority_score: 2, first_app_frame: null, total_count: 2 },
			],
		});

		const report = await loadRuntimeErrorPriorities();

		expect(report.top100[0]?.firstAppFrame).toBe('src/routes/+page.svelte');
		expect(report.top100[1]?.firstAppFrame).toBeNull();
	});

	it('extracts the first application-source file (path only) from real stack shapes', async () => {
		query.mockResolvedValue({ rows: [] });
		await loadRuntimeErrorPriorities();
		const sql = String(query.mock.calls[0]?.[0]);
		const pattern = sql.match(/regexp_match\(stack, '([^']+)'\)/)?.[1];
		expect(pattern, 'regexp_match pattern present in both source selects').toBeTruthy();
		expect(sql.match(/regexp_match\(stack,/g)).toHaveLength(2);
		const frame = (stack: string) => new RegExp(pattern!).exec(stack)?.[1] ?? null;

		// browser stack: compiled-module line numbers must not leak into the path
		expect(frame('TypeError: x\n    at Root (http://localhost:5173/src/routes/(app)/demos/+page.svelte:577:17)'))
			.toBe('src/routes/(app)/demos/+page.svelte');
		// Windows server stack
		expect(frame('Error\n    at validate (C:\\Users\\james\\app\\src\\lib\\server\\lucia.ts:12:3)')).toBe('src\\lib\\server\\lucia.ts');
		// JSON-quoted stack must stop at the closing quote
		expect(frame('["at a (/x/src/lib/server/minio-client.ts","C:/other"]')).toBe('src/lib/server/minio-client.ts');
		// first (topmost) application frame wins
		expect(frame('at a (http://h/src/lib/a.ts:1:1)\n at b (http://h/src/routes/b.svelte:2:2)')).toBe('src/lib/a.ts');
		// dependency-only frames (Vite pre-bundled Svelte internals) yield no app frame
		expect(frame('at get_next_sibling (http://localhost:5173/node_modules/.vite/deps/chunk-5KD435UJ.js?v=a5cfe636:1376:25)')).toBeNull();
	});

	it('fails closed to an unavailable empty diagnostic lane', async () => {
		query.mockRejectedValueOnce(new Error('database unavailable'));

		await expect(loadRuntimeErrorPriorities()).resolves.toEqual({
			status: 'UNAVAILABLE',
			total: 0,
			top10: [],
			top100: [],
		});
	});
});
