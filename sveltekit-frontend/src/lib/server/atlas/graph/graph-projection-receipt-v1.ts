import { z } from 'zod';

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
	unresolvedParticipantCount: z.number().int().nonnegative(),
	status: z.enum(['MATERIALIZED', 'VALIDATED', 'FAILED']),
	generatedAt: z.string().datetime()
}).strict();

export type GraphProjectionReceiptV1 = z.infer<typeof GraphProjectionReceiptV1Schema>;

export function parseGraphProjectionReceiptV1(input: unknown): GraphProjectionReceiptV1 {
	return GraphProjectionReceiptV1Schema.parse(input);
}
