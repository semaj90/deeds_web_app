import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getAuthorizedCase: vi.fn(), select: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({ db: { select: mocks.select } }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));

const CASE_ID = 'b8fbe1be-dad0-4986-b51d-b28338acd71a';

describe('AI Counsel case authorization boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAuthorizedCase.mockResolvedValue(null);
	});

	it('denies an unrelated user before reading evidence, documents, notes, or citations', async () => {
		const { load } = await import('./+page.server.js');
		await expect(load({
			params: { id: CASE_ID },
			locals: { user: { id: 99 } }
		} as never)).rejects.toMatchObject({ status: 404 });

		expect(mocks.getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 99);
		expect(mocks.select).not.toHaveBeenCalled();
	});
});
