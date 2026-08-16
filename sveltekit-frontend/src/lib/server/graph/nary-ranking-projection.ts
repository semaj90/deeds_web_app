export interface NaryParticipantV1 {
	canonicalId: string;
	role: string;
	weight?: number;
}

export interface NaryRelationV1 {
	relationId: string;
	predicate: string;
	participants: readonly NaryParticipantV1[];
}

export interface RankingEdgeV1 {
	source: string;
	target: string;
	weight: number;
	edgeKind: 'participant_to_relation' | 'relation_to_participant';
	role: string;
}

/**
 * Preserve n-ary semantics for PageRank/PPR by introducing a relation node.
 *
 * We deliberately do NOT collapse an n-ary relation into a participant clique:
 * that would invent pairwise relationships that are not present in canonical
 * evidence and would multiply votes/authority as arity grows.
 *
 * Canonical relation:
 *   R(subject=A, object=B, context=C)
 *
 * Derived ranking projection:
 *   A -> relation:R -> B
 *   C -> relation:R
 *
 * Both directions are emitted so authority can flow through the relation node,
 * but downstream code may filter either edge kind for a task-specific
 * projection. This file owns only the deterministic projection, not truth.
 */
export function projectNaryRelationForRanking(relation: NaryRelationV1): {
	relationNodeId: string;
	edges: RankingEdgeV1[];
} {
	if (!relation.relationId.trim()) throw new Error('relationId is required');
	if (!relation.predicate.trim()) throw new Error('predicate is required');
	if (relation.participants.length < 2) throw new Error('n-ary relation requires at least two participants');

	const seen = new Set<string>();
	const relationNodeId = `relation:${relation.relationId}`;
	const edges: RankingEdgeV1[] = [];

	for (const participant of relation.participants) {
		if (!participant.canonicalId.trim()) throw new Error('participant canonicalId is required');
		if (!participant.role.trim()) throw new Error('participant role is required');
		const identity = `${participant.role}\u0000${participant.canonicalId}`;
		if (seen.has(identity)) throw new Error(`duplicate participant identity: ${participant.role}:${participant.canonicalId}`);
		seen.add(identity);

		const weight = participant.weight ?? 1;
		if (!Number.isFinite(weight) || weight <= 0) throw new Error('participant weight must be finite and > 0');

		edges.push({
			source: participant.canonicalId,
			target: relationNodeId,
			weight,
			edgeKind: 'participant_to_relation',
			role: participant.role,
		});
		edges.push({
			source: relationNodeId,
			target: participant.canonicalId,
			weight,
			edgeKind: 'relation_to_participant',
			role: participant.role,
		});
	}

	return { relationNodeId, edges };
}
