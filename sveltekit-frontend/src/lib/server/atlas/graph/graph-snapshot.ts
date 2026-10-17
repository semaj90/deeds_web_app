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

	const participantsByRelation = new Map<string, GraphRelationParticipant[]>();
	for (const participant of participants) {
		participantsByRelation.set(participant.relationId, [...(participantsByRelation.get(participant.relationId) ?? []), participant]);
	}
	for (const relation of relations) {
		const relationParticipants = participantsByRelation.get(relation.relationId) ?? [];
		const participantNodeKeys = new Set(relationParticipants.map((participant) => participant.nodeKey));
		if (participantNodeKeys.size < 3) {
			throw new GraphIdentityValidationError({ kind: 'RELATION_ARITY_BELOW_THREE', relationId: relation.relationId, participantCount: participantNodeKeys.size });
		}
		const sourceNode = relationParticipants
			.map((participant) => nodes.find((node) => node.nodeKey === participant.nodeKey))
			.find((node) => node?.sourceRef === relation.sourceRef);
		if (!sourceNode
			|| typeof sourceNode.properties.sourceRevision !== 'string'
			|| !/^sha256:[a-f0-9]{64}$/i.test(sourceNode.properties.sourceRevision)
			|| typeof sourceNode.properties.workspaceRevision !== 'string'
			|| !/^sha256:[a-f0-9]{64}$/i.test(sourceNode.properties.workspaceRevision)) {
			throw new GraphIdentityValidationError({ kind: 'RELATION_SOURCE_NODE_UNQUALIFIED', relationId: relation.relationId, sourceRef: relation.sourceRef });
		}
		for (const participant of relationParticipants) {
			const node = nodes.find((candidate) => candidate.nodeKey === participant.nodeKey)!;
			if (typeof node.properties.sourceRevision !== 'string'
				|| !/^sha256:[a-f0-9]{64}$/i.test(node.properties.sourceRevision)
				|| node.properties.workspaceRevision !== sourceNode.properties.workspaceRevision) {
				throw new GraphIdentityValidationError({ kind: 'RELATION_PARTICIPANT_REVISION_UNQUALIFIED', relationId: relation.relationId, nodeKey: participant.nodeKey });
			}
		}
	}
	const digest = topologyHash(nodes, edges, relations, participants);
	for (const relation of relations) {
		if (relation.topologyHash !== digest) {
			throw new GraphIdentityValidationError({ kind: 'RELATION_TOPOLOGY_HASH_MISMATCH', relationId: relation.relationId, expected: digest, actual: relation.topologyHash });
		}
	}
	return digest;
}

export function topologyHash(
	nodes: readonly GraphNode[],
	edges: readonly GraphEdge[],
	relationEvents: readonly GraphRelationEvent[] = [],
	relationParticipants: readonly GraphRelationParticipant[] = [],
): string {
	// Streamed into the hash incrementally rather than materialized as one JS
	// string: for full-corpus snapshots (hundreds of thousands of nodes/edges)
	// building the whole normalized document as a single string via
	// Array.join hits V8's max string length (RangeError: Invalid string
	// length). Feeding sha256 the same byte sequence via update() calls
	// produces an identical digest to the single-string version for any
	// input that doesn't crash, since sha256 is a streaming hash.
	const sortedNodes = nodes
		.map(({ snapshotId: _snapshotId, properties, ...node }) => ({ ...node, properties }))
		.sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
	const sortedEdges = edges
		.map(({ snapshotId: _snapshotId, properties, ...edge }) => ({ ...edge, properties }))
		.sort((a, b) => a.edgeKey.localeCompare(b.edgeKey));
	const sortedRelations = relationEvents
		.map(({ snapshotId: _snapshotId, topologyHash: _topologyHash, ...relation }) => relation)
		.sort((a, b) => a.relationId.localeCompare(b.relationId));
	const sortedParticipants = relationParticipants
		.map(({ snapshotId: _snapshotId, ...participant }) => participant)
		.sort((a, b) => a.relationId.localeCompare(b.relationId)
			|| a.ordinal - b.ordinal
			|| a.role.localeCompare(b.role)
			|| a.nodeKey.localeCompare(b.nodeKey));

	// stableJson sorts ALL object keys alphabetically, including this
	// top-level envelope — "edges" < "nodes" — so the legacy monolithic
	// implementation (stableJson({ nodes, edges })) emits edges first. The
	// envelope below must match that exact key order or the digest diverges
	// from stableJson's output even though each node/edge body is identical.
	const hash = createHash('sha256');
	hash.update('{"edges":[');
	sortedEdges.forEach((edge, index) => {
		if (index > 0) hash.update(',');
		hash.update(stableJson(edge));
	});
	hash.update('],"nodes":[');
	sortedNodes.forEach((node, index) => {
		if (index > 0) hash.update(',');
		hash.update(stableJson(node));
	});
	hash.update(']');
	if (sortedRelations.length > 0 || sortedParticipants.length > 0) {
		hash.update(',"relationEvents":[');
		sortedRelations.forEach((relation, index) => {
			if (index > 0) hash.update(',');
			hash.update(stableJson(relation));
		});
		hash.update('],"relationParticipants":[');
		sortedParticipants.forEach((participant, index) => {
			if (index > 0) hash.update(',');
			hash.update(stableJson(participant));
		});
		hash.update(']');
	}
	hash.update('}');
	return hash.digest('hex');
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}
