import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ where: vi.fn(), limit: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({
	db: { select: () => ({ from: () => ({ where: (predicate: unknown) => {
		mocks.where(predicate);
		return { limit: mocks.limit };
	} }) }) }
}));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'cases.id', userId: 'cases.user_id', assignedAttorney: 'cases.assigned_attorney' }
}));
vi.mock('drizzle-orm', () => ({
	and: (...args: unknown[]) => ({ and: args }),
	eq: (...args: unknown[]) => ({ eq: args }),
	or: (...args: unknown[]) => ({ or: args })
}));

const CASE_ID = 'b8fbe1be-dad0-4986-b51d-b28338acd71a';

describe('getAuthorizedCase', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.limit.mockResolvedValue([]);
	});

	it.each([1, 2])('uses the owner-or-assigned-attorney predicate for actor %i', async (actorId) => {
		const row = { id: CASE_ID };
		mocks.limit.mockResolvedValue([row]);
		const { getAuthorizedCase } = await import('./case-access.js');
		expect(await getAuthorizedCase(CASE_ID, actorId)).toBe(row);
		const predicate = mocks.where.mock.calls[0][0];
		expect(predicate.and[0]).toEqual({ eq: ['cases.id', CASE_ID] });
		expect(predicate.and[1].or).toEqual([
			{ eq: ['cases.user_id', actorId] },
			{ eq: ['cases.assigned_attorney', actorId] }
		]);
	});

	it('denies an unrelated actor when the authorization query returns no case', async () => {
		const { getAuthorizedCase } = await import('./case-access.js');
		expect(await getAuthorizedCase(CASE_ID, 99)).toBeNull();
	});

	it('fails closed without querying for invalid IDs', async () => {
		const { getAuthorizedCase } = await import('./case-access.js');
		expect(await getAuthorizedCase('not-a-uuid', 1)).toBeNull();
		expect(await getAuthorizedCase(CASE_ID, 0)).toBeNull();
		expect(mocks.where).not.toHaveBeenCalled();
	});
});
