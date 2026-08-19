import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GraphProjectionManifestV3Schema } from './graph-projection-manifest.js';

export const GraphProjectionSnapshotNodeV1Schema = z
	.object({
		ordinal: z.number().int().nonnegative(),
		canonicalId: z.string().min(1),
		packetKey: z.string().min(1).nullable(),
	})
	.strict();

export const GraphProjectionSnapshotEdgeV1Schema = z
	.object({
		sourceOrdinal: z.number().int().nonnegative(),
		targetOrdinal: z.number().int().nonnegative(),
		relationshipType: z.string().min(1),
		weight: z.number().finite().nonnegative().nullable(),
	})
	.strict();

function snapshotContentHash(input: {
	projectionHash: string;
	nodes: readonly z.infer<typeof GraphProjectionSnapshotNodeV1Schema>[];
	edges: readonly z.infer<typeof GraphProjectionSnapshotEdgeV1Schema>[];
}): string {
	return createHash('sha256')
		.update(JSON.stringify({
			projectionHash: input.projectionHash,
			nodes: input.nodes,
			edges: input.edges,
		}))
		.digest('hex');
}

export const GraphProjectionSnapshotV1Schema = z
	.object({
		schema: z.literal('atlas.graph-projection-snapshot.v1'),
		projection: GraphProjectionManifestV3Schema,
		materialization: z.literal('DIRECTED_EDGE_LIST'),
		nodes: z.array(GraphProjectionSnapshotNodeV1Schema).min(1),
		edges: z.array(GraphProjectionSnapshotEdgeV1Schema),
		contentHash: z.string().min(1),
		producerRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict()
	.superRefine((snapshot, ctx) => {
		const nodeIds = new Set<string>();
		for (const [index, node] of snapshot.nodes.entries()) {
			if (node.ordinal !== index) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['nodes', index, 'ordinal'],
					message: `node ordinals must be contiguous and sorted; expected ${index}`,
				});
			}
			if (nodeIds.has(node.canonicalId)) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'canonicalId'], message: 'duplicate canonicalId' });
			}
			nodeIds.add(node.canonicalId);
		}
		if (snapshot.projection.nodeCount !== snapshot.nodes.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['nodes'],
				message: `snapshot node count ${snapshot.nodes.length} does not match projection nodeCount ${snapshot.projection.nodeCount}`,
			});
		}
		for (const [index, edge] of snapshot.edges.entries()) {
			if (edge.sourceOrdinal >= snapshot.nodes.length || edge.targetOrdinal >= snapshot.nodes.length) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index], message: 'edge ordinal is outside node range' });
			}
			if (!snapshot.projection.relationships[edge.relationshipType]) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['edges', index, 'relationshipType'],
					message: `edge relationship '${edge.relationshipType}' is absent from projection`,
				});
			}
		}
		if (snapshot.projection.relationshipCount !== snapshot.edges.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['edges'],
				message: `snapshot edge count ${snapshot.edges.length} does not match projection relationshipCount ${snapshot.projection.relationshipCount}`,
			});
		}
		const expectedHash = snapshotContentHash({
			projectionHash: snapshot.projection.projectionHash,
			nodes: snapshot.nodes,
			edges: snapshot.edges,
		});
		if (snapshot.contentHash !== expectedHash) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contentHash'], message: `contentHash mismatch: expected ${expectedHash}` });
		}
	});
export type GraphProjectionSnapshotV1 = z.infer<typeof GraphProjectionSnapshotV1Schema>;

export function computeGraphProjectionSnapshotHashV1(input: {
	projectionHash: string;
	nodes: readonly z.infer<typeof GraphProjectionSnapshotNodeV1Schema>[];
	edges: readonly z.infer<typeof GraphProjectionSnapshotEdgeV1Schema>[];
}): string {
	return snapshotContentHash(input);
}
