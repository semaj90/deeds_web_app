#!/usr/bin/env tsx

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphifyCanaryExpectationV1 } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graphify-canary-expectation-v1.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/graphify-canary-expectation-v1.json');

const admission = JSON.parse(readFileSync(ADMISSION, 'utf8')) as Record<string, unknown>;
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('GRAPHIFY_CANARY_EXPECTATION_REQUIRES_ADMITTED_WORKSPACE_AUTHORITY');
}
if (admission.graphifyExecutionAuthorized !== false) {
  throw new Error('GRAPHIFY_CANARY_EXPECTATION_REQUIRES_EXECUTION_TO_REMAIN_UNAUTHORIZED');
}
if (admission.projectionWritesAuthorized !== false) {
  throw new Error('GRAPHIFY_CANARY_EXPECTATION_REQUIRES_PROJECTION_WRITES_TO_REMAIN_UNAUTHORIZED');
}

const expectation = buildGraphifyCanaryExpectationV1({
  workspaceRevision: String(admission.workspaceRevision ?? ''),
  snapshotRevision: String(admission.snapshotRevision ?? ''),
  sourceSelectionChecksum: String(admission.sourceSelectionChecksum ?? ''),
  sourceCount: Number(admission.sourceCount ?? 0),
});

const report = {
  ...expectation,
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EXPECTATION_DERIVATION',
  admissionReceiptPath: 'docs/reports/workspace-revision-tournament-admission-v1.json',
  writesPerformed: false,
  datastoreWritesPerformed: false,
  nextGate: 'SNAPSHOT-BOUND-GRAPHIFY-CANARY-01',
};

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  schema: report.schema,
  workspaceRevision: report.workspaceRevision,
  snapshotRevision: report.snapshotRevision,
  sourceCount: report.sourceCount,
  identityChecksum: report.identityChecksum,
  graphifyExecutionAuthorized: report.graphifyExecutionAuthorized,
  canonicalWritesAuthorized: report.canonicalWritesAuthorized,
  writesPerformed: false,
  report: REPORT,
}, null, 2));
