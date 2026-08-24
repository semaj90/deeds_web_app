import type { HyperedgeV1 } from '../../graph/hyperedge-contract.js';
import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';

/**
 * KAG-02 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration).
 *
 * An explicit, queryable inverse index from canonical identity
 * (`packetKey`/`sourceRef` — the two identity fields this repo's frozen
 * identity contract actually guarantees; `treeNodeId`/`symbolVersionId` are
 * folded in when present rather than assumed) to the ontology tuples and
 * hyperedges that reference it, and back. This replaces graph-label string
 * matching with a real lookup table. Pure, in-memory, deterministic — no
 * Postgres/Neo4j table is created here; this is the shape a materializer
 * would persist, not the persistence itself (that remains a separate,
 * not-yet-scoped step, consistent with KAG-01's adapter-first approach).
 */

export interface KagMutualIndexV1 {
  /** canonicalId -> ontology tuple ids that reference it */
  canonicalIdToTupleIds: ReadonlyMap<string, readonly string[]>;
  /** canonicalId -> hyperedge ids whose participants include it */
  canonicalIdToHyperedgeIds: ReadonlyMap<string, readonly string[]>;
  /** ontology tuple id -> canonical id it was derived from */
  tupleIdToCanonicalId: ReadonlyMap<string, string>;
  /** hyperedge id -> canonical ids of every participant */
  hyperedgeIdToCanonicalIds: ReadonlyMap<string, readonly string[]>;
}

function canonicalIdOf(tuple: OntologyLinkedTupleV1): string {
  return tuple.packetKey ?? tuple.sourceRef;
}

function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) {
    if (!existing.includes(value)) existing.push(value);
    return;
  }
  map.set(key, [value]);
}

export function buildKagMutualIndexV1(
  tuples: readonly OntologyLinkedTupleV1[],
  hyperedges: readonly HyperedgeV1[],
): KagMutualIndexV1 {
  const canonicalIdToTupleIds = new Map<string, string[]>();
  const tupleIdToCanonicalId = new Map<string, string>();
  for (const tuple of tuples) {
    const canonicalId = canonicalIdOf(tuple);
    pushUnique(canonicalIdToTupleIds, canonicalId, tuple.tupleId);
    tupleIdToCanonicalId.set(tuple.tupleId, canonicalId);
  }

  const canonicalIdToHyperedgeIds = new Map<string, string[]>();
  const hyperedgeIdToCanonicalIds = new Map<string, string[]>();
  for (const edge of hyperedges) {
    const participantIds = Array.from(new Set(edge.participants.map((p) => p.canonicalId)));
    hyperedgeIdToCanonicalIds.set(edge.hyperedgeId, participantIds);
    for (const canonicalId of participantIds) {
      pushUnique(canonicalIdToHyperedgeIds, canonicalId, edge.hyperedgeId);
    }
  }

  return {
    canonicalIdToTupleIds,
    canonicalIdToHyperedgeIds,
    tupleIdToCanonicalId,
    hyperedgeIdToCanonicalIds,
  };
}
