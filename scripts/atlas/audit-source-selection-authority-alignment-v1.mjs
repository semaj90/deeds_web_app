#!/usr/bin/env node

/** Compare source-selection artifacts without authorizing or performing writes. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const batch = read('docs/reports/current-source-graphify-batch-plan-v1.json');
const registry = read('docs/reports/current-source-registry-reconciliation-plan-v1.json');
const projection = read('docs/reports/current-source-projection-cohort-v1.json');
const lineage = read('docs/reports/current-source-cohort-lineage-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const batchRows = new Map((batch.records ?? []).map((row) => [String(row.sourceRef).replaceAll('\\', '/').toLowerCase(), row]));
const projectionRows = projection.cohort ?? [];
const projectionByRef = new Map(projectionRows.map((row) => [String(row.relativePath).replaceAll('\\', '/').toLowerCase(), row]));
const sharedRefs = [...batchRows.keys()].filter((ref) => projectionByRef.has(ref));
const revisionMismatches = sharedRefs.filter((ref) => batchRows.get(ref).workspaceRevision !== projectionByRef.get(ref).workspaceRevision);
const reportBody = {
  schema: 'atlas.source-selection-authority-alignment.v1',
  status: registry.selectedSourceCount === 0 || revisionMismatches.length > 0 ? 'BLOCKED_AUTHORITY_ALIGNMENT' : 'READY_FOR_REVIEW',
  readOnly: true,
  artifacts: {
    batchPlan: { path: 'docs/reports/current-source-graphify-batch-plan-v1.json', status: batch.status, selectedSourceCount: batch.selectedSourceCount, workspaceRevision: batch.workspaceRevision, selectionChecksum: batch.selectionChecksum },
    registryPlan: { path: 'docs/reports/current-source-registry-reconciliation-plan-v1.json', status: registry.status, selectedSourceCount: registry.selectedSourceCount, selectionChecksum: registry.selectionChecksum },
    projectionCohort: { path: 'docs/reports/current-source-projection-cohort-v1.json', status: projection.status, eligibleCurrentSources: projection.counts?.eligibleCurrentSources ?? 0, cohortChecksum: projection.cohortChecksum },
    lineage: { path: 'docs/reports/current-source-cohort-lineage-v1.json', status: lineage.status, currentWorkspaceMatched: lineage.counts?.currentWorkspaceMatched ?? null, revisionQualified: lineage.counts?.revisionQualified ?? null },
  },
  comparison: {
    batchRows: batch.records?.length ?? 0,
    registryRows: registry.rows?.length ?? 0,
    projectionRows: projectionRows.length,
    sharedRefs: sharedRefs.length,
    workspaceRevisionMismatches: revisionMismatches.length,
    registryAdmissionReady: registry.selectedSourceCount > 0,
  },
  decision: 'DO_NOT_APPLY',
  requiredAction: 'ONE_SOURCE_SELECTION_OWNER_MUST_EMIT_CURRENT_NAMESPACE_SOURCE_REVISION_AND_WORKSPACE_REVISION_SET',
  canonicalAuthority: false,
  writes: { postgres: 0, graphify: 0, qdrant: 0, neo4j: 0, valkey: 0, sourceFiles: 0 },
};
const report = { ...reportBody, reportChecksum: sha256(JSON.stringify(reportBody)) };
const out = path.join(root, 'docs', 'reports', 'source-selection-authority-alignment-v1.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, comparison: report.comparison, decision: report.decision, out }, null, 2));
if (report.status !== 'BLOCKED_AUTHORITY_ALIGNMENT') process.exit(1);
