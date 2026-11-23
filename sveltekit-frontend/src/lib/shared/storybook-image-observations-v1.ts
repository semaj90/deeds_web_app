import { z } from 'zod';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const storybookImageDecisionV1Schema = z.object({
	observationId: digest,
	versionId: z.uuid(),
	decision: z.enum(['ACCEPTED', 'REJECTED', 'UNCERTAIN']),
}).strict();
export const imageOcrStageV1Schema = z.object({
	sourceRevision: digest,
	engine: z.literal('tesseract'),
	policyRevision: z.literal('atlas.image-ocr.eng-oriented-png-1280.v1'),
}).and(z.discriminatedUnion('status', [
	z.object({ status: z.literal('COMPLETED'), inputSha256: digest, text: z.string().min(1).max(800), truncated: z.boolean() }),
	z.object({ status: z.literal('EMPTY'), inputSha256: digest }),
	z.object({ status: z.literal('FAILED'), inputSha256: digest.optional() }),
]));
export type ImageOcrStageV1 = z.infer<typeof imageOcrStageV1Schema>;

export const storybookImageOcrSpanV1Schema = z.object({
	kind: z.literal('image_ocr_span'), observationId: digest, inputSha256: digest,
	startUtf16: z.literal(0), endUtf16: z.number().int().min(1).max(800),
	text: z.string().min(1).max(800), truncated: z.boolean(),
	modelRevision: z.literal('atlas.image-ocr.eng-oriented-png-1280.v1'),
}).strict().refine((span) => span.endUtf16 === span.text.length);
const observation = {
	observationId: digest,
	label: z.string().min(1).max(100),
	modelRevision: z.string().min(1).max(256).nullable(),
};

export const storybookImageObservationScopeV1Schema = z.object({
	evidenceId: z.uuid(),
	sourceRevision: digest,
	analysisRevision: z.string().min(1).max(512),
	observationRevision: digest,
}).strict();

export const storybookImageObservationsV1Schema = storybookImageObservationScopeV1Schema.extend({
	schema: z.literal('atlas.storybook-image-observations.v1'),
	coordinateSpace: z.literal('ORIGINAL_IMAGE_PIXELS'),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	detectionCoverage: z.enum(['RECORDED', 'FAILED_OR_UNAVAILABLE', 'NOT_RECORDED']),
	maskCoverage: z.enum(['RECORDED', 'FAILED_OR_UNAVAILABLE', 'NOT_RUN', 'NOT_RECORDED']),
	sceneContextCoverage: z.enum(['RECORDED', 'FAILED_OR_UNAVAILABLE', 'NOT_RECORDED']).optional(),
	ocrCoverage: z.enum(['COMPLETED', 'EMPTY', 'FAILED']).optional(),
	ocrSpan: storybookImageOcrSpanV1Schema.optional(),
	reviews: z.array(storybookImageDecisionV1Schema).max(510).optional(),
	sceneContext: z.object({
		kind: z.literal('scene_context'), observationId: digest, description: z.string().min(1).max(5000),
		modelId: z.string().min(1).max(256).nullable(), reviewState: z.literal('UNREVIEWED_PROPOSAL'),
	}).strict().optional(),
	detections: z.array(z.object({ ...observation, kind: z.literal('detection'),
		ordinal: z.number().int().min(0).max(499), confidence: z.number().min(0).max(1),
		bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }).strict()).max(500),
	masks: z.array(z.object({ ...observation, kind: z.literal('segmentation_mask'),
		detectionObservationId: digest, artifactSha256: digest }).strict()).max(8),
	unresolvedMaskCount: z.number().int().nonnegative().max(8),
}).strict();

export type StorybookImageObservationsV1 = z.infer<typeof storybookImageObservationsV1Schema>;
