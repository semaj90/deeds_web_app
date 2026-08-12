import { z } from 'zod';

export const GraphSnapshotParityStatusSchema = z.enum(['PASS', 'PARTIAL', 'FAIL', 'BLOCKED', 'SKIP']);
export type GraphSnapshotParityStatus = z.infer<typeof GraphSnapshotParityStatusSchema>;

export const GraphSnapshotParityArtifactPathsSchema = z
	.object({
		nodesParquet: z.string().min(1),
		edgesParquet: z.string().min(1),
		manifestJson: z.string().min(1)
	})
	.strict();

export type GraphSnapshotParityArtifactPaths = z.infer<typeof GraphSnapshotParityArtifactPathsSchema>;

export const GraphSnapshotParityManifestSchema = z
	.object({
		graphRevision: z.string().min(1),
		nodeCount: z.number().int().nonnegative(),
		edgeCount: z.number().int().nonnegative(),
		producerRevision: z.string().min(1),
		nodeTableHash: z.string().min(1),
		edgeTableHash: z.string().min(1),
		identityContractVersion: z.string().min(1),
		projectionRevision: z.string().min(1)
	})
	.strict();

export type GraphSnapshotParityManifest = z.infer<typeof GraphSnapshotParityManifestSchema>;

export const GraphSnapshotParityBackendSummarySchema = z
	.object({
		backend: z.enum(['networkx', 'cugraph']),
		status: z.enum(['PROVEN', 'UNAVAILABLE', 'FAILED', 'SKIP']),
		nodeCount: z.number().int().nonnegative(),
		edgeCount: z.number().int().nonnegative(),
		componentCount: z.number().int().nonnegative().optional(),
		edgeProjectionDiagnostics: z
			.object({
				orderedDuplicateEdges: z.number().int().nonnegative(),
				reciprocalEdgePairs: z.number().int().nonnegative(),
				duplicateUnorderedPairs: z.number().int().nonnegative()
			})
			.optional(),
		pagerankTopKOverlap: z.number().min(0).max(1).optional(),
		pagerankCorrelation: z.number().min(-1).max(1).optional(),
		pagerankMaxDelta: z.number().nonnegative().optional(),
		louvainCommunityAgreement: z.number().min(0).max(1).optional()
	})
	.strict();

export type GraphSnapshotParityBackendSummary = z.infer<typeof GraphSnapshotParityBackendSummarySchema>;

export const GraphSnapshotParityReceiptSchema = z
	.object({
		graphRevision: z.string().min(1),
		artifactPaths: GraphSnapshotParityArtifactPathsSchema,
		manifest: GraphSnapshotParityManifestSchema,
		networkx: GraphSnapshotParityBackendSummarySchema,
		cugraph: GraphSnapshotParityBackendSummarySchema,
		componentCount: z.number().int().nonnegative(),
		pagerankTopKOverlap: z.number().min(0).max(1),
		pagerankCorrelation: z.number().min(-1).max(1),
		pagerankMaxDelta: z.number().nonnegative(),
		louvainCommunityAgreement: z.number().min(0).max(1),
		excludedNodeCount: z.number().int().nonnegative(),
		excludedEdgeCount: z.number().int().nonnegative(),
		unresolvedCount: z.number().int().nonnegative(),
		status: GraphSnapshotParityStatusSchema,
		generatedAt: z.string().datetime(),
		notes: z.string().min(1).optional()
	})
	.strict();

export type GraphSnapshotParityReceipt = z.infer<typeof GraphSnapshotParityReceiptSchema>;

export function deriveGraphSnapshotParityStatus(input: {
	networkx: GraphSnapshotParityBackendSummary;
	cugraph: GraphSnapshotParityBackendSummary;
	unresolvedCount: number;
	edgeProjectionDiagnostics?: {
		orderedDuplicateEdges: number;
		reciprocalEdgePairs: number;
		duplicateUnorderedPairs: number;
	};
	pagerankTopKOverlap: number;
	pagerankCorrelation: number;
	pagerankMaxDelta: number;
	louvainCommunityAgreement: number;
}): GraphSnapshotParityStatus {
	if (input.networkx.status === 'FAILED' || input.cugraph.status === 'FAILED') {
		return 'FAIL';
	}

	if (input.networkx.status === 'UNAVAILABLE' || input.cugraph.status === 'UNAVAILABLE') {
		return 'BLOCKED';
	}

	if (input.unresolvedCount > 0) {
		return 'PARTIAL';
	}

	const diagnostics = input.edgeProjectionDiagnostics;
	if (
		diagnostics &&
		(diagnostics.orderedDuplicateEdges > 0 || diagnostics.reciprocalEdgePairs > 0 || diagnostics.duplicateUnorderedPairs > 0)
	) {
		return 'PARTIAL';
	}

	if (
		input.pagerankTopKOverlap < 1 ||
		input.pagerankCorrelation < 0.99 ||
		input.pagerankMaxDelta > 1e-8 ||
		input.louvainCommunityAgreement < 1
	) {
		return 'PARTIAL';
	}

	return 'PASS';
}

export function buildGraphSnapshotParityReceipt(input: {
	graphRevision: string;
	artifactPaths: GraphSnapshotParityArtifactPaths;
	manifest: GraphSnapshotParityManifest;
	networkx: GraphSnapshotParityBackendSummary;
	cugraph: GraphSnapshotParityBackendSummary;
	componentCount: number;
	edgeProjectionDiagnostics?: {
		orderedDuplicateEdges: number;
		reciprocalEdgePairs: number;
		duplicateUnorderedPairs: number;
	};
	pagerankTopKOverlap: number;
	pagerankCorrelation: number;
	pagerankMaxDelta: number;
	louvainCommunityAgreement: number;
	excludedNodeCount: number;
	excludedEdgeCount: number;
	unresolvedCount: number;
	generatedAt?: string;
	notes?: string;
	status?: GraphSnapshotParityStatus;
}): GraphSnapshotParityReceipt {
	const status =
		input.status ??
		deriveGraphSnapshotParityStatus({
			networkx: input.networkx,
			cugraph: input.cugraph,
			unresolvedCount: input.unresolvedCount,
			edgeProjectionDiagnostics: input.edgeProjectionDiagnostics,
			pagerankTopKOverlap: input.pagerankTopKOverlap,
			pagerankCorrelation: input.pagerankCorrelation,
			pagerankMaxDelta: input.pagerankMaxDelta,
			louvainCommunityAgreement: input.louvainCommunityAgreement
		});

	return GraphSnapshotParityReceiptSchema.parse({
		...input,
		status,
		generatedAt: input.generatedAt ?? new Date().toISOString()
	});
}
