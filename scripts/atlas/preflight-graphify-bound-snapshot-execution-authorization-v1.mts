#!/usr/bin/env node

/**
 * GRAPHIFY-BOUND-SNAPSHOT-EXECUTION-AUTHORIZATION-01
 *
 * Read-only authorization preflight. This script never opens graphify_runs,
 * never opens graphify_executions, never starts Graphify, and never mutates a
 * projection. It exists to prevent source/tournament authority from being
 * mistaken for execution authority.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ADMISSION_PATH = path.resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const CONSUMPTION_PATH = path.resolve(ROOT, 'docs/reports/graphify-admitted-snapshot-consumption-v1.json');
const REPORT_PATH = path.resolve(ROOT, 'docs/reports/graphify-bound-snapshot-execution-authorization-v1.json');

const blockers: string[] = [];
let admission: Record<string, any> | null = null;
let consumption: Record<string, any> | null = null;

if (!existsSync(ADMISSION_PATH)) blockers.push('WORKSPACE_REVISION_ADMISSION_RECEIPT_MISSING');
else {
  try { admission = JSON.parse(readFileSync(ADMISSION_PATH, 'utf8')); }
  catch { blockers.push('WORKSPACE_REVISION_ADMISSION_RECEIPT_UNREADABLE'); }
}

if (!existsSync(CONSUMPTION_PATH)) blockers.push('ADMITTED_SNAPSHOT_CONSUMPTION_RECEIPT_MISSING');
else {
  try { consumption = JSON.parse(readFileSync(CONSUMPTION_PATH, 'utf8')); }
  catch { blockers.push('ADMITTED_SNAPSHOT_CONSUMPTION_RECEIPT_UNREADABLE'); }
}

if (admission) {
  if (admission.schema !== 'atlas.workspace-revision-tournament-admission.v1') blockers.push('ADMISSION_SCHEMA_INVALID');
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED') blockers.push('WORKSPACE_REVISION_NOT_ADMITTED');
  if (admission.authority !== true) blockers.push('WORKSPACE_SOURCE_AUTHORITY_NOT_PROVEN');
  if (admission.graphifyExecutionAuthorized !== true) blockers.push('GRAPHIFY_EXECUTION_NOT_AUTHORIZED');
  if (admission.projectionWritesAuthorized === true) blockers.push('PROJECTION_WRITES_MUST_REMAIN_SEPARATE_FROM_EXECUTION_AUTHORIZATION');
}

if (consumption) {
  if (consumption.schema !== 'atlas.graphify-admitted-snapshot-consumption.v1') blockers.push('CONSUMPTION_SCHEMA_INVALID');
  if (![
    'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_READY_NOT_AUTHORIZED',
    'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_READY_AUTHORIZED',
  ].includes(consumption.status)) blockers.push('ADMITTED_SNAPSHOT_CONSUMPTION_NOT_READY');
  if (consumption.proofLevel !== 'CONTRACT_AND_BYTES_PROVEN') blockers.push('MATERIALIZED_ROOT_BYTES_NOT_PROVEN');
  if (consumption.authority !== false || consumption.canonicalAuthority !== false) blockers.push('CONSUMPTION_RECEIPT_UNEXPECTED_AUTHORITY_CLAIM');
  if (consumption.writesPerformed !== false) blockers.push('CONSUMPTION_RECEIPT_WRITE_CLAIM_INVALID');
}

if (admission && consumption) {
  if (admission.workspaceRevision !== consumption.workspaceRevision) blockers.push('WORKSPACE_REVISION_CROSS_RECEIPT_MISMATCH');
  if (admission.snapshotRevision !== consumption.snapshotRevision) blockers.push('SNAPSHOT_REVISION_CROSS_RECEIPT_MISMATCH');
  if (Number(admission.sourceCount) !== Number(consumption.sourceCount)) blockers.push('SOURCE_COUNT_CROSS_RECEIPT_MISMATCH');
  if (admission.sourceSelectionChecksum !== consumption.checksums?.admissionSourceSelectionChecksum) {
    blockers.push('SOURCE_SELECTION_CHECKSUM_CROSS_RECEIPT_MISMATCH');
  }
  if (consumption.exactByteMatches !== consumption.sourceCount) blockers.push('MATERIALIZED_BYTE_READBACK_INCOMPLETE');
  if (consumption.repositoryQualifiedBindingCount !== consumption.sourceCount) blockers.push('REPOSITORY_QUALIFIED_BINDING_COUNT_INCOMPLETE');
}

const uniqueBlockers = [...new Set(blockers)];
const authorized = uniqueBlockers.length === 0;
const report = {
  schema: 'atlas.graphify-bound-snapshot-execution-authorization.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EXECUTION_AUTHORIZATION_PREFLIGHT',
  status: authorized
    ? 'GRAPHIFY_BOUND_SNAPSHOT_EXECUTION_AUTHORIZED_READY_TO_OPEN'
    : uniqueBlockers.includes('GRAPHIFY_EXECUTION_NOT_AUTHORIZED') && uniqueBlockers.length === 1
      ? 'GRAPHIFY_BOUND_SNAPSHOT_EXECUTION_READY_NOT_AUTHORIZED'
      : 'GRAPHIFY_BOUND_SNAPSHOT_EXECUTION_BLOCKED',
  proofLevel: authorized ? 'AUTHORIZATION_AND_INPUTS_PROVEN' : 'BLOCKED',
  authority: false,
  canonicalAuthority: false,
  graphifyExecutionAuthorized: authorized,
  projectionWritesAuthorized: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  graphWritesPerformed: false,
  qdrantWritesPerformed: false,
  cacheWritesPerformed: false,
  modelWritesPerformed: false,
  admissionPath: ADMISSION_PATH,
  consumptionPath: CONSUMPTION_PATH,
  workspaceRevision: admission?.workspaceRevision ?? null,
  snapshotRevision: admission?.snapshotRevision ?? null,
  sourceCount: admission?.sourceCount ?? null,
  materializedRoot: consumption?.materializedRoot ?? null,
  exactByteMatches: consumption?.exactByteMatches ?? null,
  repositoryQualifiedBindingCount: consumption?.repositoryQualifiedBindingCount ?? null,
  blockers: uniqueBlockers,
  firstBlockingInvariant: uniqueBlockers[0] ?? null,
  invariants: {
    sourceAuthorityDoesNotImplyExecutionAuthority: true,
    executionAuthorityDoesNotImplyProjectionAuthority: true,
    lifecycleOpenNotCalled: true,
    graphifyExecutionsNotOpened: true,
    graphifyRunsNotOpened: true,
    liveOriginInventoryNotRecomputed: true,
    noRevisionSynthesized: true,
  },
  nextGate: authorized
    ? 'GRAPHIFY-BOUND-SNAPSHOT-EXECUTION-OPEN-01'
    : uniqueBlockers.includes('GRAPHIFY_EXECUTION_NOT_AUTHORIZED')
      ? 'EXPLICIT-GRAPHIFY-BOUND-SNAPSHOT-EXECUTION-AUTHORIZATION-01'
      : 'REPAIR_BOUND_SNAPSHOT_EXECUTION_PREFLIGHT',
  safeNextCommand: 'npx tsx scripts/atlas/preflight-graphify-bound-snapshot-execution-authorization-v1.mts',
  producerRevision: 'atlas.graphify-bound-snapshot-execution-authorization.v1',
};

mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  proofLevel: report.proofLevel,
  workspaceRevision: report.workspaceRevision,
  snapshotRevision: report.snapshotRevision,
  sourceCount: report.sourceCount,
  firstBlockingInvariant: report.firstBlockingInvariant,
  nextGate: report.nextGate,
  writesPerformed: false,
  reportPath: REPORT_PATH,
}, null, 2));

if (!authorized) process.exitCode = 3;
