import type { Session } from 'neo4j-driver';
import type { RelationshipKernelV1 } from '@deeds/parent-atlas/core/relationship-kernel';

/**
 * "Find a way to wire up" the new relationship-kernel graph layer into ACE's
 * real multi-hop consumer, session 2026-08-26.
 *
 * ACE's multi-hop traversal (multihop-contextual-tree.ts) queries Neo4j
 * directly via Cypher — it has no packet/kernel abstraction of its own. It
 * matches entry nodes on `stableKey`/`sourceRef`/`id` and walks a HARDCODED
 * relationship-type whitelist (IMPORTS|CONTAINS|BELONGS_TO_CLUSTER|
 * REFERENCES|EVIDENCE_FOR|DOCUMENTS|CONSULTED). Confirmed live by reading the
 * file — 'ENTITY_CLASSIFIED_AS'/'CONCEPT_BROADER_THAN' are NOT in it.
 *
 * So this projector alone does not make KAG/FI relationships traversable —
 * it makes them PRESENT in the graph, correctly shaped, ready for the
 * moment someone extends that whitelist (a deliberate, separate, reviewable
 * decision this file does not make on its own).
 *
 * Node identity: MERGE on `stableKey = canonicalId`. This treats a
 * RelationshipKernelV1 participant's canonicalId as equivalent to
 * multihop-contextual-tree.ts's `stableKey` lookup property — an assumption,
 * not a proven equivalence (no formal contract ties the two together yet).
 * Stated explicitly here so a future reader doesn't mistake it for settled.
 *
 * Structural fidelity (REL-OWNER-08's rule, applied identically here):
 * - participants.length === 2 → a direct binary edge, typed by relationType.
 *   Fits multihop-contextual-tree.ts's existing binary-edge traversal model
 *   with zero consumer changes beyond whitelisting the type. Both of
 *   KAG_TAXONOMY's real predicates (ENTITY_CLASSIFIED_AS, CONCEPT_BROADER_THAN)
 *   are always exactly 2 participants (checked live in
 *   entity-concept-taxonomy-v1.ts) — this is the common, cheap case.
 * - participants.length > 2 → an :AtlasRelation hub node plus one
 *   INCIDENT_TO edge per participant (role/ordinal as edge properties) —
 *   the same non-flattening shape incidence-projection-v1.ts already uses
 *   for Postgres/Arrow. A binary flattening here would invent pairwise
 *   semantics that were never asserted, exactly what REL-OWNER-08 ruled out.
 *   multihop-contextual-tree.ts does NOT currently know how to hop through
 *   an :AtlasRelation hub node — that is separate, undone work.
 */

const RELATION_TYPE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Cypher relationship types can't be parameterized — validate before interpolating. */
function assertSafeRelationType(relationType: string): void {
	if (!RELATION_TYPE_PATTERN.test(relationType)) {
		throw new Error(`NEO4J_PROJECTOR_UNSAFE_RELATION_TYPE:${relationType}`);
	}
}

export interface RelationshipKernelNeo4jProjectionResult {
	kernelsAttempted: number;
	binaryEdgesWritten: number;
	hubNodesWritten: number;
	incidentEdgesWritten: number;
	skipped: Array<{ relationshipId: string; reason: string }>;
}

export async function projectRelationshipKernelsToNeo4j(
	session: Session,
	kernels: readonly RelationshipKernelV1[],
): Promise<RelationshipKernelNeo4jProjectionResult> {
	const result: RelationshipKernelNeo4jProjectionResult = {
		kernelsAttempted: 0,
		binaryEdgesWritten: 0,
		hubNodesWritten: 0,
		incidentEdgesWritten: 0,
		skipped: [],
	};

	for (const kernel of kernels) {
		result.kernelsAttempted += 1;

		try {
			assertSafeRelationType(kernel.relationType);
		} catch (error) {
			result.skipped.push({ relationshipId: kernel.relationshipId, reason: (error as Error).message });
			continue;
		}

		if (kernel.participants.length === 2) {
			// Ordinal order here is a canonicalization artifact (buildRelationshipKernel
			// sorts participants by role name, THEN reassigns ordinal 0/1) — it is
			// deterministic and stable, but it is NOT the caller's original semantic
			// "first participant". Property names below say fromRole/toRole, not
			// subjectRole/objectRole, so a reader never mistakes this edge direction
			// for an asserted subject->object claim it never made.
			const [from, to] = [...kernel.participants].sort((a, b) => a.ordinal - b.ordinal);
			await session.run(
				`
				MERGE (fromNode {stableKey: $fromKey})
				MERGE (toNode {stableKey: $toKey})
				MERGE (fromNode)-[r:${kernel.relationType}]->(toNode)
				ON CREATE SET
					r.relationshipId = $relationshipId,
					r.authority = $authority,
					r.fromRole = $fromRole,
					r.toRole = $toRole,
					r.workspaceRevision = $workspaceRevision,
					r.graphRevision = $graphRevision,
					r.producerRevision = $producerRevision,
					r.checksum = $checksum,
					r.createdAt = datetime()
				ON MATCH SET
					r.checksum = $checksum,
					r.updatedAt = datetime()
				`,
				{
					fromKey: from!.canonicalId,
					toKey: to!.canonicalId,
					relationshipId: kernel.relationshipId,
					authority: kernel.authority,
					fromRole: from!.role,
					toRole: to!.role,
					workspaceRevision: kernel.workspaceRevision,
					graphRevision: kernel.graphRevision,
					producerRevision: kernel.producerRevision,
					checksum: kernel.checksum,
				},
			);
			result.binaryEdgesWritten += 1;
			continue;
		}

		await session.run(
			`
			MERGE (relation:AtlasRelation {relationshipId: $relationshipId})
			ON CREATE SET
				relation.relationType = $relationType,
				relation.authority = $authority,
				relation.workspaceRevision = $workspaceRevision,
				relation.graphRevision = $graphRevision,
				relation.producerRevision = $producerRevision,
				relation.checksum = $checksum,
				relation.createdAt = datetime()
			ON MATCH SET
				relation.checksum = $checksum,
				relation.updatedAt = datetime()
			`,
			{
				relationshipId: kernel.relationshipId,
				relationType: kernel.relationType,
				authority: kernel.authority,
				workspaceRevision: kernel.workspaceRevision,
				graphRevision: kernel.graphRevision,
				producerRevision: kernel.producerRevision,
				checksum: kernel.checksum,
			},
		);
		result.hubNodesWritten += 1;

		for (const participant of kernel.participants) {
			await session.run(
				`
				MATCH (relation:AtlasRelation {relationshipId: $relationshipId})
				MERGE (entity {stableKey: $entityKey})
				MERGE (relation)-[r:INCIDENT_TO]->(entity)
				ON CREATE SET r.role = $role, r.ordinal = $ordinal, r.createdAt = datetime()
				ON MATCH SET r.role = $role, r.ordinal = $ordinal, r.updatedAt = datetime()
				`,
				{
					relationshipId: kernel.relationshipId,
					entityKey: participant.canonicalId,
					role: participant.role,
					ordinal: participant.ordinal,
				},
			);
			result.incidentEdgesWritten += 1;
		}
	}

	return result;
}
