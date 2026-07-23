import { createHash } from 'node:crypto';
import { z } from 'zod';

export const GraphNodeTypeSchema = z.enum([
	'repository', 'package', 'directory', 'file', 'symbol', 'chunk', 'packet', 'feature', 'concept', 'relation_event'
]);

export const GraphEdgeTypeSchema = z.enum([
	'CONTAINS', 'MATERIALIZES', 'IMPORTS', 'CALLS', 'REFERENCES', 'DEPENDS_ON',
	'IMPLEMENTS', 'USES_CONCEPT', 'DERIVED_FROM', 'SUMMARIZES', 'PARTICIPATES_IN'
]);

export const GraphNodeSchema = z.object({
	snapshotId: z.string().uuid(),
	nodeKey: z.string().min(1),
	nodeType: GraphNodeTypeSchema,
	packetKey: z.string().min(1).nullable(),
	treeNodeId: z.string().uuid().nullable(),
	sourceRef: z.string().min(1).nullable(),
	properties: z.record(z.string(), z.unknown()).default({})
}).strict().superRefine((node, ctx) => {
	if (node.nodeType === 'packet' && !node.packetKey) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['packetKey'], message: 'packet nodes require packetKey' });
	}
});

export const GraphEdgeSchema = z.object({
	snapshotId: z.string().uuid(),
	edgeKey: z.string().min(1),
	sourceNodeKey: z.string().min(1),
	targetNodeKey: z.string().min(1),
	edgeType: GraphEdgeTypeSchema,
	weight: z.number().finite().nonnegative(),
	confidence: z.number().finite().min(0).max(1),
	provenance: z.string().min(1),
	properties: z.record(z.string(), z.unknown()).default({})
}).strict();

export const GraphRelationEventSchema = z.object({
	snapshotId: z.string().uuid(),
	relationId: z.string().min(1),
	relationType: z.string().min(1),
	sourceRef: z.string().min(1),
	evidenceSpan: z.string().min(1),
	confidence: z.number().finite().min(0).max(1),
	topologyHash: z.string().min(1)
}).strict();

export const GraphRelationParticipantSchema = z.object({
	snapshotId: z.string().uuid(),
	relationId: z.string().min(1),
	nodeKey: z.string().min(1),
	role: z.string().min(1),
	ordinal: z.number().int().nonnegative()
}).strict();

export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphRelationEvent = z.infer<typeof GraphRelationEventSchema>;
export type GraphRelationParticipant = z.infer<typeof GraphRelationParticipantSchema>;

export class GraphIdentityValidationError extends Error {
	constructor(readonly evidence: Record<string, unknown>) {
		super(String(evidence.kind ?? 'GRAPH_IDENTITY_INVALID'));
	}
}

export function validateGraphSnapshotIdentity(input: {
	snapshotId: string;
	nodes: readonly GraphNode[];
	edges: readonly GraphEdge[];
	relationEvents?: readonly GraphRelationEvent[];
	relationParticipants?: readonly GraphRelationParticipant[];
}): string {
	const snapshotId = z.string().uuid().parse(input.snapshotId);
	const nodes = input.nodes.map((node) => GraphNodeSchema.parse(node));
	const edges = input.edges.map((edge) => GraphEdgeSchema.parse(edge));
	const relations = (input.relationEvents ?? []).map((event) => GraphRelationEventSchema.parse(event));
	const participants = (input.relationParticipants ?? []).map((participant) => GraphRelationParticipantSchema.parse(participant));
	const nodeKeys = new Set<string>();
	const edgeKeys = new Set<string>();
	const treeNodes = new Map<string, string[]>();

	for (const node of nodes) {
		if (node.snapshotId !== snapshotId) throw new GraphIdentityValidationError({ kind: 'SNAPSHOT_ID_MISMATCH', nodeKey: node.nodeKey });
		if (nodeKeys.has(node.nodeKey)) throw new GraphIdentityValidationError({ kind: 'DUPLICATE_NODE_KEY', nodeKey: node.nodeKey });
		nodeKeys.add(node.nodeKey);
		if (node.treeNodeId) treeNodes.set(node.treeNodeId, [...(treeNodes.get(node.treeNodeId) ?? []), node.nodeKey]);
	}

	for (const [treeNodeId, keys] of treeNodes) {
		if (keys.length > 1) throw new GraphIdentityValidationError({ kind: 'TREE_NODE_ID_COLLISION', treeNodeId, nodeKeys: keys, nodeA: keys[0], nodeB: keys[1] });
	}

	for (const edge of edges) {
		if (edge.snapshotId !== snapshotId) throw new GraphIdentityValidationError({ kind: 'SNAPSHOT_ID_MISMATCH', edgeKey: edge.edgeKey });
		if (edgeKeys.has(edge.edgeKey)) throw new GraphIdentityValidationError({ kind: 'DUPLICATE_EDGE_KEY', edgeKey: edge.edgeKey });
		if (!nodeKeys.has(edge.sourceNodeKey)) throw new GraphIdentityValidationError({ kind: 'EDGE_SOURCE_MISSING', edgeKey: edge.edgeKey, nodeKey: edge.sourceNodeKey });
		if (!nodeKeys.has(edge.targetNodeKey)) throw new GraphIdentityValidationError({ kind: 'EDGE_TARGET_MISSING', edgeKey: edge.edgeKey, nodeKey: edge.targetNodeKey });
		edgeKeys.add(edge.edgeKey);
	}

	const relationIds = new Set(relations.map((event) => event.relationId));
	for (const relation of relations) {
		if (relation.snapshotId !== snapshotId) throw new GraphIdentityValidationError({ kind: 'SNAPSHOT_ID_MISMATCH', relationId: relation.relationId });
	}
	for (const participant of participants) {
		if (participant.snapshotId !== snapshotId) throw new GraphIdentityValidationError({ kind: 'RELATION_PARTICIPANT_SNAPSHOT_MISMATCH', relationId: participant.relationId });
		if (!relationIds.has(participant.relationId)) throw new GraphIdentityValidationError({ kind: 'RELATION_EVENT_MISSING', relationId: participant.relationId });
		if (!nodeKeys.has(participant.nodeKey)) throw new GraphIdentityValidationError({ kind: 'RELATION_PARTICIPANT_NODE_MISSING', nodeKey: participant.nodeKey });
	}

	return topologyHash(nodes, edges);
}

export function topologyHash(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): string {
	const normalized = {
		nodes: nodes.map(({ snapshotId: _snapshotId, properties, ...node }) => ({ ...node, properties })).sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)),
		edges: edges.map(({ snapshotId: _snapshotId, properties, ...edge }) => ({ ...edge, properties })).sort((a, b) => a.edgeKey.localeCompare(b.edgeKey))
	};
	return createHash('sha256').update(stableJson(normalized)).digest('hex');
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}
