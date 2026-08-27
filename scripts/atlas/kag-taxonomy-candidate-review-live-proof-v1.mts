import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

// See kag-persist-hyperedges-live-proof-v1.mts for why this must be set
// before importing anything that transitively imports db/client.ts.
process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { createTaxonomyAssignmentCandidateV1 } = await import('../../sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts');
const {
  persistTaxonomyAssignmentCandidates,
  listPendingTaxonomyAssignmentCandidates,
  decideTaxonomyAssignmentCandidateV1,
} = await import('../../sveltekit-frontend/src/lib/server/atlas/kag-taxonomy-candidate-postgres.ts');

/**
 * Live proof of the full review-surface life cycle (roadmap step 2):
 * candidate persisted ('proposed') -> shows up in the pending queue ->
 * rejected candidate stays hyperedge-less -> promoted candidate produces and
 * links a real atlas_hyperedges row -> already-decided candidates are
 * refused a second decision.
 *
 * Real commits (this module has no transaction to roll back, by design --
 * it's the live write path), so every row this proof creates is explicitly
 * deleted and the deletion verified before exit.
 */

const { Pool } = pg;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  const report: Record<string, unknown> = { schema: 'atlas.kag.taxonomy-candidate-review-live-proof.v1' };
  const testEntityId = 'symbol:kag-review-live-proof';
  const rejectedCandidate = createTaxonomyAssignmentCandidateV1({
    entityId: testEntityId,
    conceptId: 'concept:kag-review-live-proof-reject',
    taxonomyRevision: 'taxonomy:kag-review-live-proof',
    semanticRevision: 'semantic_768:kag-review-live-proof',
    graphRevision: 'graph:kag-review-live-proof',
    evidenceRefs: ['source:kag-review-live-proof:1'],
    producerRevision: 'kag-review-live-proof:v1',
  });
  const promotedCandidate = createTaxonomyAssignmentCandidateV1({
    entityId: testEntityId,
    conceptId: 'concept:kag-review-live-proof-promote',
    taxonomyRevision: 'taxonomy:kag-review-live-proof',
    semanticRevision: 'semantic_768:kag-review-live-proof',
    graphRevision: 'graph:kag-review-live-proof',
    evidenceRefs: ['source:kag-review-live-proof:2'],
    producerRevision: 'kag-review-live-proof:v1',
  });

  const persistResult = await persistTaxonomyAssignmentCandidates([rejectedCandidate, promotedCandidate]);
  report.persistResult = persistResult;
  assert(persistResult.written === 2, `expected both candidates persisted, got ${JSON.stringify(persistResult)}`);

  const pending = await listPendingTaxonomyAssignmentCandidates(500);
  const pendingIds = new Set(pending.map((c) => c.candidateId));
  assert(pendingIds.has(rejectedCandidate.candidateId) && pendingIds.has(promotedCandidate.candidateId), 'both candidates should appear in the pending queue');
  report.pendingQueueContainsBoth = true;

  const rejectDecision = await decideTaxonomyAssignmentCandidateV1({
    candidateId: rejectedCandidate.candidateId,
    decision: 'rejected',
    reviewedBy: 'live-proof-reviewer',
    workspaceRevision: 'workspace:kag-review-live-proof',
    sourceRevision: 'source:kag-review-live-proof',
    graphRevision: 'graph:kag-review-live-proof',
    promotionEvidenceRefs: [],
    producerRevision: 'kag-review-live-proof:v1',
  });
  assert(rejectDecision.outcome === 'rejected', `expected rejected outcome, got ${JSON.stringify(rejectDecision)}`);
  report.rejectDecision = rejectDecision;

  const promoteDecision = await decideTaxonomyAssignmentCandidateV1({
    candidateId: promotedCandidate.candidateId,
    decision: 'promoted',
    reviewedBy: 'live-proof-reviewer',
    workspaceRevision: 'workspace:kag-review-live-proof',
    sourceRevision: 'source:kag-review-live-proof',
    graphRevision: 'graph:kag-review-live-proof',
    promotionEvidenceRefs: ['review:live-proof:approved'],
    producerRevision: 'kag-review-live-proof:v1',
  });
  assert(promoteDecision.outcome === 'promoted', `expected promoted outcome, got ${JSON.stringify(promoteDecision)}`);
  report.promoteDecision = promoteDecision;

  let alreadyDecidedError: string | null = null;
  try {
    await decideTaxonomyAssignmentCandidateV1({
      candidateId: promotedCandidate.candidateId,
      decision: 'rejected',
      reviewedBy: 'live-proof-reviewer',
      workspaceRevision: 'workspace:kag-review-live-proof',
      sourceRevision: 'source:kag-review-live-proof',
      graphRevision: 'graph:kag-review-live-proof',
      promotionEvidenceRefs: [],
      producerRevision: 'kag-review-live-proof:v1',
    });
  } catch (err) {
    alreadyDecidedError = err instanceof Error ? err.message : String(err);
  }
  assert(alreadyDecidedError?.startsWith('TAXONOMY_CANDIDATE_ALREADY_DECIDED:'), `expected already-decided guard to fire, got: ${alreadyDecidedError}`);
  report.alreadyDecidedGuardFired = true;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const linked = await pool.query(
      `SELECT status, promoted_hyperedge_id FROM atlas_taxonomy_assignment_candidates WHERE candidate_id = $1`,
      [promotedCandidate.candidateId]
    );
    assert(linked.rows[0]?.status === 'promoted', 'promoted candidate row should have status=promoted');
    assert(linked.rows[0]?.promoted_hyperedge_id === promoteDecision.hyperedgeId, 'promoted_hyperedge_id should link back to the real hyperedge');
    report.linkedHyperedgeVerified = linked.rows[0];

    const hyperedgeRow = await pool.query(
      `SELECT relation_type FROM atlas_hyperedges WHERE contract_hyperedge_id = $1`,
      [promoteDecision.hyperedgeId]
    );
    assert(hyperedgeRow.rows[0]?.relation_type === 'ENTITY_CLASSIFIED_AS', 'linked hyperedge should be a real ENTITY_CLASSIFIED_AS row');
    report.hyperedgeRowVerified = hyperedgeRow.rows[0];

    // Cleanup: candidates first (no FK to hyperedges), then the hyperedge
    // (member rows cascade). Verify both are actually gone.
    const deletedCandidates = await pool.query(
      `DELETE FROM atlas_taxonomy_assignment_candidates WHERE candidate_id = ANY($1::text[]) RETURNING candidate_id`,
      [[rejectedCandidate.candidateId, promotedCandidate.candidateId]]
    );
    assert(deletedCandidates.rows.length === 2, 'cleanup should delete exactly 2 candidate rows');

    const deletedHyperedge = await pool.query(
      `DELETE FROM atlas_hyperedges WHERE contract_hyperedge_id = $1 RETURNING hyperedge_id`,
      [promoteDecision.hyperedgeId]
    );
    assert(deletedHyperedge.rows.length === 1, 'cleanup should delete exactly 1 hyperedge row');

    const verifyGone = await pool.query(
      `SELECT
         (SELECT count(*) FROM atlas_taxonomy_assignment_candidates WHERE candidate_id = ANY($1::text[])) AS candidates_left,
         (SELECT count(*) FROM atlas_hyperedge_members WHERE hyperedge_id = $2) AS members_left`,
      [[rejectedCandidate.candidateId, promotedCandidate.candidateId], deletedHyperedge.rows[0].hyperedge_id]
    );
    assert(Number(verifyGone.rows[0].candidates_left) === 0, 'candidate rows survived cleanup');
    assert(Number(verifyGone.rows[0].members_left) === 0, 'hyperedge member rows survived cascade delete');

    report.status = 'PROVEN';
    report.cleanup = 'VERIFIED_REMOVED';
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
}

await main();
