import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
	getAuthorizedCase: vi.fn(), listSceneMarkers: vi.fn(), createMarker: vi.fn(), moveMarker: vi.fn(), deleteMarker: vi.fn(), getFileFromSeaweed: vi.fn(),
	row: {} as Record<string, unknown>,
}));

vi.mock('$lib/server/db/client.js', () => ({ db: { select: mocks.select } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ evidence: { id: 'id', caseId: 'caseId', hash: 'hash', fileName: 'fileName', fileUrl: 'fileUrl' } }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({ EVIDENCE_BUCKET: 'legal-evidence', assertEvidenceBucket: (bucket: string) => { if (bucket !== 'legal-evidence') throw new Error('wrong bucket'); } }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: mocks.getFileFromSeaweed }));
vi.mock('$lib/server/scene-markers/move-marker.js', () => ({
	createMarker: mocks.createMarker, listSceneMarkers: mocks.listSceneMarkers, moveMarker: mocks.moveMarker, deleteMarker: mocks.deleteMarker,
}));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('$lib/splat/spz-loader.js', () => ({ SPZ_DEFAULT_MAX_SOURCE_BYTES: 64 * 1024 * 1024 }));
vi.mock('drizzle-orm', () => ({ and: (...args: unknown[]) => ({ operator: 'and', args }), eq: (...args: unknown[]) => ({ operator: 'eq', args }) }));

const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
const evidenceId = '7da89ae6-f7d2-45e9-81ce-28854fe4ce6a';
const markerId = 'e34b1acf-8f1c-41c2-94e4-a13bf0a2d7c6';
const commandId = '8ca47457-8adc-4e5a-a6df-e9154c6c64c9';
const sourceBytes = new TextEncoder().encode('verified fixture source bytes');
const hash = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;

function event(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
	return {
		params: { id: evidenceId }, locals: { user: { id: 7 } },
		url: new URL(`http://atlas.test/api/evidence/${evidenceId}/spz-markers?caseId=${caseId}`),
		request: new Request('http://atlas.test/api', { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }),
	} as any;
}

describe('/api/evidence/[id]/spz-markers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.row = { id: evidenceId, caseId, hash, fileName: 'scene.spz', fileUrl: `seaweed://legal-evidence/evidence/${caseId}/scene.spz` };
		mocks.getAuthorizedCase.mockResolvedValue({ id: caseId });
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.limit.mockResolvedValue([mocks.row]);
		mocks.getFileFromSeaweed.mockResolvedValue(sourceBytes);
		mocks.listSceneMarkers.mockResolvedValue([]);
		mocks.createMarker.mockResolvedValue({ markerId, revision: 1, position: { x: 1, y: 2, z: 3 }, replayed: false });
		mocks.moveMarker.mockResolvedValue({ markerId, revision: 2, position: { x: 2, y: 3, z: 4 }, replayed: false });
		mocks.deleteMarker.mockResolvedValue({ markerId, revision: 3, position: { x: 2, y: 3, z: 4 }, replayed: false });
	});

	it('checks case access before reading and lists anchors under the canonical evidence hash', async () => {
		const { GET } = await import('./+server.js');
		const response = await GET(event('GET'));
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.data.sourceSha256).toBe(hash);
		expect(mocks.listSceneMarkers).toHaveBeenCalledWith(expect.anything(), caseId, `spz:v1:${evidenceId}:${hash}`);
		expect(mocks.getFileFromSeaweed).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'legal-evidence', maximumBytes: 64 * 1024 * 1024 }));

		mocks.getAuthorizedCase.mockResolvedValue(null);
		mocks.select.mockClear();
		mocks.getFileFromSeaweed.mockClear();
		mocks.listSceneMarkers.mockClear();
		const denied = await GET(event('GET'));
		expect(denied.status).toBe(404);
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.getFileFromSeaweed).not.toHaveBeenCalled();
	});

	it('rejects changed source bytes before exposing saved markers', async () => {
		mocks.getFileFromSeaweed.mockResolvedValue(new TextEncoder().encode('changed object bytes'));
		const { GET } = await import('./+server.js');
		const response = await GET(event('GET'));
		expect(response.status).toBe(409);
		expect((await response.json()).error).toBe('SOURCE_BYTES_HASH_MISMATCH');
		expect(mocks.listSceneMarkers).not.toHaveBeenCalled();
	});

	it('rejects stale source hashes before marker writes and creates using canonical hash-bound scene identity', async () => {
		const { POST } = await import('./+server.js');
		const stale = await POST(event('POST', { markerId, commandId, expectedSourceSha256: `sha256:${'b'.repeat(64)}`, label: 'shoe print', position: { x: 1, y: 2, z: 3 } }));
		expect(stale.status).toBe(409);
		expect(mocks.createMarker).not.toHaveBeenCalled();

		const response = await POST(event('POST', { markerId, commandId, expectedSourceSha256: hash, label: 'shoe print', position: { x: 1, y: 2, z: 3 } }));
		expect(response.status).toBe(201);
		expect(mocks.createMarker).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			caseId, evidenceId, markerId, commandId, sceneKey: `spz:v1:${evidenceId}:${hash}`, userId: 7,
		}));
	});

	it('requires a revision and the current source digest for anchored movement', async () => {
		const { PATCH } = await import('./+server.js');
		const response = await PATCH(event('PATCH', { markerId, commandId, expectedRevision: 1, expectedSourceSha256: hash, position: { x: 2, y: 3, z: 4 } }));
		expect(response.status).toBe(200);
		expect(mocks.moveMarker).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			caseId, evidenceId, markerId, commandId, expectedRevision: 1, sceneKey: `spz:v1:${evidenceId}:${hash}`,
		}));
	});

	it('soft-deletes only with the current source digest and expected revision', async () => {
		const { DELETE } = await import('./+server.js');
		const stale = await DELETE(event('DELETE', { markerId, commandId, expectedRevision: 2, expectedSourceSha256: `sha256:${'b'.repeat(64)}` }));
		expect(stale.status).toBe(409);
		expect(mocks.deleteMarker).not.toHaveBeenCalled();
		const response = await DELETE(event('DELETE', { markerId, commandId, expectedRevision: 2, expectedSourceSha256: hash }));
		expect(response.status).toBe(200);
		expect(mocks.deleteMarker).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
			caseId, evidenceId, markerId, commandId, expectedRevision: 2, sceneKey: `spz:v1:${evidenceId}:${hash}`,
		}));
	});
});
