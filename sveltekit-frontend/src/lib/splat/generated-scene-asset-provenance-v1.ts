import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected SHA-256 hex');
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/i, 'Expected canonical source revision');
const settingValue = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);

/**
 * Provenance for a model-generated scene asset. This records a hypothesis and
 * its reproducibility inputs; it does not certify generated geometry as fact.
 */
export const generatedSceneAssetProvenanceV1Schema = z.object({
	schema: z.literal('atlas.generated-scene-asset-provenance.v1'),
	claimKind: z.literal('MODEL_GENERATED_HYPOTHESIS'),
	source: z.object({
		evidenceId: z.string().uuid(),
		sourceRevision
	}).strict(),
	generator: z.object({
		id: z.string().min(1).max(200),
		version: z.string().min(1).max(100),
		modelId: z.string().min(1).max(200),
		checkpointRevision: z.string().min(1).max(200),
		checkpointSha256: sha256,
		quantization: z.string().min(1).max(64),
		licenseStatus: z.enum(['VERIFIED', 'UNVERIFIED']),
		licenseSpdx: z.string().min(1).max(100).nullable()
	}).strict(),
	seed: z.number().int().nonnegative().safe(),
	settings: z.record(settingValue).superRefine((settings, context) => {
		if (Object.keys(settings).length > 64) {
			context.addIssue({ code: 'custom', message: 'Generation settings must contain at most 64 entries' });
		}
	}),
	outputSha256: sha256,
	reviewStatus: z.enum(['UNREVIEWED', 'REVIEWED_ACCEPTED', 'REVIEWED_REJECTED']),
	generatedAt: z.string().datetime()
}).strict();

export type GeneratedSceneAssetProvenanceV1 = z.infer<typeof generatedSceneAssetProvenanceV1Schema>;

export function createGeneratedSceneAssetProvenanceV1(input: unknown): GeneratedSceneAssetProvenanceV1 {
	return generatedSceneAssetProvenanceV1Schema.parse(input);
}
