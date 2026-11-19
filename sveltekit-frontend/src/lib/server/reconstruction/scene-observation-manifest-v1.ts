import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SceneIntentCitationV1 } from './crime-scene-schema.js';

export const SCENE_OBSERVATION_MANIFEST_SCHEMA_V1 = 'atlas.scene-observation-manifest.v1' as const;

const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const SHA256_REVISION_RE = /^sha256:[a-f0-9]{64}$/i;

export const ObservationStageStatusSchema = z.enum(['COMPLETED', 'SKIPPED', 'UNAVAILABLE', 'FAILED', 'NOT_RUN']);
export type ObservationStageStatus = z.infer<typeof ObservationStageStatusSchema>;

export const ReviewStatusSchema = z.enum(['unreviewed', 'accepted', 'disputed', 'unclassified']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const CoordinateSpaceSchema = z.enum([
	'source_pixel',
	'camera_2_5d_relative',
	'calibrated_ground_plane',
	'world_shared'
]);
export type CoordinateSpace = z.infer<typeof CoordinateSpaceSchema>;

/**
 * Stage Execution & Coverage Accounting
 * Tracks what ran, what was examined, and what failed or was omitted.
 */
export const StageCoverageReportSchema = z.object({
	keyframeSampling: z.object({
		status: ObservationStageStatusSchema,
		sampledCount: z.number().int().nonnegative(),
		omittedCount: z.number().int().nonnegative(),
		samplingRateFps: z.number().positive(),
	}),
	objectDetection: z.object({
		status: ObservationStageStatusSchema,
		modelRevision: z.string().nullable(),
		detectedCount: z.number().int().nonnegative(),
		confidenceThreshold: z.number().min(0).max(1),
	}),
	segmentation: z.object({
		status: ObservationStageStatusSchema,
		modelRevision: z.string().nullable(),
		maskCount: z.number().int().nonnegative(),
	}),
	relativeDepth: z.object({
		status: ObservationStageStatusSchema,
		modelRevision: z.string().nullable(),
		depthMapCount: z.number().int().nonnegative(),
		isMonocularEstimate: z.literal(true),
	}),
	ocrText: z.object({
		status: ObservationStageStatusSchema,
		engine: z.string(),
		charCount: z.number().int().nonnegative(),
	}),
	audioTranscription: z.object({
		status: z.enum(['COMPLETED', 'SKIPPED_NO_AUDIO', 'TRANSCRIPTION_BINARY_UNAVAILABLE', 'FAILED', 'NOT_RUN']),
		segmentCount: z.number().int().nonnegative(),
	}),
});
export type StageCoverageReport = z.infer<typeof StageCoverageReportSchema>;

/**
 * 1. Objects and Regions Stream
 * Stores detector boxes and segmentation masks as references to derived artifacts
 * in SeaweedFS rather than packing large JSON records into database rows.
 */
export const ObjectRegionObservationSchema = z.object({
	observationId: z.string().regex(SHA256_REVISION_RE),
	frameIndex: z.number().int().nonnegative(),
	timestampMs: z.number().int().nonnegative(),
	kind: z.enum(['detector_box', 'segmentation_mask', 'relative_depth_surface']),
	label: z.string().min(1).max(256),
	confidence: z.number().min(0).max(1),
	modelRevision: z.string().min(1),
	bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [left, top, right, bottom]
	artifactUri: z.string().min(1), // Pointer to SeaweedFS atlas-artifacts
	coordinateSpace: CoordinateSpaceSchema.default('source_pixel'),
	reviewStatus: ReviewStatusSchema.default('unreviewed'),
	reviewerNotes: z.string().optional(),
	reviewedBy: z.number().int().positive().nullable().default(null),
});
export type ObjectRegionObservation = z.infer<typeof ObjectRegionObservationSchema>;

/**
 * 2. Scene Context Proposals Stream
 * Separate caption/classification proposal (e.g., "courtroom-like interior", "platform").
 * Explicitly separate from individual detected entities.
 */
export const SceneContextProposalSchema = z.object({
	proposalId: z.string().min(1),
	frameIndex: z.number().int().nonnegative().optional(),
	contextLabel: z.string().min(1).max(256),
	proposalSource: z.string().min(1), // e.g. 'vlm_caption' | 'classifier_head'
	confidence: z.number().min(0).max(1),
	reviewStatus: z.enum(['unreviewed', 'accepted', 'rejected']).default('unreviewed'),
	reviewedBy: z.number().int().positive().nullable().default(null),
});
export type SceneContextProposal = z.infer<typeof SceneContextProposalSchema>;

/**
 * 3. Text and Speech Stream
 * OCR and Whisper transcript extraction.
 * Note: 8095 helper works on text; it does not inspect image pixels.
 */
export const TextAndSpeechStreamSchema = z.object({
	ocrSpans: z.array(z.object({
		spanId: z.string().min(1),
		frameIndex: z.number().int().nonnegative(),
		text: z.string().min(1),
		bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
		confidence: z.number().min(0).max(1).optional(),
	})).default([]),
	transcriptSegments: z.array(z.object({
		segmentId: z.string().min(1),
		startMs: z.number().int().nonnegative(),
		endMs: z.number().int().nonnegative(),
		text: z.string().min(1),
		speakerTag: z.string().nullable().default(null),
	})).default([]),
});
export type TextAndSpeechStream = z.infer<typeof TextAndSpeechStreamSchema>;

/**
 * 4. Events and Roles Stream
 * Timestamped proposals that cite observations or transcript spans.
 * Constraint: Visual prominence or appearance alone CANNOT assign 'suspect' or 'victim'.
 */
export const ProposedRoleAssignmentSchema = z.object({
	actorLabel: z.string().min(1),
	proposedRole: z.enum(['witness', 'attorney', 'judge', 'defendant', 'unassigned']).default('unassigned'),
	rationale: z.string().min(1),
	supportedByCitation: z.boolean(),
});

export const EventProposalSchema = z.object({
	proposalId: z.string().min(1),
	timestampMs: z.number().int().nonnegative(),
	durationMs: z.number().int().positive(),
	action: z.string().min(1),
	citations: z.array(SceneIntentCitationV1).min(1),
	roleAssignments: z.array(ProposedRoleAssignmentSchema).default([]),
	reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']).default('unreviewed'),
});
export type EventProposal = z.infer<typeof EventProposalSchema>;

/**
 * 5. Unknowns and Coverage Stream
 * Records which frames and model stages ran, what they examined, and what failed.
 * Allows reviewers to mark an area "unclassified" or "not reviewed".
 */
export const UnknownsAndCoverageSchema = z.object({
	unexaminedFrames: z.array(z.number().int().nonnegative()).default([]),
	unclassifiedRegions: z.array(z.object({
		frameIndex: z.number().int().nonnegative(),
		bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
		reason: z.enum(['occlusion', 'low_resolution', 'ambiguous', 'reviewer_marked_unknown']),
	})).default([]),
	stageFailures: z.array(z.object({
		stage: z.string(),
		errorCode: z.string(),
		message: z.string(),
	})).default([]),
});
export type UnknownsAndCoverage = z.infer<typeof UnknownsAndCoverageSchema>;

/**
 * Canonical Reviewable Coverage and Observation Manifest Schema (V1)
 */
export const SceneObservationManifestSchemaV1 = z.object({
	schemaVersion: z.literal(SCENE_OBSERVATION_MANIFEST_SCHEMA_V1),
	manifestId: z.string().min(1),
	caseId: z.string().uuid(),
	evidenceId: z.string().uuid(),
	sourceSha256: z.string().regex(SHA256_HEX_RE),
	sourceRevision: z.string().regex(SHA256_REVISION_RE),
	analysisJobId: z.string().uuid(),
	analysisRevision: z.string().min(1),
	createdAt: z.string().datetime(),

	coverage: StageCoverageReportSchema,
	objectsAndRegions: z.array(ObjectRegionObservationSchema).default([]),
	sceneContextProposals: z.array(SceneContextProposalSchema).default([]),
	textAndSpeech: TextAndSpeechStreamSchema.default({ ocrSpans: [], transcriptSegments: [] }),
	eventProposals: z.array(EventProposalSchema).default([]),
	unknowns: UnknownsAndCoverageSchema.default({ unexaminedFrames: [], unclassifiedRegions: [], stageFailures: [] }),

	// Coordinate space policy
	activeCoordinateSpace: CoordinateSpaceSchema.default('source_pixel'),
	calibrationTransformRevision: z.string().nullable().default(null),
}).superRefine((manifest, ctx) => {
	// Guard: metric/shared coordinate space is forbidden without an admitted calibration revision
	if (
		(manifest.activeCoordinateSpace === 'calibrated_ground_plane' || manifest.activeCoordinateSpace === 'world_shared') &&
		!manifest.calibrationTransformRevision
	) {
		ctx.addIssue({
			code: 'custom',
			message: 'activeCoordinateSpace cannot be calibrated_ground_plane or world_shared without calibrationTransformRevision',
			path: ['activeCoordinateSpace'],
		});
	}
});
export type SceneObservationManifestV1 = z.infer<typeof SceneObservationManifestSchemaV1>;

/**
 * Deterministically computes an observationId for an object/region detection.
 */
export function computeObservationId(params: {
	sourceRevision: string;
	analysisRevision: string;
	frameIndex: number;
	ordinal: number;
	artifactSha256: string;
	modelRevision: string;
	label: string;
	bbox: [number, number, number, number];
}): string {
	const raw = JSON.stringify([
		params.sourceRevision,
		params.analysisRevision,
		params.frameIndex,
		params.ordinal,
		params.artifactSha256,
		params.modelRevision,
		params.label,
		params.bbox,
	]);
	return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}
