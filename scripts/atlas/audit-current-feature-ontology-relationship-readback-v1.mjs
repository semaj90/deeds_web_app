import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const materializationPath = path.resolve(REPO_ROOT, 'docs/reports/feature-ontology-relationship-materialization-v1.json');
const outputPath = path.resolve(REPO_ROOT, 'docs/reports/current-feature-ontology-relationship-readback-v1.json');
const materialization = JSON.parse(fs.readFileSync(materializationPath, 'utf8'));
const prepared = Array.isArray(materialization.prepared_relationships) ? materialization.prepared_relationships : [];
const expectedIds = prepared.map((row) => String(row.relationship_id)).sort();
const expectedWorkspaceRevision = 'sha256:55edaaadab0cef724593287c7c908dad6cdc1b25039a752a6b5dab2c0c44fac9';
const expectedRelationshipRevision = 'feature-ontology-relationship-preview:v1';

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  query_timeout: 30000,
});

const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined))].sort();
const sameSet = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

try {
  const relationships = await pool.query(`
    SELECT relationship_id, relationship_type, source_ref, source_revision,
           relationship_revision, producer_revision, metadata
      FROM atlas_relationships
     WHERE relationship_id = ANY($1::text[])
     ORDER BY relationship_id
  `, [expectedIds]);

  const relationshipIds = relationships.rows.map((row) => String(row.relationship_id));
  const evidenceLinks = await pool.query(`
    SELECT relationship_id, evidence_id, confidence
      FROM atlas_relationship_evidence
     WHERE relationship_id = ANY($1::text[])
     ORDER BY relationship_id, evidence_id
  `, [expectedIds]);

  const fiEvidence = await pool.query(`
    SELECT relationship_id, feature_id, evidence_id, relation_type
      FROM atlas_fi_evidence
     WHERE relationship_id = ANY($1::text[])
     ORDER BY relationship_id, evidence_id
  `, [expectedIds]);

  const evidenceIds = unique(fiEvidence.rows.map((row) => row.evidence_id));
  const evidence = evidenceIds.length === 0
    ? { rows: [] }
    : await pool.query(`
        SELECT evidence_id, source_ref, source_revision, evidence_revision,
               producer_revision, payload,
               payload->>'workspace_revision' AS workspace_revision
          FROM atlas_evidence
         WHERE evidence_id = ANY($1::text[])
         ORDER BY evidence_id
      `, [evidenceIds]);

  const tupleIds = unique(prepared.map((row) => row.metadata?.source_tuple_id));
  const tuples = tupleIds.length === 0
    ? { rows: [] }
    : await pool.query(`
        SELECT id::text AS tuple_id, source_ref
          FROM feature_ontology_tuples
         WHERE id::text = ANY($1::text[])
         ORDER BY id
      `, [tupleIds]);

  const relationshipById = new Map(relationships.rows.map((row) => [String(row.relationship_id), row]));
  const expectedById = new Map(prepared.map((row) => [String(row.relationship_id), row]));
  const mismatches = [];
  for (const id of expectedIds) {
    const actual = relationshipById.get(id);
    const expected = expectedById.get(id);
    if (!actual) {
      mismatches.push({ relationshipId: id, reason: 'MISSING_RELATIONSHIP_ROW' });
      continue;
    }
    if (actual.source_ref !== expected.source_ref) mismatches.push({ relationshipId: id, reason: 'SOURCE_REF_MISMATCH', expected: expected.source_ref, actual: actual.source_ref });
    if (actual.source_revision !== expected.source_revision) mismatches.push({ relationshipId: id, reason: 'SOURCE_REVISION_MISMATCH', expected: expected.source_revision, actual: actual.source_revision });
    if (actual.relationship_revision !== expectedRelationshipRevision) mismatches.push({ relationshipId: id, reason: 'RELATIONSHIP_REVISION_MISMATCH', actual: actual.relationship_revision });
    if (actual.metadata?.workspace_revision !== expectedWorkspaceRevision) mismatches.push({ relationshipId: id, reason: 'WORKSPACE_REVISION_MISMATCH', actual: actual.metadata?.workspace_revision ?? null });
    if (actual.metadata?.preview_only !== false) mismatches.push({ relationshipId: id, reason: 'PREVIEW_ONLY_NOT_CLEARED', actual: actual.metadata?.preview_only ?? null });
  }

  for (const row of evidence.rows) {
    if (row.workspace_revision !== expectedWorkspaceRevision) mismatches.push({ evidenceId: row.evidence_id, reason: 'EVIDENCE_WORKSPACE_REVISION_MISMATCH', actual: row.workspace_revision ?? null });
  }

  const tupleById = new Map(tuples.rows.map((row) => [String(row.tuple_id), row]));
  for (const expected of prepared) {
    const tupleId = String(expected.metadata?.source_tuple_id ?? '');
    const tuple = tupleById.get(tupleId);
    if (!tuple) {
      mismatches.push({ tupleId, reason: 'ORIGINATING_TUPLE_MISSING' });
      continue;
    }
    if (tuple.source_ref !== expected.metadata?.legacy_source_ref) {
      mismatches.push({ tupleId, reason: 'HISTORICAL_TUPLE_SOURCE_REF_CHANGED', expected: expected.metadata?.legacy_source_ref ?? null, actual: tuple.source_ref ?? null });
    }
  }

  const relationshipCountForBatch = await pool.query(`
    SELECT count(*)::integer AS count
      FROM atlas_relationships
     WHERE metadata->>'materialized_from_preview' = 'true'
       AND metadata->>'workspace_revision' = $1
       AND relationship_revision = $2
  `, [expectedWorkspaceRevision, expectedRelationshipRevision]);

  const report = {
    schema: 'atlas.current-feature-ontology-relationship-readback.v1',
    generatedAt: new Date().toISOString(),
    sourceMaterializationReport: path.relative(REPO_ROOT, materializationPath),
    expectedRelationshipCount: expectedIds.length,
    persistedRelationshipCount: relationships.rowCount,
    persistedRelationshipIds: relationshipIds,
    expectedRelationshipIds: expectedIds,
    exactRelationshipIdSet: sameSet(expectedIds, relationshipIds),
    evidenceLinkCount: evidenceLinks.rowCount,
    featureEvidenceLinkCount: fiEvidence.rowCount,
    evidenceRowCount: evidence.rowCount,
    distinctSourceRefs: unique(relationships.rows.map((row) => row.source_ref)),
    distinctSourceRevisions: unique(relationships.rows.map((row) => row.source_revision)),
    distinctWorkspaceRevisions: unique(relationships.rows.map((row) => row.metadata?.workspace_revision)),
    previewOnlyValues: unique(relationships.rows.map((row) => String(row.metadata?.preview_only))),
    originatingTupleCount: tuples.rowCount,
    historicalTupleRefsPreserved: tuples.rowCount === tupleIds.length
      && prepared.every((row) => tupleById.get(String(row.metadata?.source_tuple_id))?.source_ref === row.metadata?.legacy_source_ref),
    batchRelationshipCount: relationshipCountForBatch.rows[0]?.count ?? 0,
    mismatches,
    status: relationships.rowCount === expectedIds.length
      && sameSet(expectedIds, relationshipIds)
      && evidenceLinks.rowCount === expectedIds.length
      && fiEvidence.rowCount === expectedIds.length
      && evidence.rowCount === expectedIds.length
      && mismatches.length === 0
      && Number(relationshipCountForBatch.rows[0]?.count ?? 0) === expectedIds.length
      ? 'CURRENT_RELATIONSHIP_APPLY_READBACK_PROVEN'
      : 'CURRENT_RELATIONSHIP_APPLY_READBACK_FAILED',
    canonicalWritesConfirmed: materialization.canonical_writes === true,
    writesPerformedByThisAudit: false,
    nextGate: 'REL-01A4_FRESHNESS_AND_REVIEW_OR_CANDIDATE_ALIGNMENT',
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    reportPath: path.relative(REPO_ROOT, outputPath),
    expected: report.expectedRelationshipCount,
    persisted: report.persistedRelationshipCount,
    evidenceLinks: report.evidenceLinkCount,
    featureEvidenceLinks: report.featureEvidenceLinkCount,
    evidenceRows: report.evidenceRowCount,
    mismatches: report.mismatches.length,
    writesPerformedByThisAudit: report.writesPerformedByThisAudit,
  }, null, 2));
} finally {
  await pool.end();
}
