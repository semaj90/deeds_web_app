import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	GraphSnapshotParityArtifactPathsSchema,
	GraphSnapshotParityManifestSchema,
} from '../atlas/graph/graph-snapshot-parity-contract.js';
import { GraphProjectionManifestV3Schema } from './graph-projection-manifest.js';

/**
 * Projection-qualified descriptor for the existing GRAPH_SNAPSHOT_PARITY
 * parquet artifacts. The parquet exporter remains the physical snapshot
 * owner; this contract only binds those immutable table hashes to a V3
 * projection manifest so PageRank executors can prove they consumed the
 * same graph semantics without duplicating the 162k-node edge list in JSON.
 */
function snapshotContentHash(input: {
	projectionRevision: string;
	projectionHash: string;
	projectionName: string;
	graphRevision: string;
	nodeTableHash: string;
	edgeTableHash: string;
	nodeCount: number;
	edgeCount: number;
}): string {
	return createHash('sha256')
		.update(JSON.stringify({
			projectionRevision: input.projectionRevision,
			projectionHash: input.projectionHash,
			projectionName: input.projectionName,
			graphRevision: input.graphRevision,
			nodeTableHash: input.nodeTableHash,
			edgeTableHash: input.edgeTableHash,
			nodeCount: input.nodeCount,
			edgeCount: input.edgeCount,
		}))
		.digest('hex');
}

export const GraphProjectionSnapshotV1Schema = z
	.object({
		schema: z.literal('atlas.graph-projection-snapshot.v1'),
		projection: GraphProjectionManifestV3Schema,
		parityManifest: GraphSnapshotParityManifestSchema,
		artifactPaths: GraphSnapshotParityArtifactPathsSchema,
		materialization: z.literal('PARQUET_DIRECTED_EDGE_LIST'),
		edgeWeightColumn: z.literal('weight'),
		contentHash: z.string().min(1),
		producerRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict()
	.superRefine((snapshot, ctx) => {
		if (snapshot.projection.graphRevision !== snapshot.parityManifest.graphRevision) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parityManifest', 'graphRevision'],
				message: 'parity artifact graphRevision does not match V3 projection graphRevision',
			});
		}
		if (snapshot.projection.nodeCount !== snapshot.parityManifest.nodeCount) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parityManifest', 'nodeCount'],
				message: 'parity artifact nodeCount does not match V3 projection nodeCount',
			});
		}
		if (snapshot.projection.relationshipCount !== snapshot.parityManifest.edgeCount) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parityManifest', 'edgeCount'],
				message: 'parity artifact edgeCount does not match V3 projection relationshipCount',
			});
		}

		for (const [relationshipType, relationship] of Object.entries(snapshot.projection.relationships)) {
			if (relationship.orientation !== 'NATURAL') {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['projection', 'relationships', relationshipType, 'orientation'],
					message: 'GRAPH_SNAPSHOT_PARITY v1 parquet rows encode NATURAL directed edges only; re-export for other orientations',
				});
			}
		}

		const expectedHash = snapshotContentHash({
			projectionRevision: snapshot.projection.projectionRevision,
			projectionHash: snapshot.projection.projectionHash,
			projectionName: snapshot.projection.projectionName,
			graphRevision: snapshot.parityManifest.graphRevision,
			nodeTableHash: snapshot.parityManifest.nodeTableHash,
			edgeTableHash: snapshot.parityManifest.edgeTableHash,
			nodeCount: snapshot.parityManifest.nodeCount,
			edgeCount: snapshot.parityManifest.edgeCount,
		});
		if (snapshot.contentHash !== expectedHash) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['contentHash'],
				message: `contentHash mismatch: expected ${expectedHash}`,
			});
		}
	});
export type GraphProjectionSnapshotV1 = z.infer<typeof GraphProjectionSnapshotV1Schema>;

export function computeGraphProjectionSnapshotHashV1(input: {
	projectionRevision: string;
	projectionHash: string;
	projectionName: string;
	graphRevision: string;
	nodeTableHash: string;
	edgeTableHash: string;
	nodeCount: number;
	edgeCount: number;
}): string {
	return snapshotContentHash(input);
}
