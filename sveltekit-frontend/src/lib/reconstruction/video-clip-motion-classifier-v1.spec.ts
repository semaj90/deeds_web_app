import { describe, it, expect } from 'vitest';
import {
	SPDX_LICENSE_POLICY_V1,
	validateArtifactLicenseForQloraMergeV1,
	classifyVideoClipMotionV1,
	packDepthQ4WithValidityMaskV1,
	unpackDepthQ4ToR8V1,
	atlasDepthMapDescriptorV1Schema,
	depthPreviewCacheKeyV1,
	type KeyframePerceptionSampleV1
} from './video-clip-motion-classifier-v1.js';

describe('Video Clip Motion Classifier, Q4 Depth Codec (`Q4_RELATIVE_V1`), Ontology Mapping & SPDX Gate (v1)', () => {
	it('admits Apache-2.0/MIT/BSL-1.0/Public Domain artifacts and blocks CC-BY-NC-4.0 / GPT-distilled datasets in production_merge mode', () => {
		expect(SPDX_LICENSE_POLICY_V1.approved_licenses).toContain('Apache-2.0');
		expect(SPDX_LICENSE_POLICY_V1.approved_licenses).toContain('BSL-1.0');
		expect(SPDX_LICENSE_POLICY_V1.blocked_by_default).toContain('CC-BY-NC-4.0');

		// Admitted in production merge
		expect(
			validateArtifactLicenseForQloraMergeV1('depth-anything/Depth-Anything-V2-Small-hf', 'production_merge').admitted
		).toBe(true);
		expect(
			validateArtifactLicenseForQloraMergeV1('depth-anything/Video-Depth-Anything-Small', 'production_merge').admitted
		).toBe(true);
		expect(
			validateArtifactLicenseForQloraMergeV1('opencv-4.5+', 'production_merge').spdx
		).toBe('Apache-2.0');
		expect(
			validateArtifactLicenseForQloraMergeV1('boost-cpp', 'production_merge').spdx
		).toBe('BSL-1.0');
		expect(
			validateArtifactLicenseForQloraMergeV1('pile-of-law/pile-of-law', 'production_merge').admitted
		).toBe(true);
		expect(
			validateArtifactLicenseForQloraMergeV1('openai/gsm8k', 'production_merge').admitted
		).toBe(true);

		// Blocked in production merge
		expect(
			validateArtifactLicenseForQloraMergeV1('depth-anything/Depth-Anything-V2-Base-hf', 'production_merge').admitted
		).toBe(false);
		expect(
			validateArtifactLicenseForQloraMergeV1('liuhaotian/LLaVA-Instruct-150K', 'production_merge').admitted
		).toBe(false);
		expect(
			validateArtifactLicenseForQloraMergeV1('HuggingFaceH4/CodeAlpaca_20K', 'production_merge').admitted
		).toBe(false);
		expect(
			validateArtifactLicenseForQloraMergeV1('Salesforce/xlam-function-calling-60k', 'production_merge').admitted
		).toBe(false);
	});

	it('packs Float32 relative depth into 4-bit Q4_RELATIVE_V1 with separate LSB0 validity mask and unpacks to R8 DataTexture bytes', () => {
		// 4 depth samples: 0.0 (min), 1.0 (max), NaN (invalid), 0.5 (mid)
		const samples = new Float32Array([0.0, 1.0, Number.NaN, 0.5]);
		const tile = packDepthQ4WithValidityMaskV1(samples, { min: 0.0, max: 1.0 });

		expect(tile.pixelCount).toBe(4);
		expect(tile.validCount).toBe(3);
		expect(tile.packedQ4.byteLength).toBe(2); // 4 pixels -> 2 bytes
		// Byte 0: sample 0 (q=0, low nibble) | sample 1 (q=15, high nibble) -> 0xf0
		expect(tile.packedQ4[0]).toBe(0xf0);
		// Validity mask: bits 0, 1, 3 set (0b1011 = 11); bit 2 (NaN) is 0
		expect(tile.validityMaskLsb0[0]).toBe(0b1011);

		const r8 = unpackDepthQ4ToR8V1(tile);
		expect(Array.from(r8)).toEqual([0, 255, 0, 8 * 17]);

		// Validate atlas.depth-map.v1 descriptor & scoped cache key
		const desc = atlasDepthMapDescriptorV1Schema.parse({
			schema: 'atlas.depth-map.v1',
			evidence_id: '0f067235-4957-4783-82a5-ad93bd71daab',
			source_sha256: 'a'.repeat(64),
			source_revision: 'rev-1',
			source_time_ms: 2000,
			analysis_revision: 'analysis-v1',
			model: 'depth-anything/Video-Depth-Anything-Small',
			model_sha256: 'b'.repeat(64),
			depth_units: 'relative',
			width: 320,
			height: 180,
			preview_encoding: 'Q4_RELATIVE_V1',
			archival_encoding: 'FLOAT32',
			normalization: { method: 'sequence-fixed-range', min: 0.0, max: 1.0 },
			review_status: 'model_proposed',
			asset_ref: 'asset:depth_preview_01'
		});
		expect(desc.preview_encoding).toBe('Q4_RELATIVE_V1');

		const cacheKey = depthPreviewCacheKeyV1({
			caseId: 'case-1',
			evidenceId: desc.evidence_id,
			sourceRevision: desc.source_revision,
			sourceTimeMs: desc.source_time_ms,
			modelRevision: desc.model_sha256.slice(0, 12),
			preprocessingRevision: 'prep-v1',
			normalizationRevision: 'seq-0-1'
		});
		expect(cacheKey).toContain('Q4_RELATIVE_V1');
	});

	it('classifies an 8s FFmpeg keyframe sequence into WALK -> REACH -> DIALOGUE cues mapped to 506-concept Scene Ontology IDs', () => {
		const keyframes: KeyframePerceptionSampleV1[] = [
			{
				frameIndex: 0,
				ptsTimeMs: 0,
				isSceneCut: true,
				dHashHex: '1111111111111111',
				bboxNormalized: [0.1, 0.2, 0.25, 0.8],
				relativeDepthMedian01: 0.3,
				upperBodyMaskDelta01: 0.02,
				hasTranscriptSpeech: false
			},
			{
				frameIndex: 1,
				ptsTimeMs: 500,
				isSceneCut: false,
				dHashHex: '1111111111111111',
				bboxNormalized: [0.1, 0.2, 0.25, 0.8],
				relativeDepthMedian01: 0.3,
				upperBodyMaskDelta01: 0.02,
				hasTranscriptSpeech: false
			},
			{
				frameIndex: 4,
				ptsTimeMs: 2000,
				isSceneCut: false,
				dHashHex: '2222222222222222',
				bboxNormalized: [0.35, 0.2, 0.5, 0.8],
				relativeDepthMedian01: 0.5,
				upperBodyMaskDelta01: 0.05,
				hasTranscriptSpeech: false
			},
			{
				frameIndex: 9,
				ptsTimeMs: 4500,
				isSceneCut: false,
				dHashHex: '4444444444444444',
				bboxNormalized: [0.36, 0.2, 0.51, 0.8],
				relativeDepthMedian01: 0.51,
				upperBodyMaskDelta01: 0.35,
				hasTranscriptSpeech: false
			},
			{
				frameIndex: 16,
				ptsTimeMs: 8000,
				isSceneCut: false,
				dHashHex: '8888888888888888',
				bboxNormalized: [0.36, 0.2, 0.51, 0.8],
				relativeDepthMedian01: 0.51,
				upperBodyMaskDelta01: 0.02,
				hasTranscriptSpeech: true
			}
		];

		const res = classifyVideoClipMotionV1({
			evidenceId: '0f067235-4957-4783-82a5-ad93bd71daab',
			sourceRevision: 'sha256:' + 'a'.repeat(64),
			clipWindowSeconds: 8,
			depthModelId: 'depth-anything/Video-Depth-Anything-Small',
			keyframes
		});

		expect(res.proposedFsmCues.map((c) => c.fsmState)).toEqual(['WALK', 'REACH', 'DIALOGUE']);
		expect(res.proposedFsmCues[0].cueConceptId).toBe('pa:event.cue.move');
		expect(res.proposedFsmCues[0].motionConceptId).toBe('pa:event.motion.proposed-trajectory');
		expect(res.proposedFsmCues[0].actorMeshConceptId).toBe('pa:geometry.representation.skinned-mesh');
		expect(res.proposedFsmCues[1].cueConceptId).toBe('pa:event.cue.interact');
		expect(res.proposedFsmCues[2].cueConceptId).toBe('pa:event.cue.dialogue');
	});
});
