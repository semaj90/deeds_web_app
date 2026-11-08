import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(), deleteMarker: vi.fn()
}));

vi.mock('$lib/server/db/client.js', () => ({ db: { select: mocks.select } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ cases: { id: 'cases.id', userId: 'cases.user_id', assignedAttorney: 'cases.assigned_attorney' } }));
vi.mock('$lib/server/scene-markers/move-marker.js', () => ({
	CommandReuseError: class extends Error {}, EvidenceMismatchError: class extends Error {},
	MarkerConflictError: class extends Error {}, MarkerNotFoundError: class extends Error {},
	deleteMarker: mocks.deleteMarker, moveMarker: vi.fn()
}));
vi.mock('drizzle-orm', () => ({ eq: (...args: unknown[]) => ({ eq: args }) }));

const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
const markerId = 'e34b1acf-8f1c-41c2-94e4-a13bf0a2d7c6';
const evidenceId = '7da89ae6-f7d2-45e9-81ce-28854fe4ce6a';
const commandId = '8ca47457-8adc-4e5a-a6df-e9154c6c64c9';

function requestEvent(userId: string, body: unknown) {
	return {
		params: { id: caseId, sceneKey: `evidence:${evidenceId}`, markerId },
		locals: { user: { id: userId, role: 'user' } },
		request: new Request('http://atlas.test/marker', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
	} as any;
}

describe('case scene marker DELETE', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.limit.mockResolvedValue([{ userId: 3, assignedAttorney: 7 }]);
		mocks.deleteMarker.mockResolvedValue({ markerId, revision: 3, position: { x: 1, y: 2, z: 3 }, replayed: false });
	});

	it('allows the assigned attorney and returns the transaction revision', async () => {
		const { DELETE } = await import('./+server.js');
		const response = await DELETE(requestEvent('7', { commandId, evidenceId, expectedRevision: 2 }));
		expect(response.status).toBe(200);
		expect((await response.json()).data.revision).toBe(3);
		expect(mocks.deleteMarker).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			caseId, sceneKey: `evidence:${evidenceId}`, markerId, evidenceId, commandId, expectedRevision: 2, userId: 7
		}));
	});

	it('denies an unrelated user before the soft-delete transaction', async () => {
		const { DELETE } = await import('./+server.js');
		const response = await DELETE(requestEvent('9', { commandId, evidenceId, expectedRevision: 2 }));
		expect(response.status).toBe(403);
		expect(mocks.deleteMarker).not.toHaveBeenCalled();
	});
});
