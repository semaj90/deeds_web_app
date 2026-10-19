import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadRuntimeErrorPriorities } = vi.hoisted(() => ({
	loadRuntimeErrorPriorities: vi.fn(),
}));

vi.mock('$lib/server/atlas/board/runtime-error-priorities.js', () => ({
	loadRuntimeErrorPriorities,
}));

import { GET } from './+server.js';

describe('admin runtime error priority endpoint', () => {
	beforeEach(() => loadRuntimeErrorPriorities.mockReset());

	it('requires an admin and returns a stable empty report when unauthorized', async () => {
		const response = await GET({ locals: { user: null } } as never);

		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ status: 'UNAVAILABLE', total: 0, top10: [], top100: [] });
		expect(loadRuntimeErrorPriorities).not.toHaveBeenCalled();
	});

	it('returns the ranked report without caching it', async () => {
		const report = { status: 'AVAILABLE', total: 1, top10: [{ fingerprint: 'x' }], top100: [{ fingerprint: 'x' }] };
		loadRuntimeErrorPriorities.mockResolvedValue(report);

		const response = await GET({ locals: { user: { role: 'admin' } } } as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual(report);
	});
});
