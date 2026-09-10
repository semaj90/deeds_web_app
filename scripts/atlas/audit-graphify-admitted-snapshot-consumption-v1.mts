#!/usr/bin/env node

/**
 * GRAPHIFY-ADMITTED-SNAPSHOT-CONSUMPTION-01
 *
 * Read-only preflight proving that the already-admitted WorkspaceSnapshotV1 can
 * be consumed from its revision-addressed materialized root without rebuilding
 * live-origin inventory. This script performs NO database, graph, Qdrant, cache,
 * model, or index writes. The only write is its local derived report.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdmittedSnapshotConsumptionPlanV1 } from './lib/admitted-workspace-snapshot-consumer-v1.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ADMISSION_PATH = path.resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT_PATH = path.resolve(ROOT, 'docs/reports/graphify-admitted-snapshot-consumption-v1.json');
const SNAPSHOT_DIR = path.resolve(ROOT, 'docs/reports/workspace-source-snapshots');
const MATERIALIZED_ROOT_BASE = path.resolve(ROOT, '.tmp/workspace-source-snapshots');
const SAMPLE_LIMIT = 100;

function digestBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function bounded<T>(values: readonly T[]) {
  return {
    count: values.length,
    sampleLimit: SAMPLE_LIMIT,
    sample: values.slice(0, SAMPLE_LIMIT),
    truncated: values.length > SAMPLE_LIMIT,
  };
}

function normalizeRelative(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        out.push(`SYMLINK:${normalizeRelative(path.relative(root, absolute))}`);
        continue;
      }
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) out.push(normalizeRelative(path.relative(root, absolute)));
    }
  }
  return out.sort();
}

function resolveInside(root: string, relative: string): string | null {
  if (!relative || relative.split('/').includes('..')) return null;
  const candidate = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate.startsWith(prefix) ? candidate : null;
}

const blockers: string[] = [];
let admission: Record<string, unknown> = {};
let snapshot: Record<string, unknown> = {};
let snapshotPath: string | null = null;
let materializedRoot: string | null = null;
let materializationMarker: Record<string, unknown> | null = null;
let plan = buildAdmittedSnapshotConsumptionPlanV1({ admission, snapshot });

try {
  if (!existsSync(ADMISSION_PATH)) throw new Error('ADMISSION_RECEIPT_MISSING');
  admission = JSON.parse(readFileSync(ADMISSION_PATH, 'utf8'));

  const snapshotRevision = typeof admission.snapshotRevision === 'string' ? admission.snapshotRevision : '';
  if (!/^sha256:[a-f0-9]{64}$/i.test(snapshotRevision)) throw new Error('ADMISSION_SNAPSHOT_REVISION_INVALID');
  const manifestPath = typeof admission.manifestPath === 'string' && admission.manifestPath.trim()
    ? path.resolve(ROOT, admission.manifestPath)
    : path.resolve(SNAPSHOT_DIR, `${snapshotRevision.slice('sha256:'.length)}.json`);
  snapshotPath = manifestPath;
  if (!existsSync(snapshotPath)) throw new Error('ADMITTED_SNAPSHOT_MANIFEST_MISSING');
  snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  plan = buildAdmittedSnapshotConsumptionPlanV1({ admission, snapshot });
  blockers.push(...plan.blockers);

  materializedRoot = path.resolve(MATERIALIZED_ROOT_BASE, snapshotRevision.slice('sha256:'.length));
  if (!existsSync(materializedRoot)) {
    blockers.push('MATERIALIZED_ROOT_MISSING');
  } else {
    const rootStat = lstatSync(materializedRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) blockers.push('MATERIALIZED_ROOT_UNSAFE');
    else materializedRoot = realpathSync(materializedRoot);
  }

  if (materializedRoot && existsSync(materializedRoot)) {
    const markerPath = path.join(materializedRoot, '.materialization.json');
    if (!existsSync(markerPath)) blockers.push('MATERIALIZATION_MARKER_MISSING');
    else {
      try {
        materializationMarker = JSON.parse(readFileSync(markerPath, 'utf8'));
        if (materializationMarker?.schema !== 'atlas.workspace-source-materialization.v1') blockers.push('MATERIALIZATION_MARKER_SCHEMA_INVALID');
        if (materializationMarker?.snapshotRevision !== plan.snapshotRevision) blockers.push('MATERIALIZATION_MARKER_SNAPSHOT_REVISION_MISMATCH');
        if (Number(materializationMarker?.sourceCount) !== plan.sourceCount) blockers.push('MATERIALIZATION_MARKER_SOURCE_COUNT_MISMATCH');
      } catch {
        blockers.push('MATERIALIZATION_MARKER_UNREADABLE');
      }
    }
  }
} catch (error) {
  blockers.push(error instanceof Error ? error.message : String(error));
}

const missingFiles: string[] = [];
const unexpectedFiles: string[] = [];
const digestMismatches: string[] = [];
const byteLengthMismatches: string[] = [];
const unsafeFiles: string[] = [];
const materializedSourceRefs = new Set<string>();
let exactByteMatches = 0;
let materializedFileCount = 0;

if (materializedRoot && existsSync(materializedRoot) && plan.bindings.length) {
  const expected = new Map<string, (typeof plan.bindings)[number]>();
  for (const binding of plan.bindings) {
    const relative = normalizeRelative(binding.sourceRef);
    if (expected.has(relative)) continue; // duplicate path already reported by pure plan
    expected.set(relative, binding);
  }

  const observedFiles = walkFiles(materializedRoot);
  const observedSources = observedFiles.filter((relative) => relative !== '.materialization.json');
  materializedFileCount = observedSources.length;

  for (const relative of observedSources) {
    if (relative.startsWith('SYMLINK:')) {
      unsafeFiles.push(relative.slice('SYMLINK:'.length));
      continue;
    }
    materializedSourceRefs.add(relative);
    if (!expected.has(relative)) unexpectedFiles.push(relative);
  }

  for (const [relative, binding] of expected) {
    if (!materializedSourceRefs.has(relative)) {
      missingFiles.push(relative);
      continue;
    }
    const absolute = resolveInside(materializedRoot, relative);
    if (!absolute || !existsSync(absolute)) {
      unsafeFiles.push(relative);
      continue;
    }
    try {
      const fileStat = lstatSync(absolute);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
        unsafeFiles.push(relative);
        continue;
      }
      const real = realpathSync(absolute);
      const rootPrefix = materializedRoot.endsWith(path.sep) ? materializedRoot : `${materializedRoot}${path.sep}`;
      if (!real.startsWith(rootPrefix)) {
        unsafeFiles.push(relative);
        continue;
      }
      const bytes = readFileSync(real);
      const actualDigest = digestBytes(bytes);
      const expectedDigest = String(binding.contentHash).replace(/^sha256:/i, '').toLowerCase();
      const digestOk = actualDigest === expectedDigest;
      const lengthOk = bytes.byteLength === binding.byteLength;
      if (!digestOk) digestMismatches.push(relative);
      if (!lengthOk) byteLengthMismatches.push(relative);
      if (digestOk && lengthOk) exactByteMatches += 1;
    } catch {
      unsafeFiles.push(relative);
    }
  }
}

if (missingFiles.length) blockers.push('MATERIALIZED_SOURCE_FILES_MISSING');
if (unexpectedFiles.length) blockers.push('MATERIALIZED_SOURCE_FILES_UNEXPECTED');
if (unsafeFiles.length) blockers.push('MATERIALIZED_SOURCE_FILES_UNSAFE');
if (digestMismatches.length) blockers.push('MATERIALIZED_SOURCE_DIGEST_MISMATCH');
if (byteLengthMismatches.length) blockers.push('MATERIALIZED_SOURCE_BYTE_LENGTH_MISMATCH');
if (plan.bindings.length && exactByteMatches !== plan.bindings.length) blockers.push('MATERIALIZED_BYTE_READBACK_INCOMPLETE');

const uniqueBlockers = [...new Set(blockers)];
const consumptionReady = uniqueBlockers.length === 0;
const status = !consumptionReady
  ? 'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_BLOCKED'
  : plan.executionAuthorizedByAdmission
    ? 'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_READY_AUTHORIZED'
    : 'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_READY_NOT_AUTHORIZED';

const nextGate = !consumptionReady
  ? 'REPAIR_ADMITTED_MATERIALIZED_ROOT_CONSUMPTION'
  : plan.executionAuthorizedByAdmission
    ? 'GRAPHIFY-BOUND-SNAPSHOT-EXECUTION-OPEN-01'
    : 'GRAPHIFY-BOUNDED-TOURNAMENT-CANARY-AUTHORIZATION-01';

const report = {
  schema: 'atlas.graphify-admitted-snapshot-consumption.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_MATERIALIZED_ROOT_PREFLIGHT',
  status,
  proofLevel: consumptionReady ? 'CONTRACT_AND_BYTES_PROVEN' : 'BLOCKED',
  authority: false,
  canonicalAuthority: false,
  graphifyExecutionAuthorized: plan.executionAuthorizedByAdmission,
  projectionWritesAuthorized: plan.projectionWritesAuthorized,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  graphWritesPerformed: false,
  qdrantWritesPerformed: false,
  cacheWritesPerformed: false,
  modelWritesPerformed: false,
  indexWritesPerformed: false,
  admissionPath: ADMISSION_PATH,
  snapshotPath,
  materializedRoot,
  workspaceId: plan.workspaceId,
  workspaceRevision: plan.workspaceRevision,
  snapshotRevision: plan.snapshotRevision,
  sourceCount: plan.sourceCount,
  repositoryCount: plan.repositoryCount,
  admissionRepositoryCount: plan.admissionRepositoryCount,
  materializationMarker,
  materializedFileCount,
  exactByteMatches,
  repositoryQualifiedBindingCount: plan.bindings.length,
  materializedPathCount: plan.materializedPathCount,
  checksums: {
    admissionSourceSelectionChecksum: plan.admissionSourceSelectionChecksum,
    snapshotMembershipChecksum: plan.snapshotMembershipChecksum,
    coordinatorSourceSelectionChecksum: plan.coordinatorSourceSelectionChecksum,
    canonicalTupleChecksum: plan.canonicalTupleChecksum,
    semantics: {
      admissionAndSnapshot: 'JSON_HASH_OF_SORTED_REPOSITORY_QUALIFIED_IDENTITY_ARRAY',
      coordinatorCompatibility: 'SORTED_CONCAT_UTF8_NO_DELIMITER_V1',
      canonicalDiagnostic: 'SORTED_TUPLE_JSON_UTF8_V1',
    },
  },
  evidence: {
    duplicateMaterializedPaths: bounded(plan.duplicateMaterializedPaths),
    missingFiles: bounded(missingFiles.sort()),
    unexpectedFiles: bounded(unexpectedFiles.sort()),
    unsafeFiles: bounded(unsafeFiles.sort()),
    digestMismatches: bounded(digestMismatches.sort()),
    byteLengthMismatches: bounded(byteLengthMismatches.sort()),
  },
  invariants: {
    doesNotReadLiveOriginInventory: true,
    materializedRootIsRevisionAddressedBySnapshot: Boolean(materializedRoot && plan.snapshotRevision),
    repositoryQualifiedIdentityOwnsMembership: true,
    sourceRefIsMaterializedLocationNotCanonicalMembershipIdentity: true,
    graphifyRunsLegacyOwnerNotUsed: true,
    graphifyExecutionsNotOpened: true,
    canonicalAuthorityNotAssigned: true,
    noRevisionSynthesized: true,
  },
  blockers: uniqueBlockers,
  firstBlockingInvariant: uniqueBlockers[0] ?? null,
  nextGate,
  requiredAuthorization: status === 'GRAPHIFY_ADMITTED_SNAPSHOT_CONSUMPTION_READY_NOT_AUTHORIZED'
    ? 'SEPARATE_EXPLICIT_GRAPHIFY_BOUND_SNAPSHOT_EXECUTION_AUTHORIZATION_REQUIRED'
    : null,
  safeNextCommand: 'npx tsx scripts/atlas/audit-graphify-admitted-snapshot-consumption-v1.mts',
  producerRevision: 'atlas.graphify-admitted-snapshot-consumption.v1',
};

mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status,
  proofLevel: report.proofLevel,
  workspaceRevision: report.workspaceRevision,
  snapshotRevision: report.snapshotRevision,
  sourceCount: report.sourceCount,
  repositoryCount: report.repositoryCount,
  exactByteMatches,
  materializedFileCount,
  graphifyExecutionAuthorized: report.graphifyExecutionAuthorized,
  firstBlockingInvariant: report.firstBlockingInvariant,
  nextGate,
  writesPerformed: false,
  reportPath: REPORT_PATH,
}, null, 2));

if (!consumptionReady) process.exitCode = 3;
