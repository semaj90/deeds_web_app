import { z } from 'zod';
import { FILMCRAFT_TICKS_PER_SECOND_V1 } from '../../courtroom/filmcraft-cli-adapter-v1.js';
import {
	EVIDENCE_EMBEDDING_TYPE,
	EVIDENCE_SOURCE_FIELD,
} from '../evidence-embedding-contract.js';

export const YOLO_ONNX_INPUT_EDGE_V1 = 640 as const;
export const FFMPEG_DEFAULT_SAMPLE_WIDTH_V1 = 768 as const;
export const STAGE1_MAX_SAMPLED_FRAMES_V1 = 32 as const;
export const EMBEDDINGGEMMA2_COMBINED_TOKEN_BUDGET_V1 = 8192 as const;
export const EMBEDDINGGEMMA2_DEFAULT_TOKENS_PER_FRAME_V1 = 140 as const;
export const TEXT_ONLY_PROJECTION_LANE_V1 = 'evidence_semantic_768' as const;
export const GEMMA4_VLM_PREPROCESSING_RECIPE_V1 = 'gemma4-vlm-max-edge-2048' as const;

const SHA256_REF_SCHEMA = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const DHASH64_HEX_SCHEMA = z.string().regex(/^[0-9a-f]{16}$/i);

const StorageUriSchema = z
	.string()
	.min(1)
	.max(1024)
	.refine(
		(value) =>
			!value.includes('\\') &&
			!value.includes('\0') &&
			!value.split('/').some((segment) => segment === '..') &&
			(/^(seaweed|seaweedfs):\/\/[^/]+\/.+/.test(value) || value.startsWith('evidence/') || value.startsWith('cases/')),
		'INVALID_SEAWEED_STORAGE_URI',
	);

export const YoloBoxResizeModeV1Schema = z.enum(['direct_resize_640', 'letterbox_640']);
export type YoloBoxResizeModeV1 = z.infer<typeof YoloBoxResizeModeV1Schema>;

export const YoloDetectionInputV1Schema = z.object({
	className: z.string().trim().min(1).max(120),
	confidence: z.number().finite().min(0).max(1),
	bbox640: z.tuple([
		z.number().finite().min(0).max(YOLO_ONNX_INPUT_EDGE_V1),
		z.number().finite().min(0).max(YOLO_ONNX_INPUT_EDGE_V1),
		z.number().finite().min(0).max(YOLO_ONNX_INPUT_EDGE_V1),
		z.number().finite().min(0).max(YOLO_ONNX_INPUT_EDGE_V1),
	]),
	resizeMode: YoloBoxResizeModeV1Schema,
	sourceWidth: z.number().int().positive().max(16384),
	sourceHeight: z.number().int().positive().max(16384),
});

export type YoloDetectionInputV1 = z.infer<typeof YoloDetectionInputV1Schema>;

export interface MappedSourceFrameDetectionV1 {
	readonly className: string;
	readonly confidence: number;
	readonly resizeMode: YoloBoxResizeModeV1;
	readonly bboxSourceXyxy: readonly [number, number, number, number];
	readonly sourceWidth: number;
	readonly sourceHeight: number;
	readonly aspectRatioDistortionWarning: boolean;
	readonly identifiesPerson: false;
	readonly evidenceStatus: 'derived_detection_only';
}

function clampCoord(value: number, max: number): number {
	if (value <= 0) return 0;
	if (value >= max) return max;
	return Math.round(value * 1000) / 1000;
}

/**
 * Maps YOLO 640x640 ONNX detection boxes back to source-frame pixel coordinates.
 * Explicitly distinguishes yolo.ts's direct (640, 640) resize from uniform letterboxing
 * and enforces that COCO class labels such as 'person' never assert identity.
 */
export function mapYolo640BoxToSourceFrameV1(
	rawInput: YoloDetectionInputV1,
): MappedSourceFrameDetectionV1 {
	const input = YoloDetectionInputV1Schema.parse(rawInput);
	const [rawX1, rawY1, rawX2, rawY2] = input.bbox640;
	if (rawX2 < rawX1 || rawY2 < rawY1) {
		throw new RangeError('YOLO_BBOX_COORDINATES_INVERTED');
	}

	const { sourceWidth, sourceHeight, resizeMode } = input;
	let x1: number;
	let y1: number;
	let x2: number;
	let y2: number;
	let aspectRatioDistortionWarning = false;

	if (resizeMode === 'direct_resize_640') {
		const scaleX = sourceWidth / YOLO_ONNX_INPUT_EDGE_V1;
		const scaleY = sourceHeight / YOLO_ONNX_INPUT_EDGE_V1;
		x1 = rawX1 * scaleX;
		y1 = rawY1 * scaleY;
		x2 = rawX2 * scaleX;
		y2 = rawY2 * scaleY;
		aspectRatioDistortionWarning = Math.abs(sourceWidth / sourceHeight - 1) > 0.05;
	} else {
		const scale = Math.min(
			YOLO_ONNX_INPUT_EDGE_V1 / sourceWidth,
			YOLO_ONNX_INPUT_EDGE_V1 / sourceHeight,
		);
		const padX = (YOLO_ONNX_INPUT_EDGE_V1 - sourceWidth * scale) / 2;
		const padY = (YOLO_ONNX_INPUT_EDGE_V1 - sourceHeight * scale) / 2;
		x1 = (rawX1 - padX) / scale;
		y1 = (rawY1 - padY) / scale;
		x2 = (rawX2 - padX) / scale;
		y2 = (rawY2 - padY) / scale;
	}

	const clampedX1 = clampCoord(x1, sourceWidth);
	const clampedY1 = clampCoord(y1, sourceHeight);
	const clampedX2 = clampCoord(x2, sourceWidth);
	const clampedY2 = clampCoord(y2, sourceHeight);

	return {
		className: input.className,
		confidence: input.confidence,
		resizeMode,
		bboxSourceXyxy: [
			clampedX1,
			clampedY1,
			Math.max(clampedX1, clampedX2),
			Math.max(clampedY1, clampedY2),
		],
		sourceWidth,
		sourceHeight,
		aspectRatioDistortionWarning,
		identifiesPerson: false,
		evidenceStatus: 'derived_detection_only',
	};
}

export const Stage1VideoFrameInputV1Schema = z.object({
	evidenceId: z.string().uuid(),
	caseId: z.string().uuid(),
	sourceRevision: SHA256_REF_SCHEMA,
	frameIndex: z.number().int().nonnegative().safe(),
	timestampMs: z.number().int().nonnegative().max(0xffff_ffff),
	storageUri: StorageUriSchema,
	sampleWidthPx: z.number().int().positive().max(8192).default(FFMPEG_DEFAULT_SAMPLE_WIDTH_V1),
	dhashHex: DHASH64_HEX_SCHEMA.optional(),
	detections: z.array(YoloDetectionInputV1Schema).max(256),
	vlmModel: z.string().trim().min(1).max(120).nullable().optional().default(null),
	caption: z.string().max(4000).nullable().optional().default(null),
	ocrText: z.string().max(8000).nullable().optional().default(null),
});

export type Stage1VideoFrameInputV1 = z.input<typeof Stage1VideoFrameInputV1Schema>;

export interface Stage1VideoFrameRecordV1 {
	readonly schema: 'atlas.stage1-video-frame-record.v1';
	readonly evidenceId: string;
	readonly caseId: string;
	readonly sourceRevision: string;
	readonly frameIndex: number;
	readonly timestampMs: number;
	readonly filmcraftTicks: string;
	readonly storageUri: string;
	readonly sampleWidthPx: number;
	readonly dhashClue: {
		readonly hex: string;
		readonly role: 'deduplication_clue_only';
		readonly proofAuthority: false;
	} | null;
	readonly objectsJson: readonly MappedSourceFrameDetectionV1[];
	readonly tagsJson: readonly string[];
	readonly vlmModel: string | null;
	readonly caption: string | null;
	readonly ocrText: string | null;
	readonly confidence: string | null;
}

const TICKS_PER_MS = BigInt(FILMCRAFT_TICKS_PER_SECOND_V1) / 1000n;

/**
 * Builds the canonical Stage 1 Postgres evidence_frames + SeaweedFS payload
 * with FilmCraft ticks, mapped YOLO boxes, and non-identifying detection tags.
 */
export function buildStage1VideoFrameRecordV1(
	rawInput: Stage1VideoFrameInputV1,
): Stage1VideoFrameRecordV1 {
	const input = Stage1VideoFrameInputV1Schema.parse(rawInput);
	const mappedDetections = input.detections.map((detection) =>
		mapYolo640BoxToSourceFrameV1(detection),
	);
	const uniqueTags = [...new Set(mappedDetections.map((item) => item.className))];
	const maxConfidence =
		mappedDetections.length > 0
			? Math.max(...mappedDetections.map((item) => item.confidence)).toFixed(3)
			: null;

	return {
		schema: 'atlas.stage1-video-frame-record.v1',
		evidenceId: input.evidenceId,
		caseId: input.caseId,
		sourceRevision: input.sourceRevision,
		frameIndex: input.frameIndex,
		timestampMs: input.timestampMs,
		filmcraftTicks: (BigInt(input.timestampMs) * TICKS_PER_MS).toString(),
		storageUri: input.storageUri,
		sampleWidthPx: input.sampleWidthPx,
		dhashClue: input.dhashHex
			? {
					hex: input.dhashHex.toLowerCase(),
					role: 'deduplication_clue_only',
					proofAuthority: false,
				}
			: null,
		objectsJson: mappedDetections,
		tagsJson: uniqueTags,
		vlmModel: input.vlmModel ?? null,
		caption: input.caption ?? null,
		ocrText: input.ocrText ?? null,
		confidence: maxConfidence,
	};
}

export interface PersistedVideoFrameReadbackRowV1 {
	readonly id: string;
	readonly evidenceId: string;
	readonly timestampMs: number;
	readonly storageUri: string;
	readonly objectsJson: unknown;
	readonly sourceRevision?: string | null;
}

export type VideoFrameReadbackCheckV1 =
	| {
			readonly ok: true;
			readonly frameId: string;
			readonly evidenceId: string;
			readonly timestampMs: number;
			readonly storageUri: string;
			readonly sourceRevision: string;
			readonly detectionCount: number;
	  }
	| {
			readonly ok: false;
			readonly reasons: readonly string[];
	  };

/** Verifies PostgreSQL readback of an evidence_frames row against expected Stage 1 identity. */
export function verifyPersistedVideoFrameReadbackV1(
	expected: Stage1VideoFrameRecordV1,
	readback: PersistedVideoFrameReadbackRowV1 | null | undefined,
): VideoFrameReadbackCheckV1 {
	const reasons: string[] = [];
	if (!readback) {
		return { ok: false, reasons: ['FRAME_READBACK_MISSING'] };
	}
	if (!z.string().uuid().safeParse(readback.id).success) {
		reasons.push('FRAME_ID_INVALID');
	}
	if (readback.evidenceId !== expected.evidenceId) {
		reasons.push('FRAME_EVIDENCE_ID_MISMATCH');
	}
	if (readback.timestampMs !== expected.timestampMs) {
		reasons.push('FRAME_TIMESTAMP_MS_MISMATCH');
	}
	if (readback.storageUri !== expected.storageUri) {
		reasons.push('FRAME_STORAGE_URI_MISMATCH');
	}
	if (readback.sourceRevision && readback.sourceRevision !== expected.sourceRevision) {
		reasons.push('FRAME_SOURCE_REVISION_MISMATCH');
	}
	const readbackObjects = Array.isArray(readback.objectsJson) ? readback.objectsJson : null;
	if (!readbackObjects || readbackObjects.length !== expected.objectsJson.length) {
		reasons.push('FRAME_DETECTION_COUNT_MISMATCH');
	}

	return reasons.length === 0
		? {
				ok: true,
				frameId: readback.id,
				evidenceId: expected.evidenceId,
				timestampMs: expected.timestampMs,
				storageUri: expected.storageUri,
				sourceRevision: expected.sourceRevision,
				detectionCount: expected.objectsJson.length,
		  }
		: { ok: false, reasons };
}

export interface AuthorizedViewerFrameSeekV1 {
	readonly schema: 'atlas.authorized-viewer-frame-seek.v1';
	readonly evidenceId: string;
	readonly caseId: string;
	readonly sourceRevision: string;
	readonly frameId: string;
	readonly timestampMs: number;
	readonly seekSeconds: number;
	readonly filmcraftTicks: string;
	readonly storageUri: string;
	readonly boxes: readonly MappedSourceFrameDetectionV1[];
}

export type ViewerFrameSeekDecisionV1 =
	| { readonly ok: true; readonly seekTarget: AuthorizedViewerFrameSeekV1 }
	| { readonly ok: false; readonly reason: string };

/** Builds a seek command for EvidenceViewModal only when case access and DB readback pass. */
export function buildAuthorizedViewerFrameSeekV1(input: {
	caseAuthorized: boolean;
	expected: Stage1VideoFrameRecordV1;
	readback: PersistedVideoFrameReadbackRowV1 | null | undefined;
}): ViewerFrameSeekDecisionV1 {
	if (input.caseAuthorized !== true) {
		return { ok: false, reason: 'CASE_AUTHORIZATION_REQUIRED' };
	}
	const verified = verifyPersistedVideoFrameReadbackV1(input.expected, input.readback);
	if ('reasons' in verified) {
		return { ok: false, reason: `READBACK_FAILED:${verified.reasons.join(',')}` };
	}

	return {
		ok: true,
		seekTarget: {
			schema: 'atlas.authorized-viewer-frame-seek.v1',
			evidenceId: input.expected.evidenceId,
			caseId: input.expected.caseId,
			sourceRevision: input.expected.sourceRevision,
			frameId: verified.frameId,
			timestampMs: input.expected.timestampMs,
			seekSeconds: input.expected.timestampMs / 1000,
			filmcraftTicks: input.expected.filmcraftTicks,
			storageUri: input.expected.storageUri,
			boxes: input.expected.objectsJson,
		},
	};
}

export function planEmbeddingGemma2WindowFrameBudgetV1(input: {
	framesCount: number;
	textTokens?: number;
	reservedOutputTokens?: number;
	tokensPerFrame?: number;
	budgetTokens?: number;
}): {
	readonly fits: boolean;
	readonly visualTokens: number;
	readonly totalTokens: number;
	readonly budgetTokens: number;
	readonly maxFramesWithinBudget: number;
} {
	const framesCount = Math.max(0, Math.floor(input.framesCount));
	const textTokens = Math.max(0, Math.floor(input.textTokens ?? 0));
	const reservedOutputTokens = Math.max(0, Math.floor(input.reservedOutputTokens ?? 512));
	const tokensPerFrame = Math.max(1, Math.floor(input.tokensPerFrame ?? EMBEDDINGGEMMA2_DEFAULT_TOKENS_PER_FRAME_V1));
	const budgetTokens = Math.max(1, Math.floor(input.budgetTokens ?? EMBEDDINGGEMMA2_COMBINED_TOKEN_BUDGET_V1));

	const visualTokens = framesCount * tokensPerFrame;
	const totalTokens = visualTokens + textTokens + reservedOutputTokens;
	const remainingForFrames = Math.max(0, budgetTokens - textTokens - reservedOutputTokens);
	const maxFramesWithinBudget = Math.floor(remainingForFrames / tokensPerFrame);

	return {
		fits: totalTokens <= budgetTokens,
		visualTokens,
		totalTokens,
		budgetTokens,
		maxFramesWithinBudget,
	};
}

export interface MultimodalVectorBoundaryInputV1 {
	readonly modality: 'text' | 'image' | 'video_frame' | 'video_window';
	readonly embeddingType: string;
	readonly sourceField: string;
	readonly projectionLane: string;
	readonly preprocessingRecipe: string;
	readonly maxEdgePx?: number;
	readonly modelRevision: string;
	readonly timeRangeMs?: readonly [number, number];
}

export type MultimodalVectorBoundaryDecisionV1 =
	| { readonly ok: true }
	| { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Enforces schema-postgres.ts (1500-1501, 1539) constraint separation so image/video
 * EmbeddingGemma 2 vectors never reuse text-only evidence_vectors/outbox contracts
 * or Sharp's 2048px VLM resize preprocessing.
 */
export function checkEvidenceVectorMultimodalBoundaryV1(
	input: MultimodalVectorBoundaryInputV1,
): MultimodalVectorBoundaryDecisionV1 {
	const reasons: string[] = [];

	if (input.modality !== 'text') {
		if (input.embeddingType === EVIDENCE_EMBEDDING_TYPE) {
			reasons.push('TEXT_ONLY_EMBEDDING_TYPE_VIOLATION');
		}
		if (input.sourceField === EVIDENCE_SOURCE_FIELD) {
			reasons.push('TEXT_ONLY_SOURCE_FIELD_VIOLATION');
		}
		if (input.projectionLane === TEXT_ONLY_PROJECTION_LANE_V1) {
			reasons.push('TEXT_ONLY_PROJECTION_LANE_VIOLATION');
		}
		if (
			input.preprocessingRecipe === GEMMA4_VLM_PREPROCESSING_RECIPE_V1 ||
			input.maxEdgePx === 2048
		) {
			reasons.push('VLM_2048PX_RESIZE_NOT_ALLOWED_FOR_EMBEDDINGGEMMA2');
		}
		if (!input.modelRevision.trim()) {
			reasons.push('MODEL_REVISION_REQUIRED');
		}
		if (input.modality === 'video_frame' || input.modality === 'video_window') {
			if (
				!input.timeRangeMs ||
				!Number.isFinite(input.timeRangeMs[0]) ||
				!Number.isFinite(input.timeRangeMs[1]) ||
				input.timeRangeMs[0] < 0 ||
				input.timeRangeMs[1] < input.timeRangeMs[0]
			) {
				reasons.push('VIDEO_TIME_RANGE_MS_REQUIRED');
			}
		}
	}

	return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
