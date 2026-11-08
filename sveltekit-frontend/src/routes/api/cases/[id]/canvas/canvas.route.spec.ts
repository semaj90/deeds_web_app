import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(), caseFrom: vi.fn(), caseWhere: vi.fn(), caseLimit: vi.fn(),
	transaction: vi.fn(), execute: vi.fn(), txSelect: vi.fn(), txFrom: vi.fn(), txWhere: vi.fn(), txLimit: vi.fn(),
	update: vi.fn(), updateSet: vi.fn(), updateWhere: vi.fn(), updateReturning: vi.fn(),
	insert: vi.fn(), insertValues: vi.fn(), insertReturning: vi.fn(), verifyTable: vi.fn()
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: mocks.select,
		transaction: mocks.transaction
	}
}));
vi.mock('$lib/server/db/schema', () => ({ canvasStates: { id: 'canvas_states.id', caseId: 'canvas_states.case_id' } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ cases: { id: 'cases.id', userId: 'cases.user_id' } }));
vi.mock('$lib/server/db/verify-canvas-table', () => ({ verifyCanvasStatesTable: mocks.verifyTable }));
vi.mock('drizzle-orm', () => ({
	and: (...args: unknown[]) => ({ and: args }),
	eq: (field: unknown, value: unknown) => ({ field, value }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values })
}));

const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
const state = { version: 1, viewport: { pan: { x: 0, y: 0 }, zoom: 1 }, nodes: [], edges: [] };

function event() {
	return {
		params: { id: caseId },
		locals: { user: { id: '7' } },
		request: new Request(`http://atlas.test/api/cases/${caseId}/canvas`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state)
		})
	} as never;
}

describe('case canvas POST row ownership', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.verifyTable.mockResolvedValue(true);
		mocks.select.mockReturnValue({ from: mocks.caseFrom });
		mocks.caseFrom.mockReturnValue({ where: mocks.caseWhere });
		mocks.caseWhere.mockReturnValue({ limit: mocks.caseLimit });
		mocks.caseLimit.mockResolvedValue([{ id: caseId }]);

		const tx = {
			execute: mocks.execute,
			select: mocks.txSelect,
			update: mocks.update,
			insert: mocks.insert
		};
		mocks.transaction.mockImplementation(async (callback) => callback(tx));
		mocks.txSelect.mockReturnValue({ from: mocks.txFrom });
		mocks.txFrom.mockReturnValue({ where: mocks.txWhere });
		mocks.txWhere.mockReturnValue({ limit: mocks.txLimit });
		mocks.execute.mockResolvedValue(undefined);
		mocks.update.mockReturnValue({ set: mocks.updateSet });
		mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
		mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
		mocks.updateReturning.mockResolvedValue([{ id: 'row-1' }]);
		mocks.insert.mockReturnValue({ values: mocks.insertValues });
		mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
		mocks.insertReturning.mockResolvedValue([{ id: 'row-new' }]);
	});

	it('updates only the selected row when one case row exists', async () => {
		mocks.txLimit.mockResolvedValue([{ id: 'row-1' }]);
		const { POST } = await import('./+server.js');
		const response = await POST(event());
		expect(response.status).toBe(200);
		expect(mocks.updateWhere).toHaveBeenCalledWith({ field: 'canvas_states.id', value: 'row-1' });
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it('refuses to write when duplicate case rows exist', async () => {
		mocks.txLimit.mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }]);
		const { POST } = await import('./+server.js');
		const response = await POST(event());
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: 'AMBIGUOUS_CANVAS_STATE' });
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it('serializes and inserts the first case snapshot when no row exists', async () => {
		mocks.txLimit.mockResolvedValue([]);
		const { POST } = await import('./+server.js');
		const response = await POST(event());
		expect(response.status).toBe(200);
		expect(mocks.insertValues).toHaveBeenCalledWith({ caseId, stateData: state });
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.execute).toHaveBeenCalledTimes(1);
	});
});
