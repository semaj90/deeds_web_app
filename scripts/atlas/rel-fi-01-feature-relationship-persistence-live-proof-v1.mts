import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

// Same env-setup requirement as kag-persist-hyperedges-live-proof-v1.mts, though
// this module has no $lib imports itself -- kept for consistency and in case a
// future edit adds one.
process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { createFeatureIntelligenceRepository } = await import('../../packages/parent-atlas/dist/core/feature-intelligence-repository.js');
const { buildFeatureRelationship, featureSchema, featureEvidenceSchema } = await import('../../packages/parent-atlas/dist/core/feature-intelligence.js');

/**
 * REL-FI-01 live proof: persistRelationship() end to end against the
 * newly-applied atlas_fi_features / atlas_relationships / atlas_relationship_*
 * schema (drizzle/manual/20260817_atlas_feature_intelligence_v1.sql, renamed
 * to atlas_fi_features / atlas_fi_evidence to avoid the collision documented
 * in openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md).
 *
 * Real commits -- every row this proof creates is explicitly deleted and the
 * deletion verified before exit.
 */

const { Pool } = pg;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  const report: Record<string, unknown> = { schema: 'atlas.rel-fi-01.feature-relationship-persistence-live-proof.v1' };
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = createFeatureIntelligenceRepository(pool);

  const featureId = 'feature:rel-fi-01-live-proof';
  const evidenceId = 'evidence:rel-fi-01-live-proof';
  const relationshipId = 'rel:rel-fi-01-live-proof';

  try {
    const feature = featureSchema.parse({
      feature_id: featureId,
      feature_key: 'rel-fi-01-live-proof-key',
      feature_label: 'REL-FI-01 live proof feature',
      domain: 'retrieval',
      status: 'active',
      feature_revision: 'feature-r1',
      producer_revision: 'rel-fi-01-live-proof',
      aliases: ['rel-fi-01 alias'],
    });
    const upserted = await repo.upsertFeature(feature);
    assert(upserted.feature_id === featureId, `upsertFeature returned ${upserted.feature_id}, expected ${featureId}`);
    report.featureUpserted = true;

    const evidence = featureEvidenceSchema.parse({
      evidence_id: evidenceId,
      evidence_kind: 'doc_mention',
      feature_id: featureId,
      relation_type: 'DOC_RELATES_CONCEPTS',
      polarity: 'supports',
      source_ref: 'docs/rel-fi-01-live-proof.md',
      source_revision: 'source-r1',
      evidence_revision: 'evidence-r1',
      producer_revision: 'rel-fi-01-live-proof',
      confidence: 0.9,
      payload: { note: 'rel-fi-01 live proof' },
    });
    await repo.insertEvidence(evidence);
    report.evidenceInserted = true;

    const relationship = buildFeatureRelationship({
      relationship_id: relationshipId,
      relationship_type: 'DOC_RELATES_CONCEPTS',
      participants: [
        { role: 'subject', entity_type: 'document', entity_id: 'doc:rel-fi-01-live-proof' },
        { role: 'object', entity_type: 'concept', entity_id: 'concept:rel-fi-01-live-proof' },
      ],
      source_ref: 'docs/rel-fi-01-live-proof.md',
      source_revision: 'source-r1',
      relationship_revision: 'rel-r1',
      producer_revision: 'rel-fi-01-live-proof',
      evidence_refs: [evidenceId],
      confidence: 0.9,
    });
    const persisted = await repo.persistRelationship(relationship);
    assert(persisted.relationship_id === relationshipId, 'persistRelationship returned wrong relationship_id');
    report.relationshipPersisted = true;

    const found = await repo.findRelationshipsForEntities(['doc:rel-fi-01-live-proof']);
    assert(found.length === 1, `expected 1 relationship for doc:rel-fi-01-live-proof, found ${found.length}`);
    assert(found[0]!.relationship_id === relationshipId, 'read-back relationship_id mismatch');
    assert(found[0]!.participants.length === 2, `expected 2 participants, found ${found[0]!.participants.length}`);
    assert(found[0]!.evidence_refs.includes(evidenceId), 'read-back evidence_refs missing the inserted evidence id');
    report.readBackVerified = true;
    report.readBack = found[0];

    // atlas_validate_relationship() ran inside persistRelationship() itself and
    // would have thrown on mismatch -- getting here proves participant_count /
    // relationship_degree / relationship_degree_kind all agree with the member rows.
    report.validateRelationshipFunctionPassed = true;
  } finally {
    await pool.query('DELETE FROM atlas_relationship_evidence WHERE relationship_id = $1', [relationshipId]);
    await pool.query('DELETE FROM atlas_relationship_cardinality WHERE relationship_id = $1', [relationshipId]);
    await pool.query('DELETE FROM atlas_relationship_members WHERE relationship_id = $1', [relationshipId]);
    await pool.query('DELETE FROM atlas_relationships WHERE relationship_id = $1', [relationshipId]);
    // NOTE: atlas_feature_evidence (no atlas_fi_ prefix) is the unrelated,
    // pre-existing packet-level evidence table this session found colliding
    // with the drafted migration -- it has no evidence_id column and must
    // never be touched here. atlas_fi_evidence is the renamed FI table.
    await pool.query('DELETE FROM atlas_fi_evidence WHERE evidence_id = $1', [evidenceId]);
    await pool.query('DELETE FROM atlas_evidence WHERE evidence_id = $1', [evidenceId]);
    await pool.query('DELETE FROM atlas_fi_features WHERE feature_id = $1', [featureId]);

    const remaining = await pool.query(
      `SELECT
         (SELECT count(*) FROM atlas_relationships WHERE relationship_id = $1) AS relationships,
         (SELECT count(*) FROM atlas_relationship_members WHERE relationship_id = $1) AS members,
         (SELECT count(*) FROM atlas_relationship_evidence WHERE relationship_id = $1) AS rel_evidence,
         (SELECT count(*) FROM atlas_fi_evidence WHERE evidence_id = $2) AS fi_evidence,
         (SELECT count(*) FROM atlas_fi_features WHERE feature_id = $3) AS fi_features`,
      [relationshipId, evidenceId, featureId],
    );
    const counts = remaining.rows[0];
    const allZero = Object.values(counts).every((value) => Number(value) === 0);
    report.cleanupVerified = allZero;
    if (!allZero) report.cleanupResidue = counts;

    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.cleanupVerified) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
