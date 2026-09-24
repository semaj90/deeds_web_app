import { z } from 'zod';

export const GraphProjectionSampleRowV1Schema = z.object({
	sourceRef: z.string().min(1).nullable(),
	packetKey: z.string().min(1).nullable(),
	featureId: z.string().min(1).nullable(),
	communityId: z.number().int().nullable(),
	pageRank: z.number().finite().nullable()
}).strict();

export const GraphProjectionReceiptV1Schema = z.object({
	schema: z.literal('atlas.graph-projection-receipt.v1'),
	workspaceRevision: z.string().min(1),
	graphRevision: z.string().min(1),
	projectionRevision: z.string().min(1),
	producerRevision: z.string().min(1),
	projectionHash: z.string().regex(/^[a-f0-9]{64}$/),
	nodeTableHash: z.string().regex(/^[a-f0-9]{64}$/),
	edgeTableHash: z.string().regex(/^[a-f0-9]{64}$/),
	entityCount: z.number().int().nonnegative(),
	relationCount: z.number().int().nonnegative(),
	edgeCount: z.number().int().nonnegative(),
	rowCounts: z.object({
		sourceRef: z.number().int().nonnegative(),
		packetKey: z.number().int().nonnegative(),
		featureId: z.number().int().nonnegative(),
		communityId: z.number().int().nonnegative(),
		pageRank: z.number().int().nonnegative()
	}).strict(),
	sampleRows: z.array(GraphProjectionSampleRowV1Schema).max(20),
	unresolvedParticipantCount: z.number().int().nonnegative(),
	status: z.enum(['PLANNED', 'DRY_RUN_COMPLETE', 'APPLIED', 'READBACK_VERIFIED', 'FAILED']),
	writesPerformed: z.boolean(),
	canonicalAuthority: z.literal(false),
	generatedAt: z.string().datetime()
}).strict();

export type GraphProjectionReceiptV1 = z.infer<typeof GraphProjectionReceiptV1Schema>;
export type GraphProjectionSampleRowV1 = z.infer<typeof GraphProjectionSampleRowV1Schema>;

export function parseGraphProjectionReceiptV1(input: unknown): GraphProjectionReceiptV1 {
	return GraphProjectionReceiptV1Schema.parse(input);
}
