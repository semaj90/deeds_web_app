import { z } from 'zod';

export const sceneLocationSchema = z.object({
	latitude: z.number().min(-90).max(90).nullable(),
	longitude: z.number().min(-180).max(180).nullable(),
	source: z.enum(['USER_OPTIONAL', 'MAP_PICKER', 'EXIF_GPS', 'UNSPECIFIED']).default('USER_OPTIONAL'),
	verified: z.boolean().default(false),
	attribution: z.string().optional()
}).strict();

export const scenePlacedObjectSchema = z.object({
	objectId: z.string().min(1),
	catalogKey: z.string().min(1),
	assetRevision: z.string().default('fixture-v1'),
	position: z.tuple([z.number(), z.number(), z.number()]),
	rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]), // Quaternion [x, y, z, w]
	scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
	locked: z.boolean().default(false),
	anchorEvidenceId: z.string().optional()
}).strict();

export const detectiveSceneCompositionSchema = z.object({
	schema: z.literal('atlas.detective-scene-composition.v1'),
	classification: z.enum(['DEMONSTRATIVE', 'MEASURED_MULTI_IMAGE', 'SINGLE_IMAGE_HYPOTHESIS', 'SYNTHETIC_FIXTURE']).default('DEMONSTRATIVE'),
	location: sceneLocationSchema,
	objects: z.array(scenePlacedObjectSchema),
	calibration: z.enum(['UNVERIFIED', 'CALIPER_VERIFIED', 'METRIC_RECEIPT_VERIFIED']).default('UNVERIFIED'),
	admission: z.enum(['LOCAL_PREFLIGHT', 'AUTHORIZED_REVISION', 'ARCHIVED']).default('LOCAL_PREFLIGHT')
}).strict();

export type SceneLocation = z.infer<typeof sceneLocationSchema>;
export type ScenePlacedObject = z.infer<typeof scenePlacedObjectSchema>;
export type DetectiveSceneComposition = z.infer<typeof detectiveSceneCompositionSchema>;

/**
 * Validates and serializes a reference-based detective scene composition.
 * Ensures scene contains object references rather than duplicating geometry.
 */
export function validateSceneComposition(input: unknown): DetectiveSceneComposition {
	return detectiveSceneCompositionSchema.parse(input);
}
