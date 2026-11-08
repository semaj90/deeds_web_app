import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
	getAuthorizedCase: vi.fn(), getFileFromSeaweed: vi.fn(),
	readSceneDocumentRevisionV1: vi.fn(),
	row: {} as Record<string, unknown>,
}));

vi.mock('$lib/server/db/client', () => ({ db: { select: mocks.select } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ evidence: { id: 'id', caseId: 'caseId', fileUrl: 'fileUrl', fileName: 'fileName', fileType: 'fileType', mimeType: 'mimeType', hash: 'hash' } }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({ EVIDENCE_BUCKET: 'legal-evidence', assertEvidenceBucket: (bucket: string) => { if (bucket !== 'legal-evidence') throw new Error('wrong bucket'); } }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: mocks.getFileFromSeaweed }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SCENE_PERSISTENCE_ENABLED: true } }));
vi.mock('$lib/server/scene-document-revisions-v1.js', () => ({ readSceneDocumentRevisionV1: mocks.readSceneDocumentRevisionV1 }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('drizzle-orm', () => ({ and: (...args: unknown[]) => ({ operator: 'and', args }), eq: (...args: unknown[]) => ({ operator: 'eq', args }) }));

const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
const evidenceId = '7da89ae6-f7d2-45e9-81ce-28854fe4ce6a';
const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/splat/fixtures/niantic-official-degree0-5pt.spz')));
const sourceSha256 = `sha256:${createHash('sha256').update(fixture).digest('hex')}`;
const sceneId = 'd95fd75a-067a-4594-a03f-64459f84138d';
const sceneManifest = (evidenceSources = [{ evidenceId, sourceRevision: sourceSha256, format: 'SPZ', coordinateSystem: 'RUB', decoderRevision: 'spz-v4-decoder-core-v1', representationRevision: 'three-gaussian-splat-v1' }]) => ({
	schema: 'parent-atlas.scene-document.v1', caseId, sceneId, status: 'HYPOTHESIS', revision: 2,
	parentManifestSha256: 'b'.repeat(64), createdAt: '2026-11-05T12:00:00.000Z', coordinateFrame: 'SPZ_RUB',
	objects: [], animations: [], evidenceSources, assets: [],
	quality: { triangleBudget: 100_000, triangleCount: 0, textureBytes: null, derivedAssetBytes: 0, derivedAssetByteBudget: 8 * 1024 * 1024, derivedAssetByteStatus: 'WITHIN_BUDGET', status: 'NOT_ASSESSED' }
});

describe('GET /api/evidence/[id]/spz-source', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.row = { id: evidenceId, caseId, fileUrl: `seaweed://legal-evidence/evidence/${caseId}/scene.spz`, fileName: 'scene.spz', fileType: 'application/octet-stream', mimeType: 'application/octet-stream', hash: sourceSha256 };
		mocks.getAuthorizedCase.mockResolvedValue({ id: caseId });
		mocks.getFileFromSeaweed.mockResolvedValue(fixture);
		mocks.readSceneDocumentRevisionV1.mockResolvedValue({ manifest: sceneManifest() });
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.limit.mockResolvedValue([mocks.row]);
	});

	it('proves access before looking up the evidence row and returns only a source-verified reference', async () => {
		const { GET } = await import('./+server.js');
		const response = await GET({ params: { id: evidenceId }, locals: { user: { id: 7 } }, url: new URL(`http://atlas.test/api/evidence/${evidenceId}/spz-source?caseId=${caseId}`) } as any);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.asset).toMatchObject({ evidenceId, caseId, sourceSha256, pointCount: 5, admission: 'SOURCE_VERIFIED' });
		expect(body.asset.downloadUrl).toContain(`/api/evidence/${evidenceId}/download?caseId=${caseId}`);
		expect(mocks.getFileFromSeaweed).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'legal-evidence', maximumBytes: 64 * 1024 * 1024 }));
	});

	it('does not read evidence or storage for an unauthorized case', async () => {
		mocks.getAuthorizedCase.mockResolvedValue(null);
		const { GET } = await import('./+server.js');
		const response = await GET({ params: { id: evidenceId }, locals: { user: { id: 7 } }, url: new URL(`http://atlas.test/api/evidence/${evidenceId}/spz-source?caseId=${caseId}`) } as any);
		expect(response.status).toBe(404);
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.getFileFromSeaweed).not.toHaveBeenCalled();
	});

	it('rejects a source hash mismatch and a non-SPZ document', async () => {
		mocks.row.hash = `sha256:${'a'.repeat(64)}`;
		const { GET } = await import('./+server.js');
		const mismatch = await GET({ params: { id: evidenceId }, locals: { user: { id: 7 } }, url: new URL(`http://atlas.test/api/evidence/${evidenceId}/spz-source?caseId=${caseId}`) } as any);
		expect(mismatch.status).toBe(409);
		mocks.row.fileName = 'ordinary.pdf';
		const notSpz = await GET({ params: { id: evidenceId }, locals: { user: { id: 7 } }, url: new URL(`http://atlas.test/api/evidence/${evidenceId}/spz-source?caseId=${caseId}`) } as any);
		expect(notSpz.status).toBe(415);
	});

	it('admits a verified source only when the requested immutable scene revision binds it', async () => {
		const { GET } = await import('./+server.js');
		const url = new URL(`http://atlas.test/api/evidence/${evidenceId}/spz-source?caseId=${caseId}&sceneId=${sceneId}&revision=2`);
		const response = await GET({ params: { id: evidenceId }, locals: { user: { id: 7 } }, url } as any);
		expect(response.status).toBe(200);
		expect((await response.json()).asset).toMatchObject({ admission: 'SCENE_ADMITTED', sceneAdmission: { sceneId, sceneRevision: 2, evidenceId, sourceRevision: sourceSha256 } });
		expect(mocks.readSceneDocumentRevisionV1).toHaveBeenCalledWith({ caseId, sceneId, revision: 2 });
	});

	it('returns a named conflict when the scene revision does not bind the verified source', async () => {
		mocks.readSceneDocumentRevisionV1.mockResolvedValue({ manifest: sceneManifest([]) });
		const { GET } = await import('./+server.js');
		const url = new URL(`http://atlas.test/api/evidence/${evidenceId}/spz-source?caseId=${caseId}&sceneId=${sceneId}&revision=2`);
		const response = await GET({ params: { id: evidenceId }, locals: { user: { id: 7 } }, url } as any);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ success: false, error: 'SCENE_ADMISSION_MANIFEST_BINDING_MISSING', asset: null });
	});
});
