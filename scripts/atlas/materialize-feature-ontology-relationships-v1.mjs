import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { createFeatureIntelligenceRepository } from '../../packages/parent-atlas/dist/core/feature-intelligence-repository.js';
import {
  featureEvidenceSchema,
  featureSchema,
} from '../../packages/parent-atlas/dist/core/feature-intelligence.js';
import {
  PREVIEW_PREDICATE,
  PREVIEW_REVISION,
  previewFeatureOntologyEvidence,
  previewFeatureOntologyRelationships,
} from './lib/feature-ontology-relationship-preview-v1.mjs';

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((value) => value.startsWith('--limit='));
const limit = Math.max(1, Math.min(Number(limitArg?.slice(8) ?? 603), 5000));
const reportPath = path.resolve(REPO_ROOT, 'docs/reports/feature-ontology-relationship-materialization-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 2,
  connectionTimeoutMillis: 5000,
  query_timeout: 30000,
});

try {
  const result = await pool.query(
    `SELECT t.id, t.packet_key, t.source_ref, t.feature_key, t.subject_type, t.subject_id,
            t.predicate, t.object_type, t.object_id, t.confidence, t.ontology_version,
            t.extractor_version, t.evidence, p.feature_id, p.feature_label, p.domain_class,
            p.workspace_revision
       FROM feature_ontology_tuples t
       LEFT JOIN atlas_packets p USING (packet_key)
      WHERE t.predicate = $1
      ORDER BY t.id
      LIMIT $2`,
    [PREVIEW_PREDICATE, limit],
  );
  const { relationships, rejected } = previewFeatureOntologyRelationships(result.rows);
  const relationshipByTuple = new Map(relationships.map((relationship) => [relationship.metadata.source_tuple_id, relationship]));
  const features = [...new Map(result.rows.filter((row) => row.feature_id).map((row) => [row.feature_id, featureSchema.parse({
    schema: 'atlas.feature.v1',
    feature_id: row.feature_id,
    feature_key: row.feature_key,
    feature_label: row.feature_label ?? row.feature_key,
    domain: row.domain_class ?? 'unclassified',
    feature_revision: `ontology:${row.ontology_version}:${row.extractor_version}`,
    producer_revision: PREVIEW_REVISION,
    created_from_evidence: [`feature_ontology_tuples:${row.id}`],
  })])).values()];
  const evidence = result.rows.map((row) => featureEvidenceSchema.parse({
    schema: 'atlas.feature-evidence.v1',
    evidence_id: `feature_ontology_tuples:${row.id}`,
    feature_id: row.feature_id ?? row.subject_id,
    evidence_kind: 'ontology_tuple',
    relation_type: row.predicate,
    source_ref: row.source_ref,
    source_revision: `ontology:${row.ontology_version}:${row.extractor_version}`,
    evidence_revision: PREVIEW_REVISION,
    producer_revision: PREVIEW_REVISION,
    confidence: Number(row.confidence),
    // The FI evidence FK points to atlas_relationships. Insert the evidence
    // header/link first, persist relationships second, then fill this FK.
    relationship_id: null,
    payload: row.evidence ?? {},
  }));
  const evidencePreview = result.rows.map((row) => previewFeatureOntologyEvidence(row));
  const report = {
    schema: 'atlas.feature-ontology-relationship-materialization.v1',
    mode: apply ? 'apply' : 'dry-run',
    canonical_writes: false,
    source_table: 'feature_ontology_tuples',
    predicate: PREVIEW_PREDICATE,
    producer_revision: PREVIEW_REVISION,
    limit,
    tuples_seen: result.rows.length,
    features_prepared: features.length,
    evidence_prepared: evidence.length,
    relationships_prepared: relationships.length,
    rejected: rejected.length,
    rejected_rows: rejected,
    apply_order: ['atlas_fi_features', 'atlas_evidence + atlas_fi_evidence without relationship_id', 'atlas_relationships + members + evidence', 'update atlas_fi_evidence.relationship_id'],
    evidence_ids: evidencePreview.map((item) => item.evidence_id),
  };

  if (apply) {
    const repository = createFeatureIntelligenceRepository(pool);
    for (const feature of features) await repository.upsertFeature(feature);
    for (const item of evidence) await repository.insertEvidence(item);
    for (const relationship of relationships) {
      await repository.persistRelationship({
        ...relationship,
        metadata: { ...relationship.metadata, preview_only: false, materialized_from_preview: true },
      });
    }
    for (const row of result.rows) {
      const relationship = relationshipByTuple.get(String(row.id));
      if (!relationship || !row.feature_id) continue;
      await pool.query(
        `UPDATE atlas_fi_evidence
            SET relationship_id = $1
          WHERE evidence_id = $2 AND feature_id = $3 AND relation_type = $4`,
        [relationship.relationship_id, `feature_ontology_tuples:${row.id}`, row.feature_id, row.predicate],
      );
    }
    report.canonical_writes = true;
    report.status = 'APPLY_COMPLETE';
  } else {
    report.status = 'DRY_RUN_READY_FOR_REVIEW';
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    reportPath: path.relative(REPO_ROOT, reportPath),
    canonical_writes: report.canonical_writes,
    tuples_seen: report.tuples_seen,
    features_prepared: report.features_prepared,
    evidence_prepared: report.evidence_prepared,
    relationships_prepared: report.relationships_prepared,
    rejected: report.rejected,
  }, null, 2));
} finally {
  await pool.end();
}
