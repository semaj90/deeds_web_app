import { z } from 'zod';

export const StructuralFeatureRowV1Schema = z.object({
	candidateOrdinal: z.number().int().nonnegative(),
	canonicalId: z.string().min(1),
	graphAuthority: z.number().finite().nullable(),
	queryProximity: z.number().finite().nullable(),
	communityId: z.number().int().nullable(),
	neighborhoodOverlap: z.number().finite().nullable(),
	structuralDistance: z.number().finite().nullable(),
	structuralAffinity: z.number().finite().nullable()
}).strict();

export const StructuralFeatureSnapshotV1Schema = z.object({
	schema: z.literal('atlas.structural-feature-snapshot.v1'),
	workspaceRevision: z.string().min(1),
	graphRevision: z.string().min(1),
	projectionRevision: z.string().min(1),
	producerRevision: z.string().min(1),
	executor: z.enum(['networkx', 'cugraph', 'neo4j-gds']),
	algorithmSet: z.array(z.string().min(1)).min(1),
	rows: z.array(StructuralFeatureRowV1Schema),
	generatedAt: z.string().datetime()
}).strict();

export type StructuralFeatureRowV1 = z.infer<typeof StructuralFeatureRowV1Schema>;
export type StructuralFeatureSnapshotV1 = z.infer<typeof StructuralFeatureSnapshotV1Schema>;

export function parseStructuralFeatureSnapshotV1(input: unknown): StructuralFeatureSnapshotV1 {
	return StructuralFeatureSnapshotV1Schema.parse(input);
}
