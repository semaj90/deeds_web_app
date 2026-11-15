import { describe, expect, it, vi } from 'vitest';
vi.mock('$lib/server/env.server.js', () => ({ ENV: { FFMPEG_PATH: 'ffmpeg' } }));
import {
	VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1,
	videoSkimPreviewManifestV1Schema,
} from '../video-skim-preview-v1.js';

function manifest(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'atlas.video-skim-preview.v1',
		status: 'COMPLETED',
		sourceRevision: `sha256:${'a'.repeat(64)}`,
		analysisRevision: 'fixture-analysis-rev-1',
		processingRevision: VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1,
		durationMs: 3000,
		sampleIntervalMs: 1000,
		coverage: 'FULL_DURATION_SAMPLED_NOT_EVERY_SOURCE_FRAME',
		sampleTimestampsMs: [0, 1000, 2000],
		tileLayout: {
			frameWidth: 160,
			frameHeight: 90,
			framesPerTile: 100,
			columns: 10,
			rows: 10,
			tileWidth: 1600,
			tileHeight: 900,
		},
		tiles: [{
			index: 0,
			objectKey: 'evidence/case/evidence/source/skim-preview-v1/tile-0000-fixture.jpg',
			sha256: 'b'.repeat(64),
			byteLength: 1000,
			firstSampleIndex: 0,
			sampleCount: 3,
		}],
		...overrides,
	};
}

describe('video skim preview manifest v1', () => {
	it('accepts a complete, revision-bound sample and tile manifest', () => {
		const result = videoSkimPreviewManifestV1Schema.safeParse(manifest());
		expect(result.success).toBe(true);
	});

	it('rejects timestamps outside duration and non-monotonic samples', () => {
		expect(videoSkimPreviewManifestV1Schema.safeParse(manifest({ sampleTimestampsMs: [0, 1000, 1000] })).success).toBe(false);
		expect(videoSkimPreviewManifestV1Schema.safeParse(manifest({ sampleTimestampsMs: [0, 1000, 3000] })).success).toBe(false);
	});

	it('rejects gaps or overlaps in tile sample coverage', () => {
		expect(videoSkimPreviewManifestV1Schema.safeParse(manifest({
			tiles: [{ ...manifest().tiles[0], firstSampleIndex: 1 }],
		})).success).toBe(false);
		expect(videoSkimPreviewManifestV1Schema.safeParse(manifest({
			tiles: [{ ...manifest().tiles[0], sampleCount: 2 }],
		})).success).toBe(false);
	});
});
