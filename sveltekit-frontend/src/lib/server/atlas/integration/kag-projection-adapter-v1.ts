import type { KAGEdge, KAGNode } from '../../types/kag.js';
import type { HyperedgeV1 } from '../../graph/hyperedge-contract.js';
import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';

/**
 * KAG-01 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration).
 *
 * `KAGNode`/`KAGEdge` (src/lib/server/types/kag.ts) are the legacy
 * consumer-facing shape some graph writers still expect. This adapter does
 * NOT extend that legacy contract with new fields, and it does NOT invent a
 * second canonical n-ary/ontology owner: it only *derives* the legacy shape
 * from the two contracts that already carry real evidence identity —
 * `OntologyLinkedTupleV1` (nodes) and `HyperedgeV1` (relations — see
 * `integration/hyperedge-projection-adapters-v1.ts`'s own comment:
 * "HyperedgeV1 remains the canonical n-ary truth"). Pure projection: no I/O,
 * no Neo4j write, no ranking. Legacy `types/kag.ts` is NOT retired by this
 * file — retirement requires a live proof that this adapter reproduces
 * equivalent graph output against a real Neo4j subgraph, which is a
 * separate, not-yet-done step (KAG-01b).
 */

const KAG_EDGE_TYPES = new Set<KAGEdge['type']>(['IMPORTS', 'REFERENCES', 'SIMILAR_TOPOLOGY', 'CITES', 'RELATED']);

function mapPredicateToKagEdgeType(predicate: string): KAGEdge['type'] {
  const upper = predicate.trim().toUpperCase();
  return KAG_EDGE_TYPES.has(upper as KAGEdge['type']) ? (upper as KAGEdge['type']) : 'RELATED';
}

function mapTupleToKagNodeType(tuple: OntologyLinkedTupleV1): KAGNode['type'] {
  if (tuple.participants.some((participant) => participant.entityKind === 'citation')) return 'citation';
  return tuple.sourceRef.length > 0 ? 'file' : 'concept';
}

/**
 * One `OntologyLinkedTupleV1` becomes one `KAGNode`, keyed by
 * `packetKey ?? sourceRef` (packetKey is canonical identity when present;
 * sourceRef is the fallback that's always populated). Deterministic:
 * identical input tuples always produce identical node lists in the same
 * order (input order preserved, de-duplicated by node id keeping the
 * highest-confidence tuple for that id).
 */
export function projectOntologyTuplesToKagNodesV1(tuples: readonly OntologyLinkedTupleV1[]): KAGNode[] {
  const byId = new Map<string, { tuple: OntologyLinkedTupleV1; node: KAGNode }>();
  for (const tuple of tuples) {
    const id = tuple.packetKey ?? tuple.sourceRef;
    const existing = byId.get(id);
    if (existing && existing.tuple.confidence >= tuple.confidence) continue;
    const tags = Array.from(new Set([...tuple.ontologyIds, ...tuple.conceptIds]));
    byId.set(id, {
      tuple,
      node: {
        id,
        type: mapTupleToKagNodeType(tuple),
        label: tuple.label,
        filePath: tuple.sourceRef,
        tags,
      },
    });
  }
  return Array.from(byId.values()).map((entry) => entry.node);
}

/**
 * One `HyperedgeV1` (n-ary, `participants.length >= 2`) becomes a fan of
 * binary `KAGEdge`s connecting the first participant (by ordinal) to every
 * other participant — a star projection, not a clique, so edge count stays
 * linear in participant count. `weight` is normalized by fan-out
 * (`1 / (participants.length - 1)`) so a single hyperedge's total edge
 * weight sums to 1, keeping wide n-ary relations from dominating a
 * downstream PageRank/authority pass purely by participant count.
 */
export function projectHyperedgesToKagEdgesV1(edges: readonly HyperedgeV1[]): KAGEdge[] {
  const result: KAGEdge[] = [];
  for (const edge of edges) {
    const ordered = [...edge.participants].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
    const [hub, ...rest] = ordered;
    if (!hub || rest.length === 0) continue;
    const weight = 1 / rest.length;
    for (const participant of rest) {
      result.push({
        from: hub.canonicalId,
        to: participant.canonicalId,
        type: mapPredicateToKagEdgeType(edge.predicate),
        weight,
      });
    }
  }
  return result;
}
