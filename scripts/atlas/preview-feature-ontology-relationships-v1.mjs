import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import {
  PREVIEW_PREDICATE,
  PREVIEW_REVISION,
  previewFeatureOntologyEvidence,
  previewFeatureOntologyRelationships,
} from './lib/feature-ontology-relationship-preview-v1.mjs';

const limitArg = process.argv.find((value) => value.startsWith('--limit='));
const limit = Math.max(1, Math.min(Number(limitArg?.slice(8) ?? 603), 5000));
const reportPath = path.resolve(REPO_ROOT, 'docs/reports/feature-ontology-relationship-preview-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  query_timeout: 15000,
});

try {
  const result = await pool.query(
    `SELECT t.id, t.packet_key, t.source_ref, t.feature_key, t.subject_type, t.subject_id,
            t.predicate, t.object_type, t.object_id, t.confidence, t.ontology_version,
            t.extractor_version, p.feature_id, p.feature_label, p.domain_class
       FROM feature_ontology_tuples t
       LEFT JOIN atlas_packets p USING (packet_key)
      WHERE t.predicate = $1
      ORDER BY t.id
      LIMIT $2`,
    [PREVIEW_PREDICATE, limit],
  );
  const { relationships, rejected } = previewFeatureOntologyRelationships(result.rows);
  const evidencePreview = result.rows.map((row) => previewFeatureOntologyEvidence(row));
  const evidence = await pool.query(
    `SELECT count(*)::bigint AS available
       FROM feature_ontology_tuples t
       JOIN atlas_evidence e ON e.evidence_id = 'feature_ontology_tuples:' || t.id::text
      WHERE t.predicate = $1
        AND t.id IN (SELECT id FROM feature_ontology_tuples WHERE predicate = $1 ORDER BY id LIMIT $2)`,
    [PREVIEW_PREDICATE, limit],
  );
  const featureIds = new Set(result.rows.map((row) => row.feature_id).filter(Boolean));
  const featureHeaders = [...new Map(result.rows.filter((row) => row.feature_id).map((row) => [row.feature_id, {
    feature_id: row.feature_id,
    feature_key: row.feature_key,
    feature_label: row.feature_label,
    domain: row.domain_class,
    source_ref: row.source_ref,
    source_revision: `ontology:${row.ontology_version}:${row.extractor_version}`,
    producer_revision: PREVIEW_REVISION,
  }])).values()];
  const report = {
    schema: 'atlas.feature-ontology-relationship-preview.v1',
    status: rejected.length === 0 ? 'READ_ONLY_PREVIEW_COMPLETE' : 'READ_ONLY_PREVIEW_WITH_REJECTIONS',
    canonical_writes: false,
    source_table: 'feature_ontology_tuples',
    predicate: PREVIEW_PREDICATE,
    producer_revision: PREVIEW_REVISION,
    limit,
    tuples_seen: result.rows.length,
    relationships_previewed: relationships.length,
    rejected: rejected.length,
    feature_ids_previewed: featureIds.size,
    feature_headers_previewed: featureHeaders.length,
    evidence_previewed: evidencePreview.length,
    matching_atlas_evidence_rows: Number(evidence.rows[0]?.available ?? 0),
    evidence_materialization_required: true,
    rejected_rows: rejected,
    relationship_ids_are_preview_only: true,
    feature_headers: featureHeaders,
    evidence_sample: evidencePreview.slice(0, 10),
    sample: relationships.slice(0, 10),
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    reportPath: path.relative(REPO_ROOT, reportPath),
    canonical_writes: false,
    tuples_seen: report.tuples_seen,
    relationships_previewed: report.relationships_previewed,
    rejected: report.rejected,
  }, null, 2));
} finally {
  await pool.end();
}
