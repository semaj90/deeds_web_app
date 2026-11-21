import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSceneQualityReceiptV1, stableStringifySceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
import { sha256Hex } from '$lib/splat/spz-loader.js';

const mocks = vi.hoisted(() => ({ authorized: true, persistenceEnabled: true, read: vi.fn() }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: vi.fn(async () => mocks.authorized ? { id: 'case' } : null) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { get SCENE_PERSISTENCE_ENABLED() { return mocks.persistenceEnabled; } } }));
vi.mock('$lib/server/scene-document-revisions-v1.js', () => ({ readSceneDocumentRevisionV1: mocks.read }));

import { GET } from './+server.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';

function event(input: { userId?: string; revision?: string } = {}) {
	const url = new URL(`http://local.invalid/api/cases/${caseId}/scenes/${sceneId}/report${input.revision ? `?revision=${input.revision}` : ''}`);
	return { locals: { user: input.userId ? { id: input.userId } : null }, params: { id: caseId, sceneId }, url } as never;
}

async function savedRow() {
	const manifest = {
		schema: 'parent-atlas.scene-document.v1' as const, sceneId, caseId, status: 'HYPOTHESIS' as const,
		revision: 2, parentManifestSha256: 'a'.repeat(64), createdAt: '2026-11-20T20:00:00.000Z',
		coordinateFrame: 'LOCAL_UNCALIBRATED' as const, objects: [], animations: [], evidenceBindings: [], evidenceSources: [], assets: [],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
	};
	return { caseId, sceneId, revision: 2, manifestSha256: await sha256Hex(new TextEncoder().encode(stableStringifySceneDocumentV1(manifest))), manifest };
}

describe('case scene revision report route', () => {
	beforeEach(() => { mocks.authorized = true; mocks.persistenceEnabled = true; mocks.read.mockReset(); });

	it('requires sign-in, case access, a revision, and the existing persistence gate', async () => {
		expect((await GET(event() as never)).status).toBe(401);
		mocks.authorized = false;
		expect((await GET(event({ userId: '7', revision: '2' }) as never)).status).toBe(404);
		mocks.authorized = true;
		expect((await GET(event({ userId: '7' }) as never)).status).toBe(400);
		mocks.persistenceEnabled = false;
		expect((await GET(event({ userId: '7', revision: '2' }) as never)).status).toBe(503);
		expect(mocks.read).not.toHaveBeenCalled();
	});

	it('exports only the exact authorized revision returned by the scene owner', async () => {
		const row = await savedRow();
		mocks.read.mockResolvedValue(row);
		const response = await GET(event({ userId: '7', revision: '2' }) as never);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toContain('scene-review-r2.json');
		expect(body).toMatchObject({ success: true, data: { caseId, sceneId, revision: 2, manifestSha256: row.manifestSha256 } });
		expect(mocks.read).toHaveBeenCalledWith({ caseId, sceneId, revision: 2 });
	});
});
