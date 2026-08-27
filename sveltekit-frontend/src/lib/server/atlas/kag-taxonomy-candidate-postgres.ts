import { pool } from '$lib/server/db/client.js';
import {
  TaxonomyAssignmentCandidateV1Schema,
  promoteTaxonomyAssignmentV1,
  type TaxonomyAssignmentCandidateV1,
} from './taxonomy/entity-concept-taxonomy-v1.js';
import { persistHyperedges } from './kag-hyperedge-postgres.js';

/**
 * KAG taxonomy-assignment review surface (roadmap step 2).
 *
 * Persists TaxonomyAssignmentCandidateV1 rows for review, and provides the
 * one call site that transitions a candidate's status from
 * 'proposed'/'review_required' to 'promoted'/'rejected' -- the review step
 * that promoteTaxonomyAssignmentV1()'s status gate (2026-08-26) requires
 * before it will mint a canonical HyperedgeV1.
 *
 * Postgres-first, same discipline as KAG-05E: the candidate's status flip is
 * its own committed statement BEFORE the hyperedge write is attempted. If the
 * hyperedge write then fails, the candidate stays correctly marked
 * 'promoted' with `promoted_hyperedge_id` left null -- a real, queryable
 * degraded state, never silently hidden or rolled back into 'proposed'.
 */

function row(candidate: TaxonomyAssignmentCandidateV1) {
  return [
    candidate.candidateId,
    candidate.entityId,
    candidate.conceptId,
    candidate.taxonomyRevision,
    candidate.semanticRevision,
    candidate.graphRevision,
    candidate.semanticNeighborRefs,
    candidate.communityRefs,
    candidate.graphEvidenceRefs,
    candidate.lexicalEvidenceRefs,
    candidate.nlpEvidenceRefs,
    candidate.evidenceRefs,
    candidate.semanticScore,
    candidate.communityAffinity,
    candidate.graphSupport,
    candidate.lexicalSupport,
    candidate.nlpSupport,
    candidate.status,
    candidate.producerRevision,
  ];
}

export async function persistTaxonomyAssignmentCandidates(
  candidates: readonly TaxonomyAssignmentCandidateV1[]
): Promise<{ attempted: number; written: number; errors: Array<{ candidateId: string; message: string }> }> {
  const result = { attempted: 0, written: 0, errors: [] as Array<{ candidateId: string; message: string }> };
  if (candidates.length === 0) return result;

  for (const candidate of candidates) {
    result.attempted += 1;
    try {
      await pool.query(
        `INSERT INTO atlas_taxonomy_assignment_candidates (
           candidate_id, entity_id, concept_id, taxonomy_revision, semantic_revision, graph_revision,
           semantic_neighbor_refs, community_refs, graph_evidence_refs, lexical_evidence_refs, nlp_evidence_refs,
           evidence_refs, semantic_score, community_affinity, graph_support, lexical_support, nlp_support,
           status, producer_revision, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7::text[],$8::text[],$9::text[],$10::text[],$11::text[],
           $12::text[],$13,$14,$15,$16,$17,$18,$19,now()
         )
         -- Only the descriptive/signal columns are refreshed on conflict.
         -- status/reviewed_by/reviewed_at/promoted_hyperedge_id are the
         -- review layer's exclusive write surface (decideTaxonomyAssignmentCandidateV1)
         -- and must never be clobbered by a re-run of the candidate producer.
         ON CONFLICT (candidate_id) DO UPDATE SET
           semantic_neighbor_refs = EXCLUDED.semantic_neighbor_refs,
           community_refs = EXCLUDED.community_refs,
           graph_evidence_refs = EXCLUDED.graph_evidence_refs,
           lexical_evidence_refs = EXCLUDED.lexical_evidence_refs,
           nlp_evidence_refs = EXCLUDED.nlp_evidence_refs,
           evidence_refs = EXCLUDED.evidence_refs,
           semantic_score = EXCLUDED.semantic_score,
           community_affinity = EXCLUDED.community_affinity,
           graph_support = EXCLUDED.graph_support,
           lexical_support = EXCLUDED.lexical_support,
           nlp_support = EXCLUDED.nlp_support,
           producer_revision = EXCLUDED.producer_revision,
           updated_at = now()`,
        row(candidate)
      );
      result.written += 1;
    } catch (err) {
      result.errors.push({ candidateId: candidate.candidateId, message: (err as Error)?.message ?? String(err) });
    }
  }

  return result;
}

interface CandidateRow {
  candidate_id: string;
  entity_id: string;
  concept_id: string;
  taxonomy_revision: string;
  semantic_revision: string;
  graph_revision: string;
  semantic_neighbor_refs: string[];
  community_refs: string[];
  graph_evidence_refs: string[];
  lexical_evidence_refs: string[];
  nlp_evidence_refs: string[];
  evidence_refs: string[];
  semantic_score: number | null;
  community_affinity: number | null;
  graph_support: number | null;
  lexical_support: number | null;
  nlp_support: number | null;
  status: TaxonomyAssignmentCandidateV1['status'];
  producer_revision: string;
}

function rowToCandidateV1(r: CandidateRow): TaxonomyAssignmentCandidateV1 {
  return TaxonomyAssignmentCandidateV1Schema.parse({
    schema: 'atlas.taxonomy-assignment-candidate.v1',
    candidateId: r.candidate_id,
    entityId: r.entity_id,
    conceptId: r.concept_id,
    taxonomyRevision: r.taxonomy_revision,
    semanticRevision: r.semantic_revision,
    graphRevision: r.graph_revision,
    semanticNeighborRefs: r.semantic_neighbor_refs ?? [],
    communityRefs: r.community_refs ?? [],
    graphEvidenceRefs: r.graph_evidence_refs ?? [],
    lexicalEvidenceRefs: r.lexical_evidence_refs ?? [],
    nlpEvidenceRefs: r.nlp_evidence_refs ?? [],
    evidenceRefs: r.evidence_refs ?? [],
    semanticScore: r.semantic_score,
    communityAffinity: r.community_affinity,
    graphSupport: r.graph_support,
    lexicalSupport: r.lexical_support,
    nlpSupport: r.nlp_support,
    status: r.status,
    producerRevision: r.producer_revision,
  });
}

export async function listPendingTaxonomyAssignmentCandidates(limit = 50): Promise<TaxonomyAssignmentCandidateV1[]> {
  const bounded = Math.max(1, Math.min(500, Math.trunc(limit)));
  const result = await pool.query<CandidateRow>(
    `SELECT candidate_id, entity_id, concept_id, taxonomy_revision, semantic_revision, graph_revision,
            semantic_neighbor_refs, community_refs, graph_evidence_refs, lexical_evidence_refs, nlp_evidence_refs,
            evidence_refs, semantic_score, community_affinity, graph_support, lexical_support, nlp_support,
            status, producer_revision
     FROM atlas_taxonomy_assignment_candidates
     WHERE status IN ('proposed', 'review_required')
     ORDER BY created_at ASC
     LIMIT $1`,
    [bounded]
  );
  return result.rows.map(rowToCandidateV1);
}

export type TaxonomyCandidateDecisionV1 =
  | { outcome: 'rejected'; candidateId: string }
  | { outcome: 'promoted'; candidateId: string; hyperedgeId: string }
  | { outcome: 'promoted_degraded'; candidateId: string; hyperedgeError: string };

/**
 * The one call site that transitions a candidate out of review. Throws a
 * coded error (never silently no-ops) if the candidate doesn't exist or has
 * already been decided -- re-deciding an already-'promoted'/'rejected'
 * candidate is not idempotent-safe here on purpose, since 'promoted' may
 * already have a linked hyperedge.
 */
export async function decideTaxonomyAssignmentCandidateV1(input: {
  candidateId: string;
  decision: 'promoted' | 'rejected';
  reviewedBy: string;
  workspaceRevision: string;
  sourceRevision: string;
  graphRevision: string;
  promotionEvidenceRefs: readonly string[];
  producerRevision: string;
}): Promise<TaxonomyCandidateDecisionV1> {
  const existing = await pool.query<CandidateRow>(
    `SELECT candidate_id, entity_id, concept_id, taxonomy_revision, semantic_revision, graph_revision,
            semantic_neighbor_refs, community_refs, graph_evidence_refs, lexical_evidence_refs, nlp_evidence_refs,
            evidence_refs, semantic_score, community_affinity, graph_support, lexical_support, nlp_support,
            status, producer_revision
     FROM atlas_taxonomy_assignment_candidates WHERE candidate_id = $1`,
    [input.candidateId]
  );
  const row0 = existing.rows[0];
  if (!row0) throw new Error(`TAXONOMY_CANDIDATE_NOT_FOUND:${input.candidateId}`);
  if (row0.status !== 'proposed' && row0.status !== 'review_required') {
    throw new Error(`TAXONOMY_CANDIDATE_ALREADY_DECIDED:${input.candidateId}:${row0.status}`);
  }
  const candidate = rowToCandidateV1(row0);

  if (input.decision === 'rejected') {
    await pool.query(
      `UPDATE atlas_taxonomy_assignment_candidates
       SET status = 'rejected', reviewed_by = $2, reviewed_at = now(), updated_at = now()
       WHERE candidate_id = $1`,
      [input.candidateId, input.reviewedBy]
    );
    return { outcome: 'rejected', candidateId: input.candidateId };
  }

  // Candidate status commits FIRST (Postgres-first, KAG-05E discipline) --
  // this is truth regardless of whether the hyperedge write below succeeds.
  await pool.query(
    `UPDATE atlas_taxonomy_assignment_candidates
     SET status = 'promoted', reviewed_by = $2, reviewed_at = now(), updated_at = now()
     WHERE candidate_id = $1`,
    [input.candidateId, input.reviewedBy]
  );

  const promotedCandidate = TaxonomyAssignmentCandidateV1Schema.parse({ ...candidate, status: 'promoted' as const });
  const edge = promoteTaxonomyAssignmentV1({
    candidate: promotedCandidate,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    graphRevision: input.graphRevision,
    promotionEvidenceRefs: input.promotionEvidenceRefs,
    producerRevision: input.producerRevision,
  });

  const persistResult = await persistHyperedges([edge]);
  if (persistResult.written === 1) {
    await pool.query(
      `UPDATE atlas_taxonomy_assignment_candidates SET promoted_hyperedge_id = $2, updated_at = now() WHERE candidate_id = $1`,
      [input.candidateId, edge.hyperedgeId]
    );
    return { outcome: 'promoted', candidateId: input.candidateId, hyperedgeId: edge.hyperedgeId };
  }

  // Degraded but honest: candidate IS 'promoted' in Postgres; the hyperedge
  // just isn't there yet. promoted_hyperedge_id stays NULL so this is
  // queryable/retriable, never silently reported as a full success.
  const hyperedgeError = persistResult.errors[0]?.message ?? 'unknown persistHyperedges failure';
  return { outcome: 'promoted_degraded', candidateId: input.candidateId, hyperedgeError };
}
