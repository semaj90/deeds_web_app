import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	getFileFromSeaweed: vi.fn(),
	env: { SCENE_PERSISTENCE_ENABLED: false }
}));

vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: mocks.getFileFromSeaweed }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));

import { GET } from './+server.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const characterId = 'actor-01';

describe('GET /api/cases/[id]/scenes/[sceneId]/characters/[characterId]/assets/[...objectKey] (MEM-04)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.env.SCENE_PERSISTENCE_ENABLED = false;
	});

	it('rejects unauthenticated requests (401), path traversal (400), and disabled persistence gate (503)', async () => {
		const res401 = await GET({
			locals: { user: null },
			params: { id: caseId, sceneId, characterId, objectKey: 'model.glb' },
			request: new Request('http://localhost/test'),
			url: new URL('http://localhost/test')
		} as any);
		expect(res401.status).toBe(401);

		const res400 = await GET({
			locals: { user: { id: '7' } },
			params: { id: caseId, sceneId, characterId, objectKey: '../secret.glb' },
			request: new Request('http://localhost/test'),
			url: new URL('http://localhost/test')
		} as any);
		expect(res400.status).toBe(400);

		mocks.getAuthorizedCase.mockResolvedValueOnce({ id: caseId });
		const res503 = await GET({
			locals: { user: { id: '7' } },
			params: { id: caseId, sceneId, characterId, objectKey: 'model.glb' },
			request: new Request('http://localhost/test'),
			url: new URL('http://localhost/test')
		} as any);
		expect(res503.status).toBe(503);
	});

	it('streams verified bytes from character-assets bucket with SHA-256 check and HTTP 206 Partial Content', async () => {
		mocks.env.SCENE_PERSISTENCE_ENABLED = true;
		mocks.getAuthorizedCase.mockResolvedValue({ id: caseId });

		const payload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
		const sha = createHash('sha256').update(payload).digest('hex');
		mocks.getFileFromSeaweed.mockResolvedValue(payload);

		// 1. Full GET with matching expectedSha256
		const fullUrl = `http://localhost/test?expectedSha256=${sha}`;
		const res200 = await GET({
			locals: { user: { id: '7' } },
			params: { id: caseId, sceneId, characterId, objectKey: 'lod/balanced.glb' },
			request: new Request(fullUrl),
			url: new URL(fullUrl)
		} as any);
		expect(res200.status).toBe(200);
		expect(mocks.getFileFromSeaweed).toHaveBeenCalledWith({
			bucket: 'character-assets',
			objectKey: `cases/${caseId}/scenes/${sceneId}/characters/${characterId}/lod/balanced.glb`,
			maximumBytes: 16 * 1024 * 1024
		});
		expect(new Uint8Array(await res200.arrayBuffer())).toEqual(payload);

		// 2. Partial Range GET (206 Partial Content)
		const res206 = await GET({
			locals: { user: { id: '7' } },
			params: { id: caseId, sceneId, characterId, objectKey: 'lod/balanced.glb' },
			request: new Request(fullUrl, { headers: { range: 'bytes=2-5' } }),
			url: new URL(fullUrl)
		} as any);
		expect(res206.status).toBe(206);
		expect(res206.headers.get('content-range')).toBe('bytes 2-5/8');
		expect(new Uint8Array(await res206.arrayBuffer())).toEqual(new Uint8Array([30, 40, 50, 60]));

		// 3. Mismatched SHA-256 fails closed with 409
		const badUrl = `http://localhost/test?expectedSha256=${'f'.repeat(64)}`;
		const res409 = await GET({
			locals: { user: { id: '7' } },
			params: { id: caseId, sceneId, characterId, objectKey: 'lod/balanced.glb' },
			request: new Request(badUrl),
			url: new URL(badUrl)
		} as any);
		expect(res409.status).toBe(409);
	});
});
