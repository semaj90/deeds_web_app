import { createTaxonomyAssignmentCandidateV1, type TaxonomyAssignmentCandidateV1 } from './taxonomy/entity-concept-taxonomy-v1.js';
import type { OntologyLinkedTupleV1 } from './contracts/ontology-linked-tuple-v1.js';

/**
 * KAG taxonomy-candidate producer (roadmap step 1).
 *
 * Rather than a new speculative multi-service fusion job pulling live KNN +
 * community + graph + lexical + NLP signals from five different
 * subsystems (unverifiable without a much larger integration effort), this
 * derives TaxonomyAssignmentCandidateV1 rows from OntologyLinkedTupleV1 rows
 * a live pipeline is already producing (taxonomy-topology-packet.ts's
 * buildTaxonomyTopologyPacket, called from a registered MCP tool). Those
 * tuples already carry real evidence (evidenceRefs), a real confidence
 * score, and — for label_kind='ontology' rows — a real concept assignment
 * (ontologyIds/conceptIds). That IS a taxonomy-assignment hypothesis; this
 * module just gives it the TaxonomyAssignmentCandidateV1 shape so it can
 * flow through the same review gate as any other candidate.
 *
 * Only `semanticScore` and `nlpEvidenceRefs`/`nlpSupport` are populated —
 * community/graph/lexical signals are left null rather than fabricated,
 * since this producer genuinely has no data for them. A future producer
 * that DOES have those signals can populate the same candidate shape more
 * fully; this one is honest about what it actually knows.
 */

const AUTO_PROPOSE_CONFIDENCE_THRESHOLD = 0.85;

function conceptIdFor(tuple: OntologyLinkedTupleV1): string | null {
  const id = tuple.conceptIds[0] ?? tuple.ontologyIds[0];
  return id ? id.trim() || null : null;
}

function entityIdFor(tuple: OntologyLinkedTupleV1): string {
  return tuple.packetKey ?? tuple.sourceRef;
}

function graphRevisionFor(tuple: OntologyLinkedTupleV1): string {
  return tuple.provenance.graphRevision ?? tuple.provenance.sourceRevision ?? tuple.relationRevision ?? 'unknown';
}

function semanticRevisionFor(tuple: OntologyLinkedTupleV1): string {
  return tuple.provenance.representationRevision ?? tuple.provenance.modelRevision ?? tuple.provenance.ontologyVersion ?? 'unknown';
}

function taxonomyRevisionFor(tuple: OntologyLinkedTupleV1): string {
  return tuple.provenance.ontologyRevision ?? tuple.provenance.ontologyVersion ?? 'unknown';
}

/**
 * Deterministic: the same set of input tuples always produces the same
 * candidate list in the same order (sorted by candidateId). Only
 * label_kind='ontology' tuples with a resolvable concept id and non-empty
 * evidence produce a candidate — pos/tag tuples aren't taxonomy assignments.
 */
export function deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1(
  tuples: readonly OntologyLinkedTupleV1[],
  producerRevision: string
): TaxonomyAssignmentCandidateV1[] {
  const candidates: TaxonomyAssignmentCandidateV1[] = [];

  for (const tuple of tuples) {
    if (tuple.labelKind !== 'ontology') continue;
    const conceptId = conceptIdFor(tuple);
    if (!conceptId) continue;
    if (tuple.evidenceRefs.length === 0) continue; // no evidence, no candidate — same discipline as HYPEREDGE_GRAPH_PROJECTION_REQUIRES_EVIDENCE

    const entityId = entityIdFor(tuple);
    const status = tuple.evidenceState === 'ACTIVE_VERIFIED' && tuple.confidence >= AUTO_PROPOSE_CONFIDENCE_THRESHOLD
      ? ('proposed' as const)
      : ('review_required' as const);

    candidates.push(
      createTaxonomyAssignmentCandidateV1({
        entityId,
        conceptId,
        taxonomyRevision: taxonomyRevisionFor(tuple),
        semanticRevision: semanticRevisionFor(tuple),
        graphRevision: graphRevisionFor(tuple),
        nlpEvidenceRefs: [...tuple.evidenceRefs],
        evidenceRefs: [...tuple.evidenceRefs, `ontology-tuple:${tuple.tupleId}`],
        semanticScore: tuple.confidence,
        status,
        producerRevision,
      })
    );
  }

  return candidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}
