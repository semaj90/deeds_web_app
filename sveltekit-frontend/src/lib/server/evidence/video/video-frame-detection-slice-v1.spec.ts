import { describe, expect, it } from 'vitest';
import {
	EVIDENCE_EMBEDDING_TYPE,
	EVIDENCE_SOURCE_FIELD,
} from '../evidence-embedding-contract.js';
import {
	EMBEDDINGGEMMA2_COMBINED_TOKEN_BUDGET_V1,
	GEMMA4_VLM_PREPROCESSING_RECIPE_V1,
	TEXT_ONLY_PROJECTION_LANE_V1,
	buildAuthorizedViewerFrameSeekV1,
	buildStage1VideoFrameRecordV1,
	checkEvidenceVectorMultimodalBoundaryV1,
	mapYolo640BoxToSourceFrameV1,
	planEmbeddingGemma2WindowFrameBudgetV1,
	verifyPersistedVideoFrameReadbackV1,
} from './video-frame-detection-slice-v1.js';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '22222222-2222-4222-8222-222222222222';
const FRAME_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_REV = `sha256:${'a'.repeat(64)}`;

describe('video-frame-detection-slice-v1 Stage 1 & Stage 2 boundaries', () => {
	it('maps YOLO 640x640 boxes back to source frame dimensions and flags aspect distortion vs letterbox', () => {
		const stretched = mapYolo640BoxToSourceFrameV1({
			className: 'person',
			confidence: 0.91,
			bbox640: [160, 160, 320, 480],
			resizeMode: 'direct_resize_640',
			sourceWidth: 1920,
			sourceHeight: 1080,
		});

		expect(stretched.bboxSourceXyxy).toEqual([480, 270, 960, 810]);
		expect(stretched.aspectRatioDistortionWarning).toBe(true);
		expect(stretched.identifiesPerson).toBe(false);
		expect(stretched.evidenceStatus).toBe('derived_detection_only');

		// For 1920x1080 letterboxed into 640x640: scale = 1/3, unscaled height = 360, padY = (640 - 360) / 2 = 140
		const letterboxed = mapYolo640BoxToSourceFrameV1({
			className: 'car',
			confidence: 0.87,
			bbox640: [100, 140, 420, 500],
			resizeMode: 'letterbox_640',
			sourceWidth: 1920,
			sourceHeight: 1080,
		});

		expect(letterboxed.bboxSourceXyxy).toEqual([300, 0, 1260, 1080]);
		expect(letterboxed.aspectRatioDistortionWarning).toBe(false);
	});

	it('builds Stage 1 Postgres frame record, verifies readback, and produces authorized viewer seek target', () => {
		const frameRecord = buildStage1VideoFrameRecordV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			sourceRevision: SOURCE_REV,
			frameIndex: 4,
			timestampMs: 14_000,
			storageUri: `seaweedfs://evidence/cases/${CASE_ID}/frames/frame-00004.jpg`,
			dhashHex: '0123456789abcdef',
			detections: [
				{
					className: 'person',
					confidence: 0.925,
					bbox640: [100, 120, 260, 520],
					resizeMode: 'direct_resize_640',
					sourceWidth: 768,
					sourceHeight: 432,
				},
			],
		});

		expect(frameRecord.filmcraftTicks).toBe(String(14_000n * 254_016_000n));
		expect(frameRecord.dhashClue).toEqual({
			hex: '0123456789abcdef',
			role: 'deduplication_clue_only',
			proofAuthority: false,
		});
		expect(frameRecord.tagsJson).toEqual(['person']);
		expect(frameRecord.confidence).toBe('0.925');

		const readbackRow = {
			id: FRAME_ID,
			evidenceId: EVIDENCE_ID,
			timestampMs: 14_000,
			storageUri: frameRecord.storageUri,
			objectsJson: frameRecord.objectsJson,
			sourceRevision: SOURCE_REV,
		};

		const unauthorized = buildAuthorizedViewerFrameSeekV1({
			caseAuthorized: false,
			expected: frameRecord,
			readback: readbackRow,
		});
		expect(unauthorized).toEqual({ ok: false, reason: 'CASE_AUTHORIZATION_REQUIRED' });

		const staleRevision = verifyPersistedVideoFrameReadbackV1(frameRecord, {
			...readbackRow,
			sourceRevision: `sha256:${'b'.repeat(64)}`,
		});
		expect(staleRevision.ok).toBe(false);
		if ('reasons' in staleRevision) {
			expect(staleRevision.reasons).toContain('FRAME_SOURCE_REVISION_MISMATCH');
		}

		const seekDecision = buildAuthorizedViewerFrameSeekV1({
			caseAuthorized: true,
			expected: frameRecord,
			readback: readbackRow,
		});
		expect(seekDecision.ok).toBe(true);
		if (seekDecision.ok) {
			expect(seekDecision.seekTarget.seekSeconds).toBe(14);
			expect(seekDecision.seekTarget.frameId).toBe(FRAME_ID);
			expect(seekDecision.seekTarget.boxes[0]?.identifiesPerson).toBe(false);
		}
	});

	it('blocks multimodal vectors from reusing text-only evidence_vectors contracts or 2048px VLM resize', () => {
		const rejected = checkEvidenceVectorMultimodalBoundaryV1({
			modality: 'video_frame',
			embeddingType: EVIDENCE_EMBEDDING_TYPE,
			sourceField: EVIDENCE_SOURCE_FIELD,
			projectionLane: TEXT_ONLY_PROJECTION_LANE_V1,
			preprocessingRecipe: GEMMA4_VLM_PREPROCESSING_RECIPE_V1,
			maxEdgePx: 2048,
			modelRevision: '',
		});

		expect(rejected.ok).toBe(false);
		if ('reasons' in rejected) {
			expect(rejected.reasons).toEqual([
				'TEXT_ONLY_EMBEDDING_TYPE_VIOLATION',
				'TEXT_ONLY_SOURCE_FIELD_VIOLATION',
				'TEXT_ONLY_PROJECTION_LANE_VIOLATION',
				'VLM_2048PX_RESIZE_NOT_ALLOWED_FOR_EMBEDDINGGEMMA2',
				'MODEL_REVISION_REQUIRED',
				'VIDEO_TIME_RANGE_MS_REQUIRED',
			]);
		}

		const admittedSeparateLane = checkEvidenceVectorMultimodalBoundaryV1({
			modality: 'video_window',
			embeddingType: 'evidence_video_window_mm_semantic_768',
			sourceField: 'sampled_keyframe_window_v1',
			projectionLane: 'evidence_multimodal_semantic_768',
			preprocessingRecipe: 'embeddinggemma2-mm-patch-v1',
			modelRevision: 'google/embeddinggemma-2@rev1',
			timeRangeMs: [12_000, 16_000],
		});
		expect(admittedSeparateLane).toEqual({ ok: true });

		// 58 frames * 140 tokens = 8,120 visual tokens, exceeding 8,192 once text + output are included
		const budget58 = planEmbeddingGemma2WindowFrameBudgetV1({
			framesCount: 58,
			textTokens: 400,
			reservedOutputTokens: 256,
		});
		expect(budget58.budgetTokens).toBe(EMBEDDINGGEMMA2_COMBINED_TOKEN_BUDGET_V1);
		expect(budget58.visualTokens).toBe(8120);
		expect(budget58.fits).toBe(false);
		expect(budget58.maxFramesWithinBudget).toBe(53);
	});
});
