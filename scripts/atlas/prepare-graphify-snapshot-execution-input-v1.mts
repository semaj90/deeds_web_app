#!/usr/bin/env node

/**
 * SNAPSHOT-BOUND-GRAPHIFY-CONSUMPTION-01
 *
 * Read-only derivation of GraphifySnapshotExecutionInputV1 from already-proven
 * admission + consumption receipts. This script never discovers live files,
 * never recomputes workspaceRevision, never reads HEAD, and never opens an
 * execution. It writes only a local derived report.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GRAPHIFY_SNAPSHOT_EXECUTION_INPUT_V1,
  validateGraphifySnapshotExecutionInputV1,
} from './lib/graphify-snapshot-execution-input-v1.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ADMISSION_REF = 'docs/reports/workspace-revision-tournament-admission-v1.json';
const ADMISSION_PATH = path.resolve(ROOT, ADMISSION_REF);
const CONSUMPTION_PATH = path.resolve(ROOT, 'docs/reports/graphify-admitted-snapshot-consumption-v1.json');
const REPORT_PATH = path.resolve(ROOT, 'docs/reports/graphify-snapshot-execution-input-v1.json');

const blockers: string[] = [];
let admission: Record<string, any> | null = null;
let consumption: Record<string, any> | null = null;
let snapshot: Record<string, any> | null = null;

function readJson(file: string, missing: string, unreadable: string): Record<string, any> | null {
  if (!existsSync(file)) {
    blockers.push(missing);
    return null;
  }
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { blockers.push(unreadable); return null; }
}

admission = readJson(ADMISSION_PATH, 'ADMISSION_RECEIPT_MISSING', 'ADMISSION_RECEIPT_UNREADABLE');
consumption = readJson(CONSUMPTION_PATH, 'CONSUMPTION_RECEIPT_MISSING', 'CONSUMPTION_RECEIPT_UNREADABLE');

if (admission) {
  if (admission.schema !== 'atlas.workspace-revision-tournament-admission.v1') blockers.push('ADMISSION_SCHEMA_INVALID');
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED') blockers.push('WORKSPACE_REVISION_NOT_ADMITTED');
  if (admission.authority !== true) blockers.push('WORKSPACE_SOURCE_AUTHORITY_NOT_PROVEN');
  if (admission.projectionWritesAuthorized === true) blockers.push('PROJECTION_WRITES_MUST_REMAIN_SEPARATE');
}

if (consumption) {
  if (consumption.schema !== 'atlas.graphify-admitted-snapshot-consumption.v1') blockers.push('CONSUMPTION_SCHEMA_INVALID');
  if (![
    'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_READY_NOT_AUTHORIZED',
    'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_READY_AUTHORIZED',
  ].includes(consumption.status)) blockers.push('ADMITTED_SNAPSHOT_CONSUMPTION_NOT_READY');
  if (consumption.proofLevel !== 'CONTRACT_AND_BYTES_PROVEN') blockers.push('MATERIALIZED_BYTES_NOT_PROVEN');
  if (consumption.exactByteMatches !== consumption.sourceCount) blockers.push('MATERIALIZED_BYTE_COUNT_MISMATCH');
  if (consumption.repositoryQualifiedBindingCount !== consumption.sourceCount) blockers.push('REPOSITORY_QUALIFIED_BINDINGS_INCOMPLETE');
}

if (admission && consumption) {
  if (admission.workspaceRevision !== consumption.workspaceRevision) blockers.push('WORKSPACE_REVISION_CROSS_RECEIPT_MISMATCH');
  if (admission.snapshotRevision !== consumption.snapshotRevision) blockers.push('SNAPSHOT_REVISION_CROSS_RECEIPT_MISMATCH');
  if (Number(admission.sourceCount) !== Number(consumption.sourceCount)) blockers.push('SOURCE_COUNT_CROSS_RECEIPT_MISMATCH');

  const snapshotPath = typeof consumption.snapshotPath === 'string' ? consumption.snapshotPath : null;
  if (!snapshotPath) blockers.push('CONSUMPTION_SNAPSHOT_PATH_MISSING');
  else snapshot = readJson(snapshotPath, 'ADMITTED_SNAPSHOT_MISSING', 'ADMITTED_SNAPSHOT_UNREADABLE');
}

if (snapshot && admission) {
  if (snapshot.snapshotRevision !== admission.snapshotRevision) blockers.push('SNAPSHOT_REVISION_ADMISSION_MISMATCH');
  if (snapshot.sourceMembershipChecksum !== admission.sourceSelectionChecksum) blockers.push('SELECTION_CHECKSUM_ADMISSION_MISMATCH');
  if (!/^sha256:[a-f0-9]{64}$/i.test(String(snapshot.sourceContentChecksum ?? ''))) blockers.push('SOURCE_COHORT_CHECKSUM_MISSING_OR_INVALID');
}

let validation = validateGraphifySnapshotExecutionInputV1({});
if (admission && consumption && snapshot) {
  validation = validateGraphifySnapshotExecutionInputV1({
    workspaceRevision: admission.workspaceRevision,
    snapshotRevision: admission.snapshotRevision,
    materializedRoot: consumption.materializedRoot,
    sourceCount: admission.sourceCount,
    repositoryCount: consumption.repositoryCount,
    sourceCohortChecksum: snapshot.sourceContentChecksum,
    selectionChecksum: admission.sourceSelectionChecksum,
    admissionReceiptRef: ADMISSION_REF,
  });
  blockers.push(...validation.blockers);
}

const uniqueBlockers = [...new Set(blockers)];
const ready = uniqueBlockers.length === 0 && validation.valid && validation.input !== null;
const report = {
  schema: GRAPHIFY_SNAPSHOT_EXECUTION_INPUT_V1,
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EXECUTION_INPUT_DERIVATION',
  status: ready ? 'GRAPHIFY_SNAPSHOT_EXECUTION_INPUT_READY_NOT_EXECUTED' : 'GRAPHIFY_SNAPSHOT_EXECUTION_INPUT_BLOCKED',
  proofLevel: ready ? 'CONTRACT_PROVEN' : 'BLOCKED',
  authority: false,
  canonicalAuthority: false,
  graphifyExecutionAuthorized: admission?.graphifyExecutionAuthorized === true,
  projectionWritesAuthorized: false,
  executionInput: validation.input,
  derivation: {
    workspaceRevisionSource: ADMISSION_REF,
    snapshotRevisionSource: ADMISSION_REF,
    materializedRootSource: 'docs/reports/graphify-admitted-snapshot-consumption-v1.json',
    sourceCountSource: ADMISSION_REF,
    repositoryCountSource: 'docs/reports/graphify-admitted-snapshot-consumption-v1.json',
    sourceCohortChecksumSource: 'WorkspaceSnapshotV1.sourceContentChecksum',
    selectionChecksumSource: 'workspace-revision-tournament-admission-v1.sourceSelectionChecksum',
    admissionReceiptRef: ADMISSION_REF,
  },
  forbiddenSubstitutions: [
    'CURRENT_WORKSPACE_INVENTORY',
    'CURRENT_HEAD',
    'LIVE_REPOSITORY_DISCOVERY',
    'WORKSPACE_REVISION_RECOMPUTATION',
    'REPOSITORY_EXPANSION',
    'PATH_ONLY_CANONICAL_IDENTITY',
  ],
  writesPerformed: false,
  datastoreWritesPerformed: false,
  graphWritesPerformed: false,
  qdrantWritesPerformed: false,
  cacheWritesPerformed: false,
  modelWritesPerformed: false,
  blockers: uniqueBlockers,
  firstBlockingInvariant: uniqueBlockers[0] ?? null,
  nextGate: ready
    ? 'GRAPHIFY-BOUND-SNAPSHOT-EXECUTION-AUTHORIZATION-01'
    : 'REPAIR_GRAPHIFY_SNAPSHOT_EXECUTION_INPUT',
  safeNextCommand: 'npx tsx scripts/atlas/preflight-graphify-bound-snapshot-execution-authorization-v1.mts',
};

mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  proofLevel: report.proofLevel,
  graphifyExecutionAuthorized: report.graphifyExecutionAuthorized,
  executionInput: report.executionInput,
  firstBlockingInvariant: report.firstBlockingInvariant,
  nextGate: report.nextGate,
  writesPerformed: false,
  reportPath: REPORT_PATH,
}, null, 2));

if (!ready) process.exitCode = 3;
