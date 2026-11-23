// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('$lib/server/db/client', () => ({
	db: { select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => mocks.rows }) }) }) }) },
}));

import { GET } from './+server.js';

const evidenceId = 'b6cdd941-8d37-4b2f-97dc-80bd37d5b183';
const hash = 'a'.repeat(64);
const sourceRevision = `sha256:${hash}`;
const analysisRevision = 'analysis-fixture';

function frame() {
	return {
		frameIndex: 0, timestampMs: 1000, sourceRevision, analysisRevision, objects: [],
		motionLut: {
			schema: 'atlas.video-motion-lut.v1', processingRevision: 'gray-delta-64x128-4bpp-low-nibble-first-v1',
			evidenceId, sourceRevision, analysisRevision, frameIndex: 0, width: 64, height: 128, bitDepth: 4,
			packing: 'row-major-even-pixel-low-nibble-first', previousTimestampMs: null, timestampMs: 1000, motionScore: 0,
			artifact: { bucket: 'atlas-artifacts', objectKey: 'fixture', sha256: `sha256:${'b'.repeat(64)}`, byteLength: 4112, sourceRevision, analysisRevision },
		},
	};
}

function motionSample() {
	return {
		schema: 'atlas.video-motion-sample.v1', processingRevision: 'gray-delta-64x128-4bpp-low-nibble-first-v1',
		evidenceId, sourceRevision, analysisRevision, sampleIndex: 0, width: 64, height: 128, bitDepth: 4,
		packing: 'row-major-even-pixel-low-nibble-first', reviewState: 'UNREVIEWED_PIXEL_CHANGE_CUE',
		previousTimestampMs: null, timestampMs: 500, motionScore: 0,
		artifact: { bucket: 'atlas-artifacts', objectKey: 'fixture', sha256: `sha256:${'b'.repeat(64)}`, byteLength: 4112, sourceRevision, analysisRevision },
	};
}

function setFrame(value: ReturnType<typeof frame>) {
	mocks.rows = [{ id: evidenceId, hash, metadata: {}, aiAnalysis: { videoAnalysis: {
		schema: 'atlas.video-analysis.v1', sourceRevision, analysisRevision, frames: [value],
	} } }];
}

async function readFrame() {
	const response = await GET({ params: { id: evidenceId }, locals: { user: { id: '7' } } } as never);
	expect(response.status).toBe(200);
	return (await response.json()).frames[0];
}

describe('frame-list motion lineage', () => {
	beforeEach(() => setFrame(frame()));

	it('returns the comparison time for a matching current frame', async () => {
		const result = await readFrame();
		expect(result.motionLut).toMatchObject({ timestampMs: 1000, previousTimestampMs: null, motionScore: 0 });
	});

	it('returns a separate motion cue only when its source/run sequence is valid', async () => {
		mocks.rows = [{ id: evidenceId, hash, metadata: {}, aiAnalysis: { videoAnalysis: {
			schema: 'atlas.video-analysis.v1', sourceRevision, analysisRevision, frames: [], motionSamples: [motionSample()],
		} } }];
		const response = await GET({ params: { id: evidenceId }, locals: { user: { id: '7' } } } as never);
		expect((await response.json()).motionSamples[0]).toMatchObject({
			sampleIndex: 0, timestampMs: 500, reviewState: 'UNREVIEWED_PIXEL_CHANGE_CUE', sourceRevision, analysisRevision,
		});
		const stale = motionSample();
		stale.sourceRevision = `sha256:${'c'.repeat(64)}`;
		mocks.rows = [{ id: evidenceId, hash, metadata: {}, aiAnalysis: { videoAnalysis: {
			schema: 'atlas.video-analysis.v1', sourceRevision, analysisRevision, frames: [], motionSamples: [stale],
		} } }];
		const staleResponse = await GET({ params: { id: evidenceId }, locals: { user: { id: '7' } } } as never);
		expect((await staleResponse.json()).motionSamples).toEqual([]);
	});

	it('withholds the cue when the frame, tile timestamp, or artifact revision is inconsistent', async () => {
		const staleFrame = frame();
		staleFrame.analysisRevision = 'other-run';
		setFrame(staleFrame);
		expect((await readFrame()).motionLut).toBeNull();
		const wrongTime = frame();
		wrongTime.motionLut.timestampMs = 1001;
		setFrame(wrongTime);
		expect((await readFrame()).motionLut).toBeNull();
		const staleArtifact = frame();
		staleArtifact.motionLut.artifact.sourceRevision = `sha256:${'c'.repeat(64)}`;
		setFrame(staleArtifact);
		expect((await readFrame()).motionLut).toBeNull();
	});
});
