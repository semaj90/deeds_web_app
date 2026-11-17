import { describe, expect, it } from 'vitest';
import {
	FILMCRAFT_TICKS_PER_SECOND,
	STORYBOARD_MANIFEST_SCHEMA_V1,
	parseFfprobeStreamsJsonV1,
	validateStoryboardManifestOrThrow,
	type StoryboardExportManifestV1
} from '../storyboard-manifest-contract-v1.js';

const VALID_SHA256 = 'a'.repeat(64);
const VALID_DHASH64 = '0x0f1e2d3c4b5a6978';

function createValidManifest(): StoryboardExportManifestV1 {
	return {
		schemaVersion: STORYBOARD_MANIFEST_SCHEMA_V1,
		manifestId: 'sb-manifest-986b5214-01',
		caseId: 'case-986b5214',
		renderer: {
			rendererId: 'filmcraft-deterministic-h264-v1',
			rendererRevision: '0.20.1',
			deterministicFrameGuarantee: true,
			syntheticDisclosureTag: 'contains-synthetic-placeholders',
			disclosureStatement: 'Synthetic reconstruction slats are disclosed separately from CCTV frames.'
		},
		segments: [
			{
				segmentId: 'seg-01-cam-n-04',
				claimKind: 'factual_observation',
				label: 'Cam-N-04 Badge Reader Approach (00:14-00:15)',
				sourceLocator: {
					evidenceId: 'ev-008',
					sourceSha256: VALID_SHA256,
					startTick: 14n * FILMCRAFT_TICKS_PER_SECOND,
					endTick: 15n * FILMCRAFT_TICKS_PER_SECOND,
					dhash64: VALID_DHASH64,
					dhashAlgorithm: 'dhash_gray_9x8',
					seaweedObjectKey: 'cases/986b5214/cam-n-04/frame_000420.jpg',
					frameIndex: 420
				}
			},
			{
				segmentId: 'seg-02-gap-slate',
				claimKind: 'synthetic_placeholder',
				label: 'Unmonitored Hallway Gap Reconstruction',
				durationTicks: 2n * FILMCRAFT_TICKS_PER_SECOND,
				disclosure: {
					isSynthetic: true,
					disclosureBadge: 'SYNTHETIC RECONSTRUCTION',
					rendererRevision: 'filmcraft-0.20.1-spatial-layout',
					rationale: 'No camera covers the server closet blind spot; geometry is schematic only.'
				}
			}
		]
	};
}

describe('storyboard-manifest-contract-v1', () => {
	it('rejects a factual_observation segment that omits a valid sourceSha256 or dhash64 locator', () => {
		const missingSha = createValidManifest();
		missingSha.segments = [
			{
				segmentId: 'seg-bad-sha',
				claimKind: 'factual_observation',
				label: 'Unbound factual claim',
				sourceLocator: {
					evidenceId: 'ev-008',
					sourceSha256: 'not-a-sha256',
					startTick: 14n * FILMCRAFT_TICKS_PER_SECOND,
					endTick: 15n * FILMCRAFT_TICKS_PER_SECOND,
					dhash64: VALID_DHASH64,
					dhashAlgorithm: 'dhash_gray_9x8'
				}
			}
		];
		expect(() => validateStoryboardManifestOrThrow(missingSha)).toThrow(/sourceSha256/i);

		const badDhash = createValidManifest();
		badDhash.segments = [
			{
				segmentId: 'seg-bad-dhash',
				claimKind: 'factual_observation',
				label: 'Missing dHash fingerprint',
				sourceLocator: {
					evidenceId: 'ev-008',
					sourceSha256: VALID_SHA256,
					startTick: 14n * FILMCRAFT_TICKS_PER_SECOND,
					endTick: 15n * FILMCRAFT_TICKS_PER_SECOND,
					dhash64: '1234',
					dhashAlgorithm: 'dhash_gray_9x8'
				}
			}
		];
		expect(() => validateStoryboardManifestOrThrow(badDhash)).toThrow(/dhash64/i);

		const badTicks = createValidManifest();
		badTicks.segments = [
			{
				segmentId: 'seg-bad-ticks',
				claimKind: 'factual_observation',
				label: 'Inverted tick window',
				sourceLocator: {
					evidenceId: 'ev-008',
					sourceSha256: VALID_SHA256,
					startTick: 15n * FILMCRAFT_TICKS_PER_SECOND,
					endTick: 14n * FILMCRAFT_TICKS_PER_SECOND,
					dhash64: VALID_DHASH64
				}
			}
		];
		expect(() => validateStoryboardManifestOrThrow(badTicks)).toThrow(/tick range/i);
	});

	it('rejects browser-preview-realtime-v1 claiming deterministicFrameGuarantee: true and rejects synthetic segment missing disclosure', () => {
		const illegalPreviewManifest = createValidManifest();
		illegalPreviewManifest.renderer = {
			rendererId: 'browser-preview-realtime-v1',
			rendererRevision: 'webgpu-mbvh4-v1',
			deterministicFrameGuarantee: true
		};
		expect(() => validateStoryboardManifestOrThrow(illegalPreviewManifest)).toThrow(
			/browser-preview-realtime-v1 cannot claim deterministicFrameGuarantee/i
		);

		const undisclosedSynthetic = createValidManifest();
		undisclosedSynthetic.segments = [
			{
				segmentId: 'seg-undisclosed',
				claimKind: 'synthetic_reconstruction',
				label: 'Undisclosed CGI insert',
				durationTicks: FILMCRAFT_TICKS_PER_SECOND,
				disclosure: undefined as unknown as NonNullable<unknown> as never
			}
		];
		expect(() => validateStoryboardManifestOrThrow(undisclosedSynthetic)).toThrow(
			/requires disclosure metadata/i
		);
	});

	it('accepts properly bound factual observations alongside disclosed synthetic placeholders', () => {
		const valid = createValidManifest();
		expect(() => validateStoryboardManifestOrThrow(valid)).not.toThrow();

		const previewValid = createValidManifest();
		previewValid.renderer = {
			rendererId: 'browser-preview-realtime-v1',
			rendererRevision: 'webgpu-mbvh4-v1',
			deterministicFrameGuarantee: false
		};
		expect(() => validateStoryboardManifestOrThrow(previewValid)).not.toThrow();
	});

	it('parseFfprobeStreamsJsonV1 detects silent CCTV video streams (hasAudioStream: false) without crashing and detects audio streams when present, computing exact FilmCraft duration ticks', () => {
		const silentCctvJson = JSON.stringify({
			streams: [
				{
					index: 0,
					codec_type: 'video',
					codec_name: 'h264',
					width: 1920,
					height: 1080,
					r_frame_rate: '30/1',
					duration: '12.500000'
				}
			],
			format: {
				duration: '12.500000'
			}
		});

		const silentProbe = parseFfprobeStreamsJsonV1(silentCctvJson);
		expect(silentProbe.hasVideoStream).toBe(true);
		expect(silentProbe.hasAudioStream).toBe(false);
		expect(silentProbe.videoCodec).toBe('h264');
		expect(silentProbe.width).toBe(1920);
		expect(silentProbe.height).toBe(1080);
		expect(silentProbe.durationSeconds).toBe(12.5);
		expect(silentProbe.durationFilmcraftTicks).toBe(
			12n * FILMCRAFT_TICKS_PER_SECOND + FILMCRAFT_TICKS_PER_SECOND / 2n
		);

		const audioVideoJson = JSON.stringify({
			streams: [
				{
					index: 0,
					codec_type: 'video',
					codec_name: 'hevc',
					width: 3840,
					height: 2160,
					r_frame_rate: '24000/1001',
					duration: '4.000000'
				},
				{
					index: 1,
					codec_type: 'audio',
					codec_name: 'aac',
					duration: '4.000000'
				}
			],
			format: {
				duration: '4.000000'
			}
		});

		const avProbe = parseFfprobeStreamsJsonV1(audioVideoJson);
		expect(avProbe.hasVideoStream).toBe(true);
		expect(avProbe.hasAudioStream).toBe(true);
		expect(avProbe.videoCodec).toBe('hevc');
		expect(avProbe.durationFilmcraftTicks).toBe(4n * FILMCRAFT_TICKS_PER_SECOND);
	});
});
