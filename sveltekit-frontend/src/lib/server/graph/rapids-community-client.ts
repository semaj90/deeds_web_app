import { z } from 'zod';
import {
	CUGRAPH_LEIDEN_26_06,
	CUGRAPH_LOUVAIN_26_06,
	buildCommunitySnapshotV1,
	type CommunitySnapshotV1,
} from './community-snapshot-v1.js';

const finitePositive = z.number().finite().positive();

const CommunityPartitionResponseSchema = z.object({
	schema: z.literal('atlas.community-partition-response.v1'),
	algorithm: z.enum(['louvain', 'leiden']),
	algorithmId: z.enum([CUGRAPH_LOUVAIN_26_06, CUGRAPH_LEIDEN_26_06]),
	backend: z.literal('cugraph'),
	backendVersion: z.string().min(1),
	graphRevision: z.string().min(1),
	topologyHash: z.string().min(1),
	projectionRevision: z.string().min(1),
	projectionSemantics: z.literal('atlas.undirected-weighted-projection.v1'),
	parameters: z.record(z.string(), z.unknown()),
	modularity: z.number().finite(),
	assignments: z.array(z.object({
		nodeId: z.string().min(1),
		communityOrdinal: z.number().int().nonnegative(),
		communityFingerprint: z.string().min(1),
	}).strict()),
	communities: z.array(z.object({
		communityOrdinal: z.number().int().nonnegative(),
		communityFingerprint: z.string().min(1),
		memberNodeIds: z.array(z.string().min(1)).min(1),
	}).strict()),
	inputHash: z.string().min(1),
	outputHash: z.string().min(1),
	durationMs: z.number().finite().nonnegative(),
}).strict();

export type RapidsCommunityPartitionResponseV1 = z.infer<typeof CommunityPartitionResponseSchema>;

export interface RapidsCommunityNodeV1 { nodeId: string }
export interface RapidsCommunityEdgeV1 { source: string; target: string; weight: number }

export interface RunRapidsCommunityInputV1 {
	algorithm: 'louvain' | 'leiden';
	graphRevision: string;
	topologyHash: string;
	projectionRevision: string;
	nodes: readonly RapidsCommunityNodeV1[];
	edges: readonly RapidsCommunityEdgeV1[];
	resolution?: number;
	maxIterations?: number;
	threshold?: number;
	randomState?: number;
	theta?: number;
	baseUrl?: string;
	timeoutMs?: number;
}

export async function runRapidsCommunityV1(input: RunRapidsCommunityInputV1): Promise<RapidsCommunityPartitionResponseV1> {
	const baseUrl = (input.baseUrl ?? process.env.ATLAS_RAPIDS_COMMUNITY_URL ?? 'http://127.0.0.1:8099').replace(/\/$/, '');
	const endpoint = input.algorithm === 'leiden' ? 'leiden' : 'louvain';
	const payload = {
		schema: 'atlas.community-partition-request.v1',
		algorithm: input.algorithm,
		graphRevision: input.graphRevision,
		topologyHash: input.topologyHash,
		projectionRevision: input.projectionRevision,
		projectionSemantics: 'atlas.undirected-weighted-projection.v1',
		nodes: input.nodes,
		edges: input.edges.map((edge) => ({ ...edge, weight: finitePositive.parse(edge.weight) })),
		resolution: input.resolution ?? 1,
		maxIterations: input.maxIterations ?? 100,
		threshold: input.threshold ?? 1e-7,
		randomState: input.randomState ?? 0,
		theta: input.theta ?? 1,
	};

	const response = await fetch(`${baseUrl}/v1/community/${endpoint}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
	});
	if (!response.ok) throw new Error(`RAPIDS community sidecar ${response.status}: ${await response.text()}`);
	return CommunityPartitionResponseSchema.parse(await response.json());
}

export function rapidsCommunityResponseToSnapshotV1(input: {
	response: RapidsCommunityPartitionResponseV1;
	semanticRevision: string;
	receiptRef: string;
	edgeKinds: readonly string[];
}): CommunitySnapshotV1 {
	const response = CommunityPartitionResponseSchema.parse(input.response);
	return buildCommunitySnapshotV1({
		graphRevision: response.graphRevision,
		topologyHash: response.topologyHash,
		semanticRevision: input.semanticRevision,
		partitionInputRevision: response.inputHash,
		projectionRevision: response.projectionRevision,
		projectionSemantics: response.projectionSemantics,
		algorithmId: response.algorithmId,
		backend: 'cugraph',
		backendVersion: response.backendVersion,
		algorithmParameters: response.parameters,
		edgeKinds: input.edgeKinds,
		modularity: response.modularity,
		receiptRef: input.receiptRef,
		records: response.communities.map((community) => ({
			id: community.communityOrdinal,
			memberIds: community.memberNodeIds,
			memberCount: community.memberNodeIds.length,
		})),
	});
}
