import { createHash } from 'node:crypto';
import type { HyperRelationV1 } from './hyper-relation-v1.js';

export const INCIDENCE_PROJECTION_SCHEMA = 'atlas.incidence-projection.v1' as const;

export interface IncidenceProjectionEntityInput {
	canonicalId: string;
	nodeKind: string;
}

export interface IncidenceProjectionNodeV1 {
	gpuNodeId: number;
	projectionNodeKey: string;
	kind: 'entity' | 'relation';
	canonicalId: string | null;
	relationId: string | null;
	nodeKind: string;
}

export interface IncidenceProjectionEdgeV1 {
	srcGpuNodeId: number;
	dstGpuNodeId: number;
	edgeType: 'INCIDENT_TO';
	participantRole: string;
	participantOrdinal: number;
	relationId: string;
	weight: 1;
}

export interface IncidenceProjectionV1 {
	schema: typeof INCIDENCE_PROJECTION_SCHEMA;
	workspaceRevision: string;
	projectionRevision: string;
	nodes: IncidenceProjectionNodeV1[];
	edges: IncidenceProjectionEdgeV1[];
	relationCount: number;
	entityCount: number;
	unresolvedParticipantCount: number;
	nodeTableHash: string;
	edgeTableHash: string;
	projectionHash: string;
}

function stableHash(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildIncidenceProjectionV1(input: {
	workspaceRevision: string;
	projectionRevision: string;
	entities: readonly IncidenceProjectionEntityInput[];
	relations: readonly HyperRelationV1[];
}): IncidenceProjectionV1 {
	const sortedEntities = [...input.entities].sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
	const sortedRelations = [...input.relations].sort((a, b) => a.relationId.localeCompare(b.relationId));

	const entityIds = new Set<string>();
	for (const entity of sortedEntities) {
		if (entityIds.has(entity.canonicalId)) {
			throw new Error(`DUPLICATE_CANONICAL_ID:${entity.canonicalId}`);
		}
		entityIds.add(entity.canonicalId);
	}

	const relationIds = new Set<string>();
	for (const relation of sortedRelations) {
		if (relation.workspaceRevision !== input.workspaceRevision) {
			throw new Error(`WORKSPACE_REVISION_MISMATCH:${relation.relationId}`);
		}
		if (relationIds.has(relation.relationId)) {
			throw new Error(`DUPLICATE_RELATION_ID:${relation.relationId}`);
		}
		relationIds.add(relation.relationId);
	}

	const nodes: IncidenceProjectionNodeV1[] = [];
	const gpuIdByEntity = new Map<string, number>();
	const gpuIdByRelation = new Map<string, number>();

	for (const entity of sortedEntities) {
		const gpuNodeId = nodes.length;
		gpuIdByEntity.set(entity.canonicalId, gpuNodeId);
		nodes.push({
			gpuNodeId,
			projectionNodeKey: `entity:${entity.canonicalId}`,
			kind: 'entity',
			canonicalId: entity.canonicalId,
			relationId: null,
			nodeKind: entity.nodeKind
		});
	}

	for (const relation of sortedRelations) {
		const gpuNodeId = nodes.length;
		gpuIdByRelation.set(relation.relationId, gpuNodeId);
		nodes.push({
			gpuNodeId,
			projectionNodeKey: `relation:${relation.relationId}`,
			kind: 'relation',
			canonicalId: null,
			relationId: relation.relationId,
			nodeKind: relation.relationType
		});
	}

	let unresolvedParticipantCount = 0;
	const edges: IncidenceProjectionEdgeV1[] = [];
	for (const relation of sortedRelations) {
		const srcGpuNodeId = gpuIdByRelation.get(relation.relationId)!;
		for (const participant of [...relation.participants].sort((a, b) => a.ordinal - b.ordinal || a.canonicalId.localeCompare(b.canonicalId))) {
			const dstGpuNodeId = gpuIdByEntity.get(participant.canonicalId);
			if (dstGpuNodeId === undefined) {
				unresolvedParticipantCount += 1;
				continue;
			}
			edges.push({
				srcGpuNodeId,
				dstGpuNodeId,
				edgeType: 'INCIDENT_TO',
				participantRole: participant.role,
				participantOrdinal: participant.ordinal,
				relationId: relation.relationId,
				weight: 1
			});
		}
	}

	const nodeTableHash = stableHash(nodes);
	const edgeTableHash = stableHash(edges);
	return {
		schema: INCIDENCE_PROJECTION_SCHEMA,
		workspaceRevision: input.workspaceRevision,
		projectionRevision: input.projectionRevision,
		nodes,
		edges,
		relationCount: sortedRelations.length,
		entityCount: sortedEntities.length,
		unresolvedParticipantCount,
		nodeTableHash,
		edgeTableHash,
		projectionHash: stableHash({
			schema: INCIDENCE_PROJECTION_SCHEMA,
			workspaceRevision: input.workspaceRevision,
			projectionRevision: input.projectionRevision,
			nodeTableHash,
			edgeTableHash
		})
	};
}

export function reconstructRelationsFromIncidenceProjectionV1(
	projection: IncidenceProjectionV1,
	canonicalRelations: readonly HyperRelationV1[]
): HyperRelationV1[] {
	const relationById = new Map(canonicalRelations.map((relation) => [relation.relationId, relation] as const));
	const nodeByGpuId = new Map(projection.nodes.map((node) => [node.gpuNodeId, node] as const));
	const edgesByRelation = new Map<string, IncidenceProjectionEdgeV1[]>();

	for (const edge of projection.edges) {
		const group = edgesByRelation.get(edge.relationId) ?? [];
		group.push(edge);
		edgesByRelation.set(edge.relationId, group);
	}

	const reconstructed: HyperRelationV1[] = [];
	for (const relationNode of projection.nodes.filter((node) => node.kind === 'relation')) {
		const relationId = relationNode.relationId!;
		const canonical = relationById.get(relationId);
		if (!canonical) throw new Error(`CANONICAL_RELATION_MISSING:${relationId}`);

		const participants = (edgesByRelation.get(relationId) ?? []).map((edge) => {
			const entityNode = nodeByGpuId.get(edge.dstGpuNodeId);
			if (!entityNode?.canonicalId) throw new Error(`ENTITY_NODE_MISSING:${edge.dstGpuNodeId}`);
			return {
				canonicalId: entityNode.canonicalId,
				role: edge.participantRole,
				ordinal: edge.participantOrdinal
			};
		}).sort((a, b) => a.ordinal - b.ordinal || a.canonicalId.localeCompare(b.canonicalId));

		reconstructed.push({ ...canonical, participants });
	}

	return reconstructed.sort((a, b) => a.relationId.localeCompare(b.relationId));
}
