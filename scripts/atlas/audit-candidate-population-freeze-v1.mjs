#!/usr/bin/env node

/**
 * Read-only gate for CandidatePopulationFreezeV1.
 *
 * This auditor never rebuilds ordinals, queries a vector store, or writes a
 * population. It only reconciles the authoritative receipts that must exist
 * before KNN/KMeans/SOM may consume a shared semantic matrix.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/candidate-population-freeze-v1.json');
const receiptPaths = {
  lineage: path.join(root, 'docs/reports/current-lineage-closure-v1.json'),
  ordinalAdmission: path.join(root, 'docs/reports/candidate-ordinal-admission-v1.json'),
  semanticSnapshot: path.join(root, 'docs/reports/current-semantic-candidate-snapshot-v1.json'),
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
};
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const lineage = readJson(receiptPaths.lineage);
const ordinalAdmission = readJson(receiptPaths.ordinalAdmission);
const semanticSnapshot = readJson(receiptPaths.semanticSnapshot);

const blockers = [];
if (lineage.__error) blockers.push('CURRENT_LINEAGE_RECEIPT_UNAVAILABLE');
if (ordinalAdmission.__error) blockers.push('CANDIDATE_ORDINAL_ADMISSION_RECEIPT_UNAVAILABLE');
if (semanticSnapshot.__error) blockers.push('SEMANTIC_SNAPSHOT_RECEIPT_UNAVAILABLE');
const candidateOrdinalEligibleRows = Number(lineage.funnel?.candidateOrdinalEligibleRows ?? lineage.candidateOrdinalEligibleRows ?? 0);
if (candidateOrdinalEligibleRows < 1) blockers.push('CURRENT_LINEAGE_HAS_ZERO_ELIGIBLE_CANDIDATES');
if (lineage.status && lineage.status !== 'CURRENT_LINEAGE_CLOSED') blockers.push(`LINEAGE_STATUS_${lineage.status}`);
if (lineage.workspaceAuthority?.cohortAligned !== true) blockers.push('WORKSPACE_COHORT_NOT_ALIGNED');
if (lineage.sourceProducerAuthority?.safeToPromote !== true) blockers.push('SOURCE_PRODUCER_AUTHORITY_UNPROVEN');
if (ordinalAdmission.downstreamAllowed !== true) blockers.push('ORDINAL_ADMISSION_DOWNSTREAM_DISABLED');
if (semanticSnapshot.status !== 'SEMANTIC_CANDIDATE_SNAPSHOT_READY') blockers.push(`SEMANTIC_SNAPSHOT_STATUS_${semanticSnapshot.status ?? 'MISSING'}`);
if (semanticSnapshot.canonicalAuthority === true || semanticSnapshot.writesPerformed === true) blockers.push('SEMANTIC_SNAPSHOT_MUTATION_OR_AUTHORITY_FORBIDDEN');

const eligible = blockers.length === 0;
const identity = {
  schema: 'atlas.candidate-population-freeze.v1',
  workspaceRevision: lineage.scope?.workspaceRevision ?? lineage.authority?.workspaceRevision ?? lineage.inputs?.workspaceRevision ?? null,
  candidateSnapshotRevision: semanticSnapshot.candidateSnapshotRevision ?? null,
  candidateOrdinalMapChecksum: ordinalAdmission.ordinalMapChecksum ?? null,
  representationId: semanticSnapshot.representationId ?? 'semantic_768',
  representationRevision: semanticSnapshot.representationRevision ?? null,
  tensorChecksum: semanticSnapshot.tensorChecksum ?? null,
  rowIdentityChecksum: semanticSnapshot.rowIdentityChecksum ?? null,
  rowCount: semanticSnapshot.rowCount ?? ordinalAdmission.rowCount ?? null,
  sourceAuthorityReceipt: path.relative(root, receiptPaths.lineage).replaceAll('\\', '/'),
  blockers,
};
const report = {
  ...identity,
  status: eligible ? 'CANDIDATE_POPULATION_FREEZE_READY_FOR_EXPLICIT_REVIEW' : 'CANDIDATE_POPULATION_FREEZE_BLOCKED',
  downstreamAllowed: false,
  canonicalAuthority: false,
  writesPerformed: false,
  databaseWrites: false,
  qdrantWrites: false,
  valkeyWrites: false,
  freezeChecksum: sha256(identity),
  nextGate: eligible ? 'CANDIDATE_POPULATION_FREEZE_EXPLICIT_REVIEW' : 'CURRENT_LINEAGE_ADMISSION',
  receipts: Object.fromEntries(Object.entries(receiptPaths).map(([key, file]) => [key, path.relative(root, file).replaceAll('\\', '/')])),
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tempPath, reportPath);
console.log(JSON.stringify({ status: report.status, blockers, rowCount: report.rowCount, writesPerformed: false, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
