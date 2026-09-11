#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGraphifyCanaryExpectationV1 } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graphify-canary-expectation-v1.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const EXPECTATION = resolve(ROOT, 'docs/reports/graphify-canary-expectation-v1.json');

const admission = JSON.parse(readFileSync(ADMISSION, 'utf8')) as Record<string, unknown>;
const expectation = JSON.parse(readFileSync(EXPECTATION, 'utf8')) as Record<string, unknown>;

const checks = {
  schemaValidAndChecksumMatches: verifyGraphifyCanaryExpectationV1(expectation as never),
  workspaceRevisionMatchesAdmission: expectation.workspaceRevision === admission.workspaceRevision,
  snapshotRevisionMatchesAdmission: expectation.snapshotRevision === admission.snapshotRevision,
  sourceSelectionChecksumMatchesAdmission: expectation.sourceSelectionChecksum === admission.sourceSelectionChecksum,
  sourceCountMatchesAdmission: expectation.sourceCount === admission.sourceCount,
  workspaceAndSnapshotAreDistinct: expectation.workspaceRevision !== expectation.snapshotRevision,
  graphifyExecutionStillUnauthorized: expectation.graphifyExecutionAuthorized === false
    && admission.graphifyExecutionAuthorized === false,
  canonicalWritesStillUnauthorized: expectation.canonicalWritesAuthorized === false
    && admission.projectionWritesAuthorized === false,
  noAuthorityClaim: expectation.authority === false,
};

const violations = Object.entries(checks)
  .filter(([, passed]) => passed !== true)
  .map(([name]) => name);

const status = violations.length === 0
  ? 'GRAPHIFY_CANARY_EXPECTATION_PROVEN_READ_ONLY'
  : 'GRAPHIFY_CANARY_EXPECTATION_BLOCKED';

console.log(JSON.stringify({
  schema: 'atlas.graphify-canary-expectation-audit.v1',
  status,
  mode: 'READ_ONLY',
  checks,
  violations,
  workspaceRevision: expectation.workspaceRevision ?? null,
  snapshotRevision: expectation.snapshotRevision ?? null,
  sourceSelectionChecksum: expectation.sourceSelectionChecksum ?? null,
  sourceCount: expectation.sourceCount ?? null,
  identityChecksum: expectation.identityChecksum ?? null,
  graphifyExecutionAuthorized: false,
  canonicalWritesAuthorized: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  nextGate: 'SNAPSHOT-BOUND-GRAPHIFY-CANARY-01',
}, null, 2));

if (violations.length > 0) process.exitCode = 1;
