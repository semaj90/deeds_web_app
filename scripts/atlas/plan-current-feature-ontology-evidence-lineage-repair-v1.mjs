import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO_ROOT } from './connection-config.mjs';

const materializationPath = path.resolve(REPO_ROOT, 'docs/reports/feature-ontology-relationship-materialization-v1.json');
const readbackPath = path.resolve(REPO_ROOT, 'docs/reports/current-feature-ontology-relationship-readback-v1.json');
const outputPath = path.resolve(REPO_ROOT, 'docs/reports/current-feature-ontology-evidence-lineage-repair-plan-v1.json');
const materialization = JSON.parse(fs.readFileSync(materializationPath, 'utf8'));
const readback = JSON.parse(fs.readFileSync(readbackPath, 'utf8'));
const prepared = Array.isArray(materialization.prepared_relationships) ? materialization.prepared_relationships : [];
const relationships = prepared.map((row) => ({
  relationshipId: String(row.relationship_id),
  evidenceId: row.evidence_refs?.[0] ?? null,
  sourceRef: row.source_ref,
  sourceRevision: row.source_revision,
  workspaceRevision: row.metadata?.workspace_revision ?? null,
  legacySourceRef: row.metadata?.legacy_source_ref ?? null,
  sourceTupleId: row.metadata?.source_tuple_id ?? null,
}));
const selectionChecksum = crypto.createHash('sha256')
  .update(JSON.stringify(relationships.map((row) => ({
    relationshipId: row.relationshipId,
    evidenceId: row.evidenceId,
    sourceRef: row.sourceRef,
    sourceRevision: row.sourceRevision,
    workspaceRevision: row.workspaceRevision,
    legacySourceRef: row.legacySourceRef,
    sourceTupleId: row.sourceTupleId,
  })).sort((a, b) => a.relationshipId.localeCompare(b.relationshipId))))
  .digest('hex');

const report = {
  schema: 'atlas.current-feature-ontology-evidence-lineage-repair-plan.v1',
  operation: 'CURRENT_FEATURE_ONTOLOGY_EVIDENCE_LINEAGE_REPAIR',
  generatedAt: new Date().toISOString(),
  sourceMaterializationReport: path.relative(REPO_ROOT, materializationPath),
  sourceReadbackReport: path.relative(REPO_ROOT, readbackPath),
  expectedRelationshipCount: 8,
  preparedRelationshipCount: prepared.length,
  readbackStatus: readback.status,
  selectionChecksum,
  rows: relationships,
  repairFields: [
    'atlas_evidence.source_revision = canonical source revision',
    'atlas_evidence.payload.workspace_revision = current workspace revision',
    'atlas_evidence.payload.source_content_hash = source digest',
    'atlas_evidence.payload.legacy_source_ref preserved',
    'atlas_evidence.payload.canonical_binding_checksum preserved',
  ],
  writes: {
    postgres: false,
    qdrant: false,
    neo4j: false,
    valkey: false,
    tupleRewrites: false,
  },
  authorization: {
    required: true,
    exactPhrase: 'AUTHORIZE NON-PRODUCTION EVIDENCE LINEAGE REPAIR FOR FROZEN 8-ROW PLAN',
    relationshipWritesAuthorized: false,
    graphRevisionAuthorized: false,
  },
  status: prepared.length === 8 && readback.status === 'CURRENT_RELATIONSHIP_APPLY_READBACK_FAILED'
    ? 'EVIDENCE_LINEAGE_REPAIR_PLAN_READY_FOR_EXPLICIT_AUTHORIZATION'
    : 'EVIDENCE_LINEAGE_REPAIR_PLAN_BLOCKED',
  nextGate: 'EXPLICIT_EVIDENCE_LINEAGE_REPAIR_AUTHORIZATION',
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  reportPath: path.relative(REPO_ROOT, outputPath),
  rows: report.rows.length,
  selectionChecksum: report.selectionChecksum,
  postgresWrites: report.writes.postgres,
  authorizationRequired: report.authorization.required,
}, null, 2));
