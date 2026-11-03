import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	limit: vi.fn(),
	getFromMemoryCache: vi.fn(),
	setCache: vi.fn(),
	evidenceFindMany: vi.fn(),
	canvasFindFirst: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }),
		query: {
			canvasStates: { findFirst: mocks.canvasFindFirst },
			evidence: { findMany: mocks.evidenceFindMany },
		},
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	cases: { id: 'case.id', userId: 'case.userId', assignedAttorney: 'case.assignedAttorney' },
	canvasStates: { caseId: 'canvas.caseId' },
	evidence: { caseId: 'evidence.caseId', uploadedAt: 'evidence.uploadedAt' },
	evidenceBoardConnections: { caseId: 'connections.caseId' },
}));

vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), or: vi.fn() }));
vi.mock('$lib/server/cache.js', () => ({
	getFromMemoryCache: mocks.getFromMemoryCache,
	setCache: mocks.setCache,
}));
vi.mock('$lib/server/cache-keys.js', () => ({
	clientKey: { view: vi.fn(() => 'board-cache-key') },
	TTL: { CLIENT_VIEW: 60 },
}));

const CASE_ID = 'b8fbe1be-dad0-4986-b51d-b28338acd71a';

describe('case board loader authorization boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.limit.mockResolvedValue([]);
		mocks.getFromMemoryCache.mockReturnValue({ found: false, value: null });
		mocks.setCache.mockResolvedValue(undefined);
	});

	it('returns an empty board to a non-member before cache or evidence access', async () => {
		const { load } = await import('./+page.server.js');
		const result = await load({ params: { id: CASE_ID }, locals: { user: { id: 2 } } } as never);

		expect(result).toEqual({ caseId: CASE_ID, initialState: null, evidence: [], connections: [] });
		expect(mocks.limit).toHaveBeenCalledWith(1);
		expect(mocks.getFromMemoryCache).not.toHaveBeenCalled();
		expect(mocks.evidenceFindMany).not.toHaveBeenCalled();
		expect(mocks.canvasFindFirst).not.toHaveBeenCalled();
	});

	it('checks case membership before returning a user-scoped cache hit', async () => {
		const cachedBoard = { caseId: CASE_ID, evidence: [{ id: 'existing-evidence' }] };
		mocks.limit.mockResolvedValue([{ id: CASE_ID }]);
		mocks.getFromMemoryCache.mockReturnValue({ found: true, value: cachedBoard });
		const { load } = await import('./+page.server.js');
		const result = await load({ params: { id: CASE_ID }, locals: { user: { id: 1 } } } as never);

		expect(result).toBe(cachedBoard);
		expect(mocks.limit).toHaveBeenCalledWith(1);
		expect(mocks.getFromMemoryCache).toHaveBeenCalledWith('board-cache-key');
		expect(mocks.evidenceFindMany).not.toHaveBeenCalled();
	});
});
