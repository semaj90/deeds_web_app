import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), limit: vi.fn(), execute: vi.fn(), getFile: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({ db: { select: (...args: unknown[]) => mocks.select(...args), execute: (...args: unknown[]) => mocks.execute(...args) } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'case.id', userId: 'case.userId', assignedAttorney: 'case.assignedAttorney' },
	evidence: {
		id: 'evidence.id', caseId: 'evidence.caseId', hash: 'evidence.hash', mimeType: 'evidence.mimeType',
		fileType: 'evidence.fileType', userId: 'evidence.userId', uploadedBy: 'evidence.uploadedBy', aiAnalysis: 'evidence.aiAnalysis',
	},
}));
vi.mock('$lib/server/seaweed-client.js', () => ({ getSeaweedFile: (...args: unknown[]) => mocks.getFile(...args) }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('drizzle-orm', () => ({
	and: (...conditions: unknown[]) => ({ and: conditions }),
	eq: (...fields: unknown[]) => ({ eq: fields }),
	or: (...conditions: unknown[]) => ({ or: conditions }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

import { GET } from './+server.js';

const evidenceId = '6b2749f6-03d8-42b7-a4e0-93983c62cc1d';
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const png = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.writeUInt32BE(13, 8);
Buffer.from('IHDR').copy(png, 12);
png.writeUInt32BE(1, 16);
png.writeUInt32BE(1, 20);
const depthSha256 = createHash('sha256').update(png).digest('hex');

function event(user?: { id: string }) {
	return { params: { id: evidenceId }, locals: user ? { user } : {} } as never;
}

function evidenceRow(overrides: Record<string, unknown> = {}) {
	return {
		id: evidenceId,
		caseId: '4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc',
		hash: sourceRevision,
		mimeType: 'image/png',
		fileType: 'image/png',
		aiAnalysis: {
			depthAnalysis: {
				depthMapUrl: `seaweed://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`,
				sourceRevision,
				depthSha256,
				width: 1,
				height: 1,
			},
		},
		...overrides,
	};
}

describe('evidence depth-map route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin });
		mocks.leftJoin.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.execute.mockRejectedValue(new Error('canonical vector table unavailable'));
		mocks.getFile.mockResolvedValue(png);
	});

	it('requires authentication before querying evidence', async () => {
		const response = await GET(event());

		expect(response.status).toBe(401);
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('returns not found for evidence outside the actor scope', async () => {
		mocks.limit.mockResolvedValue([]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('fails closed when depth metadata is not bound to the source revision', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: { depthAnalysis: { depthMapUrl: 'minio://evidence/evidence/key.png' } },
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('serves only the bounded PNG artifact from SeaweedFS for an authorized source-bound image', async () => {
		mocks.limit.mockResolvedValue([evidenceRow()]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.getFile).toHaveBeenCalledWith('evidence', `evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
	});

	it('reads a source- and digest-bound depth estimate from canonical image-vector metadata', async () => {
		const caseId = '4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc';
		const sourceHash = sourceRevision.slice('sha256:'.length);
		const objectKey = `evidence/${caseId}/${evidenceId}/${sourceHash}/depth-${depthSha256}.png`;
		mocks.limit.mockResolvedValue([evidenceRow({ aiAnalysis: null })]);
		mocks.execute.mockResolvedValue({ rows: [{
			source_revision: sourceRevision,
			metadata: { visualAnalysis: {
				schema: 'atlas.evidence-visual-analysis.v1',
				sourceRevision,
				depthMap: { objectKey, bucket: 'atlas-artifacts', artifactSha256: depthSha256, status: 'ESTIMATED', width: 1, height: 1 },
			} },
		}] });

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(200);
		expect(mocks.getFile).toHaveBeenCalledWith('atlas-artifacts', objectKey);
		expect(response.headers.get('x-depth-verification')).toBe('sha256-verified');
		const depthQuery = mocks.execute.mock.calls[0]?.[0] as { strings?: string[] } | undefined;
		expect(depthQuery?.strings?.join('')).toContain("source_locator->>'kind' = 'whole_image'");
	});

	it('continues to read legacy minio-scheme records through the SeaweedFS adapter', async () => {
		const legacyRow = evidenceRow({
			aiAnalysis: {
				depthAnalysis: {
					depthMapUrl: `minio://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`,
					sourceRevision,
					depthSha256,
					width: 1,
					height: 1,
				},
			},
		});
		mocks.limit.mockResolvedValue([legacyRow]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(200);
		expect(mocks.getFile).toHaveBeenCalledWith('evidence', `evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`);
	});

	it('serves a recorded-digest artifact whose bytes match the stored SHA-256', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: { depthAnalysis: { depthMapUrl: `seaweed://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`, sourceRevision, depthSha256, width: 1, height: 1 } },
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(200);
		expect(response.headers.get('x-depth-verification')).toBe('sha256-verified');
	});

	it('rejects legacy depth metadata without a byte digest or dimensions before object retrieval', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: { depthAnalysis: { depthMapUrl: `minio://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`, sourceRevision } },
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('rejects artifact dimensions that differ from the depth manifest', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: { depthAnalysis: { depthMapUrl: `seaweed://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`, sourceRevision, depthSha256, width: 2, height: 1 } },
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: 'Depth map dimensions do not match its manifest' });
	});

	it('fails closed when recorded-digest bytes do not match the stored SHA-256', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: { depthAnalysis: { depthMapUrl: `seaweed://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${'b'.repeat(64)}.png`, sourceRevision, depthSha256: 'b'.repeat(64), width: 1, height: 1 } },
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: 'Depth map failed digest verification' });
	});

	it('fails closed on a malformed recorded digest', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: { depthAnalysis: { depthMapUrl: `seaweed://evidence/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`, sourceRevision, depthSha256: 'not-a-digest', width: 1, height: 1 } },
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(422);
	});

	it('rejects non-SeaweedFS and non-legacy storage schemes', async () => {
		mocks.limit.mockResolvedValue([evidenceRow({
			aiAnalysis: {
				depthAnalysis: {
					depthMapUrl: `https://storage.invalid/evidence/4fe33e08-dc1e-47dd-9da5-37b4cc81a9fc/${evidenceId}-depth-${depthSha256}.png`,
					sourceRevision,
				},
			},
		})]);

		const response = await GET(event({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});
});
