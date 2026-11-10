import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getAuthorizedCase: vi.fn(), select: vi.fn(), execute: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({ db: { select: mocks.select, execute: mocks.execute }, pgRows: (result: { rows?: unknown[] }) => result.rows ?? [] }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));

const CASE_ID = 'b8fbe1be-dad0-4986-b51d-b28338acd71a';

describe('AI Counsel case authorization boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAuthorizedCase.mockResolvedValue(null);
		mocks.execute.mockResolvedValue({ rows: [] });
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

	it('loads citations through the canonical case-scoped projection and leaves unbound documents empty', async () => {
		const emptyQuery = () => {
			const query: Record<string, unknown> = {};
			query.from = vi.fn(() => query);
			query.where = vi.fn(() => query);
			query.orderBy = vi.fn(() => Promise.resolve([]));
			return query;
		};
		mocks.getAuthorizedCase.mockResolvedValue({ id: CASE_ID, title: 'Case' });
		mocks.select.mockImplementation(emptyQuery);
		const citation = {
			id: 'citation-1', caseId: CASE_ID, documentId: null, citationText: 'Cal. Const. art. I',
			sourceUrl: null, pageNumber: 1, confidence: 0.9, createdBy: 99,
			createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z'
		};
		mocks.execute.mockResolvedValue({ rows: [citation] });

		const { load } = await import('./+page.server.js');
		const result = await load({
			params: { id: CASE_ID },
			locals: { user: { id: 99 } }
		} as never);

		expect(result.citationsList).toEqual([citation]);
		expect(result.documentsList).toEqual([]);
		expect(mocks.execute).toHaveBeenCalledTimes(1);
		expect(mocks.select).toHaveBeenCalledTimes(2);
	});
});
