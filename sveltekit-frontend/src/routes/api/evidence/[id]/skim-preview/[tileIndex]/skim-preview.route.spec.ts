import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
	rows: [] as unknown[],
	getFile: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
	and: (...values: unknown[]) => values,
	eq: (...values: unknown[]) => values,
	isNotNull: (value: unknown) => value,
	isNull: (value: unknown) => value,
	or: (...values: unknown[]) => values,
}));
vi.mock('$lib/server/db/client.js', () => ({
	db: {
		select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => mocks.rows }) }) }) }),
	},
}));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'cases.id', userId: 'cases.user_id', assignedAttorney: 'cases.assigned_attorney' },
	evidence: { id: 'evidence.id', caseId: 'evidence.case_id', hash: 'evidence.hash', aiAnalysis: 'evidence.ai_analysis', deletedAt: 'evidence.deleted_at', userId: 'evidence.user_id', uploadedBy: 'evidence.uploaded_by' },
}));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: (...args: unknown[]) => mocks.getFile(...args) }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({ ARTIFACTS_BUCKET: 'atlas-artifacts' }));

import { GET } from './+server.js';

const EVIDENCE_ID = 'b6cdd941-8d37-4b2f-97dc-80bd37d5b183';
const CASE_ID = '0b52c31f-ff93-4c6e-823a-b4e95fb5a050';
const SOURCE_HASH = createHash('sha256').update('original video').digest('hex');
const SOURCE_REVISION = `sha256:${SOURCE_HASH}`;
const ANALYSIS_REVISION = 'fixture-analysis-rev-1';
const TILE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const TILE_SHA256 = createHash('sha256').update(TILE_BYTES).digest('hex');
const OBJECT_KEY = `evidence/${CASE_ID}/${EVIDENCE_ID}/${SOURCE_HASH}/skim-preview-v1/tile-0000-${TILE_SHA256}.jpg`;

function makeManifest(sourceRevision = SOURCE_REVISION) {
	return {
		schema: 'atlas.video-skim-preview.v1',
		status: 'COMPLETED',
		sourceRevision,
		analysisRevision: ANALYSIS_REVISION,
		processingRevision: 'atlas.video-skim-preview.v1:ffmpeg-1fps-160x90-sprite100',
		durationMs: 2000,
		sampleIntervalMs: 1000,
		coverage: 'FULL_DURATION_SAMPLED_NOT_EVERY_SOURCE_FRAME',
		sampleTimestampsMs: [0, 1000],
		tileLayout: { frameWidth: 160, frameHeight: 90, framesPerTile: 100, columns: 10, rows: 10, tileWidth: 1600, tileHeight: 900 },
		tiles: [{ index: 0, objectKey: OBJECT_KEY, sha256: TILE_SHA256, byteLength: TILE_BYTES.byteLength, firstSampleIndex: 0, sampleCount: 2 }],
	};
}

function event(options: { user?: { id: string } | null; tileIndex?: string } = {}) {
	return {
		params: { id: EVIDENCE_ID, tileIndex: options.tileIndex ?? '0' },
		locals: { user: options.user === undefined ? { id: '7' } : options.user },
	} as never;
}

describe('GET /api/evidence/[id]/skim-preview/[tileIndex]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getFile.mockResolvedValue(TILE_BYTES);
		mocks.rows = [{
			id: EVIDENCE_ID,
			caseId: CASE_ID,
			hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, skimPreview: makeManifest() } },
		}];
	});

	it('serves only a current, authorized, hash-verified JPEG tile', async () => {
		const response = await GET(event());
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response.headers.get('ETag')).toBe(`"sha256-${TILE_SHA256}"`);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(TILE_BYTES);
		expect(mocks.getFile).toHaveBeenCalledWith({ bucket: 'atlas-artifacts', objectKey: OBJECT_KEY, maximumBytes: 8 * 1024 * 1024 });
	});

	it('does not disclose a tile to unauthenticated or inaccessible users', async () => {
		const unauthenticated = await GET(event({ user: null }));
		expect(unauthenticated.status).toBe(401);
		mocks.rows = [];
		const inaccessible = await GET(event());
		expect(inaccessible.status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('rejects stale source revisions and modified artifact bytes', async () => {
		mocks.rows = [{
			id: EVIDENCE_ID,
			caseId: CASE_ID,
			hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, skimPreview: makeManifest(`sha256:${'c'.repeat(64)}`) } },
		}];
		expect((await GET(event())).status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();

		mocks.rows = [{
			id: EVIDENCE_ID,
			caseId: CASE_ID,
			hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, skimPreview: makeManifest() } },
		}];
		mocks.getFile.mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0, 0xd9]));
		expect((await GET(event())).status).toBe(502);
	});
});
