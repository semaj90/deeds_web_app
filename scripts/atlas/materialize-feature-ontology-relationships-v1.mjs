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
import { buildApprovedAliasMap } from './lib/source-ref-namespace-v1.mjs';
import { resolveCanonicalSourceBinding } from './lib/canonical-source-binding-v1.mjs';

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

const observationPath = path.resolve(REPO_ROOT, 'docs/reports/workspace-source-binding-observation.json');
const aliasApprovalPath = path.resolve(REPO_ROOT, 'docs/reports/feature-ontology-explicit-alias-approval-v1.json');
const relationshipApplyPlanPath = path.resolve(REPO_ROOT, 'docs/reports/current-feature-ontology-relationship-apply-plan-v1.json');
const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;

if (apply) {
  const authorization = 'AUTHORIZE NON-PRODUCTION RELATIONSHIP APPLY FOR FROZEN 8-RELATIONSHIP PLAN';
  if (process.env.ATLAS_RELATIONSHIP_APPLY_CONFIRM !== authorization) throw new Error('RELATIONSHIP_APPLY_AUTHORIZATION_REQUIRED');
  if (process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('RELATIONSHIP_APPLY_NON_PRODUCTION_FLAG_REQUIRED');
  const plan = readJson(relationshipApplyPlanPath);
  if (plan?.status !== 'CURRENT_RELATIONSHIP_APPLY_PLAN_READY_FOR_EXPLICIT_AUTHORIZATION' || plan.relationshipCount !== 8) throw new Error('RELATIONSHIP_APPLY_PLAN_NOT_FROZEN_OR_EXPECTED');
}

try {
  const result = await pool.query(
    `SELECT t.id, t.packet_key, t.source_ref, t.feature_key, t.subject_type, t.subject_id,
            t.predicate, t.object_type, t.object_id, t.confidence, t.ontology_version,
            t.extractor_version, t.evidence, p.feature_id, p.feature_label, p.domain_class,
            gf.workspace_revision
       FROM feature_ontology_tuples t
       LEFT JOIN atlas_packets p USING (packet_key)
       LEFT JOIN (
         SELECT source_ref, max(workspace_revision) AS workspace_revision
           FROM graphify_files
          WHERE workspace_revision IS NOT NULL
          GROUP BY source_ref
         HAVING count(DISTINCT workspace_revision) = 1
       ) gf ON gf.source_ref = t.source_ref
      WHERE t.predicate = $1
      ORDER BY t.id
      LIMIT $2`,
    [PREVIEW_PREDICATE, limit],
  );
  const observation = readJson(observationPath);
  const currentWorkspaceRevision = observation?.record?.workspaceRevision ?? observation?.workspaceRevision ?? null;
  const approvedAliases = buildApprovedAliasMap(readJson(aliasApprovalPath)?.approvedPairs ?? []);
  const graphify = await pool.query(
    `SELECT source_ref, workspace_revision, code_source_revision, source_revision, content_hash,
            ARRAY['docs/reports/workspace-source-binding-observation.json']::text[] AS evidence_refs
       FROM public.graphify_files
      WHERE workspace_revision = $1
      ORDER BY source_ref, code_source_revision NULLS LAST, content_hash NULLS LAST`,
    [currentWorkspaceRevision],
  );
  const bindingResults = result.rows.map((row) => resolveCanonicalSourceBinding({
    packetSourceRef: row.source_ref,
    currentWorkspaceRevision,
    observations: graphify.rows.map((candidate) => ({
      sourceRef: candidate.source_ref,
      workspaceRevision: candidate.workspace_revision,
      sourceRevision: candidate.code_source_revision ?? candidate.source_revision,
      contentDigest: candidate.content_hash,
      evidenceRefs: candidate.evidence_refs,
    })),
    approvedAliases,
    evidenceRefs: [`feature_ontology_tuples:${row.id}`],
  }));
  const bindingByTuple = new Map(result.rows.map((row, index) => [String(row.id), bindingResults[index]]));
  const admittedRows = result.rows
    .filter((row) => bindingByTuple.get(String(row.id))?.canonicalAuthority === true)
    .map((row) => {
      const binding = bindingByTuple.get(String(row.id));
      return {
        ...row,
        legacy_source_ref: row.source_ref,
        source_ref: binding.canonicalSourceRef,
        canonical_source_revision: binding.sourceRevision,
        workspace_revision: binding.workspaceRevision,
        source_content_hash: binding.contentDigest,
        canonical_binding_checksum: binding.checksum,
      };
    });
  const bindingRejected = result.rows
    .filter((row) => bindingByTuple.get(String(row.id))?.canonicalAuthority !== true)
    .map((row) => ({ tuple_id: String(row.id), reason: `CANONICAL_SOURCE_BINDING_${bindingByTuple.get(String(row.id))?.classification ?? 'UNRESOLVED'}`, binding: bindingByTuple.get(String(row.id)) }));
  const { relationships, rejected } = previewFeatureOntologyRelationships(admittedRows);
  const relationshipByTuple = new Map(relationships.map((relationship) => [relationship.metadata.source_tuple_id, relationship]));
  const features = [...new Map(admittedRows.filter((row) => row.feature_id).map((row) => [row.feature_id, featureSchema.parse({
    schema: 'atlas.feature.v1',
    feature_id: row.feature_id,
    feature_key: row.feature_key,
    feature_label: row.feature_label ?? row.feature_key,
    domain: row.domain_class ?? 'unclassified',
    feature_revision: `ontology:${row.ontology_version}:${row.extractor_version}`,
    producer_revision: PREVIEW_REVISION,
    created_from_evidence: [`feature_ontology_tuples:${row.id}`],
  })])).values()];
  const evidence = admittedRows.map((row) => {
    const canonicalSourceRevision = String(row.canonical_source_revision ?? '').trim();
    if (!canonicalSourceRevision.startsWith('sha256:')) {
      throw new Error(`FEATURE_RELATIONSHIP_MATERIALIZATION_MISSING_CANONICAL_SOURCE_REVISION:${row.id}`);
    }
    return featureEvidenceSchema.parse({
    schema: 'atlas.feature-evidence.v1',
    evidence_id: `feature_ontology_tuples:${row.id}`,
    feature_id: row.feature_id ?? row.subject_id,
    evidence_kind: 'ontology_tuple',
    relation_type: row.predicate,
    source_ref: row.source_ref,
    source_revision: canonicalSourceRevision,
    evidence_revision: PREVIEW_REVISION,
    producer_revision: PREVIEW_REVISION,
    confidence: Number(row.confidence),
    // The FI evidence FK points to atlas_relationships. Insert the evidence
    // header/link first, persist relationships second, then fill this FK.
    relationship_id: null,
    payload: {
      ...(row.evidence ?? {}),
      workspace_revision: row.workspace_revision,
      source_content_hash: row.source_content_hash,
      legacy_source_ref: row.legacy_source_ref,
      canonical_binding_checksum: row.canonical_binding_checksum,
    },
    });
  });
  const evidencePreview = admittedRows.map((row) => previewFeatureOntologyEvidence(row));
  const report = {
    schema: 'atlas.feature-ontology-relationship-materialization.v1',
    mode: apply ? 'apply' : 'dry-run',
    canonical_writes: false,
    source_table: 'feature_ontology_tuples',
    predicate: PREVIEW_PREDICATE,
    producer_revision: PREVIEW_REVISION,
    limit,
    tuples_seen: result.rows.length,
    tuples_admitted_by_canonical_binding: admittedRows.length,
    features_prepared: features.length,
    evidence_prepared: evidence.length,
    relationships_prepared: relationships.length,
    rejected: rejected.length + bindingRejected.length,
    rejected_rows: [...bindingRejected, ...rejected],
    canonical_binding: {
      workspace_revision: currentWorkspaceRevision,
      graphify_observations: graphify.rows.length,
      accepted: bindingResults.filter((row) => row.canonicalAuthority).length,
      rejected: bindingRejected.length,
      by_classification: Object.fromEntries([...new Set(bindingResults.map((row) => row.classification))].sort().map((classification) => [classification, bindingResults.filter((row) => row.classification === classification).length])),
    },
    apply_order: ['atlas_fi_features', 'atlas_evidence + atlas_fi_evidence without relationship_id', 'atlas_relationships + members + evidence', 'update atlas_fi_evidence.relationship_id'],
    evidence_ids: evidencePreview.map((item) => item.evidence_id),
    prepared_relationships: relationships,
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
    for (const row of admittedRows) {
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
