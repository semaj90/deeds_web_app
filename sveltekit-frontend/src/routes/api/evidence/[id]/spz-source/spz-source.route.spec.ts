import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn(),
	getAuthorizedCase: vi.fn(), getFileFromSeaweed: vi.fn(),
	row: {} as Record<string, unknown>,
}));

vi.mock('$lib/server/db/client', () => ({ db: { select: mocks.select } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ evidence: { id: 'id', caseId: 'caseId', fileUrl: 'fileUrl', fileName: 'fileName', fileType: 'fileType', mimeType: 'mimeType', hash: 'hash' } }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({ EVIDENCE_BUCKET: 'legal-evidence', assertEvidenceBucket: (bucket: string) => { if (bucket !== 'legal-evidence') throw new Error('wrong bucket'); } }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: mocks.getFileFromSeaweed }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('drizzle-orm', () => ({ and: (...args: unknown[]) => ({ operator: 'and', args }), eq: (...args: unknown[]) => ({ operator: 'eq', args }) }));

const caseId = 'fc0277ba-9d09-4d52-8d74-f16db1a678ce';
const evidenceId = '7da89ae6-f7d2-45e9-81ce-28854fe4ce6a';
const fixture = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/splat/fixtures/niantic-official-degree0-5pt.spz')));
const sourceSha256 = `sha256:${createHash('sha256').update(fixture).digest('hex')}`;

describe('GET /api/evidence/[id]/spz-source', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.row = { id: evidenceId, caseId, fileUrl: `seaweed://legal-evidence/evidence/${caseId}/scene.spz`, fileName: 'scene.spz', fileType: 'application/octet-stream', mimeType: 'application/octet-stream', hash: sourceSha256 };
		mocks.getAuthorizedCase.mockResolvedValue({ id: caseId });
		mocks.getFileFromSeaweed.mockResolvedValue(fixture);
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
});
