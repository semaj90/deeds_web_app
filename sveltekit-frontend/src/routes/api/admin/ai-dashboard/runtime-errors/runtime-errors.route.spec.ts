import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadRuntimeErrorPriorities, loadRankedRuntimeErrors } = vi.hoisted(() => ({
	loadRuntimeErrorPriorities: vi.fn(),
	loadRankedRuntimeErrors: vi.fn(),
}));

vi.mock('$lib/server/atlas/board/runtime-error-priorities.js', () => ({
	loadRuntimeErrorPriorities,
	loadRankedRuntimeErrors,
}));

import { GET } from './+server.js';

describe('admin runtime error priority endpoint', () => {
	beforeEach(() => {
		loadRuntimeErrorPriorities.mockReset();
		loadRankedRuntimeErrors.mockReset();
	});

	function request(role: string | null, query = '') {
		return { locals: { user: role ? { role } : null }, url: new URL(`http://localhost/${query}`) };
	}

	it('requires an admin and returns a stable empty report when unauthorized', async () => {
		const response = await GET(request(null) as never);

		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ status: 'UNAVAILABLE', total: 0, top10: [], top100: [], export: null });
		expect(loadRuntimeErrorPriorities).not.toHaveBeenCalled();
	});

	it('returns the ranked report without caching it', async () => {
		const report = { status: 'AVAILABLE', total: 1, top10: [{ fingerprint: 'x' }], top100: [{ fingerprint: 'x' }] };
		loadRuntimeErrorPriorities.mockResolvedValue(report);

		const response = await GET(request('admin') as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ ...report, export: null });
	});

	it.each([10, 100, 1000])('exports the requested top %i through the shared ranking owner', async (limit) => {
		loadRankedRuntimeErrors.mockResolvedValue({
			status: 'AVAILABLE', total: 3, records: [{ fingerprint: 'first' }, { fingerprint: 'second' }],
		});
		const response = await GET(request('admin', `?export=${limit}`) as never);
		expect(response.status).toBe(200);
		expect(loadRankedRuntimeErrors).toHaveBeenCalledWith(limit);
		expect((await response.json()).export).toMatchObject({
			metadata: { limit, totalRankedGroups: 3, exportedGroups: 2 },
			records: [{ rank: 1, fingerprint: 'first' }, { rank: 2, fingerprint: 'second' }],
		});
	});

	it('rejects unauthorized, unbounded and ambiguous exports before querying', async () => {
		expect((await GET(request('member', '?export=1000') as never)).status).toBe(403);
		expect((await GET(request('admin', '?export=1001') as never)).status).toBe(400);
		expect((await GET(request('admin', '?export=10&export=1000') as never)).status).toBe(400);
		expect(loadRankedRuntimeErrors).not.toHaveBeenCalled();
	});
});
