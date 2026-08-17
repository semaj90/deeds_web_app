import { z } from 'zod';

const nonNegativeFinite = z.number().finite().nonnegative();

/**
 * Logical immutable feature snapshot. `valuesRef` points to the executor-native
 * row-major numeric artifact; Arrow metadata owns typed identity/columns.
 */
export const FeatureMatrixSnapshotV1Schema = z.object({
	schema: z.literal('atlas.feature-matrix-snapshot.v1'),
	snapshotId: z.string().min(1),
	contentHash: z.string().min(1),
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	graphRevision: z.string().min(1),
	semanticRevision: z.string().min(1),
	featureSchemaRevision: z.string().min(1),
	rowOrdinalRevision: z.string().min(1),
	candidateIdsRef: z.string().min(1),
	featureNames: z.array(z.string().min(1)).min(1),
	rows: z.number().int().nonnegative(),
	cols: z.number().int().positive(),
	valuesRef: z.string().min(1),
	dtype: z.enum(['float32', 'float16']),
	layout: z.literal('row_major'),
	arrowManifestRef: z.string().min(1),
	checksum: z.string().min(1),
}).strict().superRefine((snapshot, ctx) => {
	if (snapshot.featureNames.length !== snapshot.cols) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['featureNames'],
			message: 'featureNames length must equal cols',
		});
	}
});

export const FeatureSubspaceSnapshotV1Schema = z.object({
	schema: z.literal('atlas.feature-subspace-snapshot.v1'),
	sourceFeatureSnapshotHash: z.string().min(1),
	featureSchemaRevision: z.string().min(1),
	featureNames: z.array(z.string().min(1)).min(1),
	preprocessingRevision: z.string().min(1),
	centering: z.boolean(),
	scaling: z.enum(['none', 'standard', 'robust']),
	algorithm: z.literal('svd'),
	algorithmRevision: z.string().min(1),
	backend: z.enum(['torch_cpu', 'torch_cuda_cusolver', 'numpy_reference']),
	rankK: z.number().int().positive(),
	singularValues: z.array(nonNegativeFinite).min(1),
	rightBasisRef: z.string().min(1),
	explainedEnergy: z.array(z.number().finite().min(0).max(1)).min(1),
	reconstructionErrorMean: nonNegativeFinite,
	reconstructionErrorP95: nonNegativeFinite,
	basisCanonicalizationRevision: z.string().min(1),
	producerRevision: z.string().min(1),
	artifactHash: z.string().min(1),
	receiptRef: z.string().min(1),
}).strict().superRefine((snapshot, ctx) => {
	if (snapshot.rankK > snapshot.featureNames.length) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rankK'], message: 'rankK cannot exceed feature count' });
	}
	if (snapshot.singularValues.length !== snapshot.rankK) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['singularValues'], message: 'singularValues length must equal rankK' });
	}
	if (snapshot.explainedEnergy.length !== snapshot.rankK) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['explainedEnergy'], message: 'explainedEnergy length must equal rankK' });
	}
});

export type FeatureMatrixSnapshotV1 = z.infer<typeof FeatureMatrixSnapshotV1Schema>;
export type FeatureSubspaceSnapshotV1 = z.infer<typeof FeatureSubspaceSnapshotV1Schema>;

/**
 * A projected coordinate is revision-qualified derived state, never canonical
 * candidate identity and never an independent retrieval/RRF vote.
 */
export const FeatureProjectionV1Schema = z.object({
	schema: z.literal('atlas.feature-projection.v1'),
	candidateId: z.string().min(1),
	sourceFeatureSnapshotHash: z.string().min(1),
	subspaceArtifactHash: z.string().min(1),
	coordinates: z.array(z.number().finite()).min(1),
	reconstructionError: nonNegativeFinite,
}).strict();

export type FeatureProjectionV1 = z.infer<typeof FeatureProjectionV1Schema>;
