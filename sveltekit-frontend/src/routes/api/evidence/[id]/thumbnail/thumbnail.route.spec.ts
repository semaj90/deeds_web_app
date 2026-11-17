// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(), from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), limit: vi.fn(), execute: vi.fn(),
	getFile: vi.fn(), sourceRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('$lib/server/db/client', () => ({ db: { select: (...args: unknown[]) => mocks.select(...args), execute: (...args: unknown[]) => mocks.execute(...args) } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: mocks.getFile }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'cases.id', userId: 'cases.userId', assignedAttorney: 'cases.assignedAttorney' },
	evidence: { id: 'evidence.id', caseId: 'evidence.caseId', hash: 'evidence.hash', deletedAt: 'evidence.deletedAt', userId: 'evidence.userId', uploadedBy: 'evidence.uploadedBy' },
}));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('drizzle-orm', () => ({
	and: (...conditions: unknown[]) => ({ and: conditions }), eq: (...fields: unknown[]) => ({ eq: fields }),
	isNotNull: (...fields: unknown[]) => ({ isNotNull: fields }), isNull: (...fields: unknown[]) => ({ isNull: fields }),
	or: (...conditions: unknown[]) => ({ or: conditions }), sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
}));

import { GET } from './+server.js';

const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_REVISION = `sha256:${'a'.repeat(64)}`;
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const outputSha256 = createHash('sha256').update(bytes).digest('hex');
const objectKey = `evidence/${CASE_ID}/${EVIDENCE_ID}/${'a'.repeat(64)}/thumbnail-${outputSha256}.jpg`;

function event(userId: string | null = '7') {
	return { params: { id: EVIDENCE_ID }, locals: { user: userId ? { id: userId } : null } } as never;
}

function setAuthorizedImageRecord() {
	mocks.sourceRows = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_REVISION }];
	mocks.execute.mockResolvedValue({ rows: [{
		source_revision: SOURCE_REVISION,
		metadata: { imageDerivatives: { thumbnail: {
			kind: 'thumbnail', sourceRevision: SOURCE_REVISION, objectKey, bucket: 'atlas-artifacts',
			mimeType: 'image/jpeg', outputSha256, width: 64, height: 64, preprocessingRevision: 'thumb-v1',
		} } },
	}] });
}

describe('GET /api/evidence/[id]/thumbnail', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin });
		mocks.leftJoin.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.limit.mockImplementation(async () => mocks.sourceRows);
		mocks.getFile.mockResolvedValue(bytes);
	});

	it('requires sign-in before looking up evidence or storage', async () => {
		const response = await GET(event(null));
		expect(response.status).toBe(401);
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('returns a private JPEG only after source and artifact digest validation', async () => {
		setAuthorizedImageRecord();
		const response = await GET(event());
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/jpeg');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('etag')).toBe(`"sha256-${outputSha256}"`);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
		expect(mocks.getFile).toHaveBeenCalledWith({ bucket: 'atlas-artifacts', objectKey, maximumBytes: 2 * 1024 * 1024 });
		const thumbnailQuery = mocks.execute.mock.calls[0]?.[0] as { strings?: string[] } | undefined;
		expect(thumbnailQuery?.strings?.join('')).toContain("source_locator->>'kind' = 'whole_image'");
	});

	it('hides absent or unauthorized evidence without querying the artifact store', async () => {
		mocks.sourceRows = [];
		const response = await GET(event());
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ success: false, error: 'EVIDENCE_NOT_FOUND' });
		expect(mocks.execute).not.toHaveBeenCalled();
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('rejects a tampered derivative and a stale source revision', async () => {
		setAuthorizedImageRecord();
		mocks.getFile.mockResolvedValueOnce(new TextEncoder().encode('tampered'));
		const tampered = await GET(event());
		expect(tampered.status).toBe(502);
		expect(await tampered.json()).toMatchObject({ error: 'THUMBNAIL_INTEGRITY_CHECK_FAILED' });

		setAuthorizedImageRecord();
		mocks.execute.mockResolvedValueOnce({ rows: [{ source_revision: `sha256:${'c'.repeat(64)}`, metadata: {} }] });
		const stale = await GET(event());
		expect(stale.status).toBe(404);
		expect(mocks.getFile).toHaveBeenCalledTimes(1);
	});

	it('rejects bytes that are not a JPEG even when their stored digest matches', async () => {
		setAuthorizedImageRecord();
		const invalidBytes = new TextEncoder().encode('not a jpeg');
		const invalidDigest = createHash('sha256').update(invalidBytes).digest('hex');
		mocks.execute.mockResolvedValueOnce({ rows: [{
			source_revision: SOURCE_REVISION,
			metadata: { imageDerivatives: { thumbnail: {
				kind: 'thumbnail', sourceRevision: SOURCE_REVISION,
				objectKey: `evidence/${CASE_ID}/${EVIDENCE_ID}/${'a'.repeat(64)}/thumbnail-${invalidDigest}.jpg`,
				bucket: 'atlas-artifacts', mimeType: 'image/jpeg', outputSha256: invalidDigest,
				width: 10, height: 10, preprocessingRevision: 'thumb-v1',
			} } },
		}] });
		mocks.getFile.mockResolvedValue(invalidBytes);
		const response = await GET(event());
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ error: 'THUMBNAIL_FORMAT_INVALID' });
	});
});
