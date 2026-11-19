// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { encodeVideoMotionLutV1 } from '$lib/shared/video-motion-lut-v1.js';

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], getFile: vi.fn() }));

vi.mock('drizzle-orm', () => ({
	and: (...values: unknown[]) => values,
	eq: (...values: unknown[]) => values,
	isNotNull: (value: unknown) => value,
	isNull: (value: unknown) => value,
	or: (...values: unknown[]) => values,
}));
vi.mock('$lib/server/db/client.js', () => ({
	db: { select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => mocks.rows }) }) }) }) },
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
const JOB_ID = '6248eeb0-9b3c-48d8-8d98-4531c5fe10b8';
const SOURCE_HASH = createHash('sha256').update('original video').digest('hex');
const SOURCE_REVISION = `sha256:${SOURCE_HASH}`;
const ANALYSIS_REVISION = 'fixture-analysis-rev-1';
const TILE_BYTES = Buffer.from(encodeVideoMotionLutV1(null, new Uint8Array(8192)).bytes);
const TILE_SHA256 = createHash('sha256').update(TILE_BYTES).digest('hex');
const OBJECT_KEY = `evidence/${CASE_ID}/${EVIDENCE_ID}/${SOURCE_HASH}/${JOB_ID}/motion-0000.atm`;
const SAMPLE_OBJECT_KEY = `evidence/${CASE_ID}/${EVIDENCE_ID}/${SOURCE_HASH}/${JOB_ID}/motion-sample-0000.atm`;

function makeFrame(sourceRevision = SOURCE_REVISION) {
	return {
		frameIndex: 0,
		sourceRevision: SOURCE_REVISION,
		analysisRevision: ANALYSIS_REVISION,
		timestampMs: 1250,
		motionLut: {
			schema: 'atlas.video-motion-lut.v1',
			processingRevision: 'gray-delta-64x128-4bpp-low-nibble-first-v1',
			evidenceId: EVIDENCE_ID,
			sourceRevision,
			analysisRevision: ANALYSIS_REVISION,
			frameIndex: 0,
			width: 64,
			height: 128,
			bitDepth: 4,
			packing: 'row-major-even-pixel-low-nibble-first',
			previousTimestampMs: null,
			timestampMs: 1250,
			motionScore: 0,
			artifact: {
				bucket: 'atlas-artifacts', objectKey: OBJECT_KEY, sha256: `sha256:${TILE_SHA256}`,
				byteLength: TILE_BYTES.byteLength, sourceRevision, analysisRevision: ANALYSIS_REVISION,
			},
		},
	};
}

function makeMotionSample() {
	return {
		schema: 'atlas.video-motion-sample.v1',
		processingRevision: 'gray-delta-64x128-4bpp-low-nibble-first-v1',
		evidenceId: EVIDENCE_ID,
		sourceRevision: SOURCE_REVISION,
		analysisRevision: ANALYSIS_REVISION,
		sampleIndex: 0,
		width: 64,
		height: 128,
		bitDepth: 4,
		packing: 'row-major-even-pixel-low-nibble-first',
		reviewState: 'UNREVIEWED_PIXEL_CHANGE_CUE',
		previousTimestampMs: null,
		timestampMs: 1000,
		motionScore: 0,
		artifact: {
			bucket: 'atlas-artifacts', objectKey: SAMPLE_OBJECT_KEY, sha256: `sha256:${TILE_SHA256}`,
			byteLength: TILE_BYTES.byteLength, sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION,
		},
	};
}

function event(options: { user?: { id: string } | null; frameIndex?: string; motionSample?: boolean; lod?: string } = {}) {
	const url = new URL('http://localhost/api/evidence/test/motion-preview/0');
	if (options.motionSample) url.searchParams.set('lane', 'motion-sample');
	if (options.lod !== undefined) url.searchParams.set('lod', options.lod);
	return {
		params: { id: EVIDENCE_ID, frameIndex: options.frameIndex ?? '0' },
		url,
		locals: { user: options.user === undefined ? { id: '7' } : options.user },
	} as never;
}

describe('GET /api/evidence/[id]/motion-preview/[frameIndex]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getFile.mockResolvedValue(TILE_BYTES);
		mocks.rows = [{
			id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, frames: [makeFrame()] } },
		}];
	});

	it('serves a private current tile after hash and format checks', async () => {
		const response = await GET(event());
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/vnd.atlas.video-motion-lut-v1');
		expect(response.headers.get('X-Frame-Timestamp-Ms')).toBe('1250');
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(Buffer.from(await response.arrayBuffer())).toEqual(TILE_BYTES);
		expect(mocks.getFile).toHaveBeenCalledWith({ bucket: 'atlas-artifacts', objectKey: OBJECT_KEY, maximumBytes: 4112 });
	});

	it('serves a separate dense motion sample with source and analysis revision checks', async () => {
		mocks.rows = [{
			id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, frames: [makeFrame()], motionSamples: [makeMotionSample()] } },
		}];
		const response = await GET(event({ motionSample: true, lod: '32x64' }));
		expect(response.status).toBe(200);
		expect(response.headers.get('X-Frame-Timestamp-Ms')).toBe('1000');
		expect(response.headers.get('X-Source-Revision')).toBe(SOURCE_REVISION);
		expect(response.headers.get('X-Analysis-Revision')).toBe(ANALYSIS_REVISION);
		expect(response.headers.get('X-Motion-LOD')).toBe('32x64');
		expect(response.headers.get('Content-Type')).toBe('application/vnd.atlas.video-motion-lod-4bpp-v1');
		expect(response.headers.get('Content-Length')).toBe('1024');
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		const compact = Buffer.from(await response.arrayBuffer());
		expect(compact).toEqual(Buffer.alloc(1024));
		expect(response.headers.get('ETag')).toBe(`"sha256-${createHash('sha256').update(compact).digest('hex')}"`);
		expect(mocks.getFile).toHaveBeenCalledWith({ bucket: 'atlas-artifacts', objectKey: SAMPLE_OBJECT_KEY, maximumBytes: 4112 });
		const legacyResponse = await GET(event());
		expect(legacyResponse.status).toBe(200);
		expect(mocks.getFile).toHaveBeenLastCalledWith({ bucket: 'atlas-artifacts', objectKey: OBJECT_KEY, maximumBytes: 4112 });
	});

	it('denies unauthenticated and inaccessible callers without reading storage', async () => {
		expect((await GET(event({ user: null, lod: '32x64' }))).status).toBe(401);
		mocks.rows = [];
		expect((await GET(event({ lod: '32x64' }))).status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('rejects an unknown LOD and a same-length corrupted compact source', async () => {
		expect((await GET(event({ lod: '256x512' }))).status).toBe(400);
		expect(mocks.getFile).not.toHaveBeenCalled();
		const corrupted = Buffer.from(TILE_BYTES);
		corrupted[16] = 0xf0;
		mocks.getFile.mockResolvedValueOnce(corrupted);
		const response = await GET(event({ lod: '32x64' }));
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ success: false, error: 'MOTION_TILE_INTEGRITY_FAILED' });
	});

	it('rejects stale source revisions and corrupted tile bytes', async () => {
		mocks.rows = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, frames: [makeFrame(`sha256:${'c'.repeat(64)}`)] } } }];
		expect((await GET(event())).status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();

		mocks.rows = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, frames: [makeFrame()] } } }];
		mocks.getFile.mockResolvedValueOnce(Buffer.from('corrupt'));
		expect((await GET(event())).status).toBe(502);
	});

	it('rejects an artifact with mismatched source lineage or a future comparison before reading storage', async () => {
		const frame = makeFrame();
		frame.motionLut.artifact.sourceRevision = `sha256:${'c'.repeat(64)}`;
		mocks.rows = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, frames: [frame] } } }];
		expect((await GET(event())).status).toBe(404);
		frame.motionLut.artifact.sourceRevision = SOURCE_REVISION;
		(frame.motionLut as { previousTimestampMs: number | null }).previousTimestampMs = 1251;
		expect((await GET(event())).status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('rejects a tile attached to a frame from another analysis run', async () => {
		const frame = makeFrame();
		frame.analysisRevision = 'different-run';
		mocks.rows = [{ id: EVIDENCE_ID, caseId: CASE_ID, hash: SOURCE_HASH,
			aiAnalysis: { videoAnalysis: { sourceRevision: SOURCE_REVISION, analysisRevision: ANALYSIS_REVISION, frames: [frame] } } }];
		expect((await GET(event())).status).toBe(404);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});
});
