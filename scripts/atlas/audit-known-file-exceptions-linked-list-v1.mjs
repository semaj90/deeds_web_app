#!/usr/bin/env node

/**
 * Read-only report of unique packet-digest observations as a deterministic
 * linked list. The list is diagnostic evidence only; it does not create or
 * mutate packet, Graphify, cache, or projection state.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportsDir = path.join(root, 'docs', 'reports');
const producerPath = path.join(reportsDir, 'current-packet-digest-producer-v1.json');
const lifecyclePath = path.join(reportsDir, 'graphify-lifecycle-owner-v1.json');
const eligibilityPath = path.join(reportsDir, 'graphify-current-run-eligibility-v1.json');
const ownerPath = path.join(reportsDir, 'current-graphify-execution-owner-resolution-v1.json');
const outputPath = path.join(reportsDir, 'known-file-exceptions-linked-list-v1.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function normalizeSourceRef(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function writeAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

const producer = readJson(producerPath);
const lifecycle = readJson(lifecyclePath);
const eligibility = readJson(eligibilityPath);
const owner = readJson(ownerPath);

const bySourceRef = new Map();
for (const observation of producer.observations ?? []) {
  const sourceRef = normalizeSourceRef(observation.sourceRef);
  if (!sourceRef) continue;
  const existing = bySourceRef.get(sourceRef);
  if (!existing) {
    bySourceRef.set(sourceRef, { ...observation, sourceRef });
    continue;
  }

  const existingIdentity = JSON.stringify([
    existing.sourceRevision,
    existing.membershipContentDigest,
    existing.bindingContentDigest,
    existing.status,
  ]);
  const nextIdentity = JSON.stringify([
    observation.sourceRevision,
    observation.membershipContentDigest,
    observation.bindingContentDigest,
    observation.status,
  ]);
  if (nextIdentity !== existingIdentity) {
    existing.exception = 'DUPLICATE_SOURCE_REF_WITH_NON_IDENTICAL_OBSERVATIONS';
    existing.duplicateObservationCount = (existing.duplicateObservationCount ?? 1) + 1;
  } else {
    existing.duplicateObservationCount = (existing.duplicateObservationCount ?? 1) + 1;
  }
}

const observations = [...bySourceRef.values()].sort((left, right) => left.sourceRef.localeCompare(right.sourceRef));
const nodes = observations.map((observation, index) => {
  const nodeId = sha256(`known-file-exception-linked-list-v1\n${observation.sourceRef}`);
  const nextNodeId = index + 1 < observations.length
    ? sha256(`known-file-exception-linked-list-v1\n${observations[index + 1].sourceRef}`)
    : null;
  return {
    nodeId,
    sourceRef: observation.sourceRef,
    packetKey: observation.packetKey ?? null,
    sourceRevision: observation.sourceRevision ?? null,
    admittedContentDigest: observation.membershipContentDigest ?? observation.bindingContentDigest ?? null,
    observedByteDigest: observation.byteDigest ?? null,
    status: observation.status ?? 'UNCLASSIFIED',
    exception: observation.exception ?? null,
    duplicateObservationCount: observation.duplicateObservationCount ?? 1,
    promotionEligible: observation.promotionEligible ?? false,
    canonicalAuthority: false,
    writesPerformed: false,
    nextNodeId,
  };
});

const statusCounts = {};
for (const node of nodes) statusCounts[node.status] = (statusCounts[node.status] ?? 0) + 1;

const latestSelectedExecution = (owner.candidates ?? [])
  .filter((candidate) => candidate.canonical_authority === true)
  .sort((left, right) => String(right.completed_at ?? '').localeCompare(String(left.completed_at ?? '')))[0] ?? null;

const graphifyException = {
  rule: 'DAILY_GRAPHIFY_NO_NEW_RUN_OBSERVED',
  observed: lifecycle.runningRunCount === 0 && lifecycle.currentRunCount === 0 && eligibility.eligibleForFreshRun === false,
  interpretation: 'No new/current daily Graphify run is present in the refreshed lifecycle receipts. This does not prove that unrelated database rows were never changed.',
  runningRunCount: lifecycle.runningRunCount ?? null,
  currentRunCount: lifecycle.currentRunCount ?? null,
  staleRunCount: lifecycle.staleRunCount ?? null,
  eligibleForFreshRun: eligibility.eligibleForFreshRun ?? null,
  blockers: eligibility.blockers ?? [],
  selectedExecutionId: latestSelectedExecution?.execution_id ?? null,
  selectedExecutionCompletedAt: latestSelectedExecution?.completed_at ?? null,
  selectedExecutionCanonicalAuthority: latestSelectedExecution?.canonical_authority ?? false,
  lifecycleReceiptGeneratedAt: lifecycle.generatedAt ?? null,
  ownerReceiptGeneratedAt: owner.generatedAt ?? null,
  writesPerformed: false,
  canonicalAuthority: false,
};

const report = {
  schema: 'atlas.known-file-exceptions-linked-list.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_UNIQUE_FILE_EXCEPTION_LINKED_LIST',
  input: {
    producerReport: path.relative(root, producerPath).replaceAll('\\', '/'),
    producerGeneratedAt: producer.generatedAt ?? null,
    executionId: producer.executionId ?? null,
    workspaceRevision: producer.workspaceRevision ?? null,
    sourceObservationCount: producer.observations?.length ?? 0,
  },
  uniqueness: {
    key: 'normalized sourceRef',
    sourceObservationCount: producer.observations?.length ?? 0,
    uniqueFileCount: nodes.length,
    duplicateObservationCount: Math.max(0, (producer.observations?.length ?? 0) - nodes.length),
  },
  linkedList: {
    headNodeId: nodes[0]?.nodeId ?? null,
    tailNodeId: nodes.at(-1)?.nodeId ?? null,
    nodeCount: nodes.length,
    nodes,
  },
  statusCounts,
  graphifyException,
  mutation: {
    writesPerformed: false,
    databaseWritesPerformed: false,
    graphifyRefreshPerformed: false,
    packetBackfillPerformed: false,
    cacheWritesPerformed: false,
  },
  interpretation: {
    knownUniqueFilesAreDiagnosticOnly: true,
    currentWorktreeBytesMayDifferFromAdmittedSnapshot: statusCounts.ADMITTED_SNAPSHOT_BYTES_DIFFER_FROM_CURRENT_WORKTREE > 0,
    noGlobalNoChangeClaim: true,
    nextGate: 'PACKET-CHUNK-IDENTITY-OWNER-DECISION-01',
  },
};

report.reportChecksum = sha256(JSON.stringify(report));
writeAtomic(outputPath, report);

console.log(JSON.stringify({
  status: 'KNOWN_FILE_EXCEPTION_LINKED_LIST_READY',
  uniqueFileCount: nodes.length,
  statusCounts,
  graphifyException: graphifyException.observed ? graphifyException.rule : 'GRAPHIFY_STATUS_NOT_CONFIRMED',
  writesPerformed: false,
  reportPath: path.relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2));
