import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compileOpenSpecEvidenceRunManifestV1, verifyOpenSpecEvidenceRunManifestV1 } from './compile-openspec-evidence-run-manifest-v1.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-run-manifest-'));
  const runId = 'pipeline-test-run';
  const runDirectory = path.join(root, 'docs', 'reports', 'openspec-evidence', runId);
  const revision = 'sha256:workspace';
  const censusRef = path.join(runDirectory, 'census-v1.json');
  const runRef = (name) => path.relative(process.cwd(), path.join(runDirectory, name)).replaceAll('\\', '/');
  const census = {
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    runId,
    source: { workspaceRevision: revision },
    summary: {
      totalChanges: 4,
      totalTasks: 9,
      checkedTasks: 5,
      checkedWithEvidence: 5,
      ambiguous_task_identities: 365,
      taskIdMissing: 0,
    },
    tasks: [
      { taskRef: 'task-checked', declaredChecked: true },
      { taskRef: 'task-open', declaredChecked: false },
      { taskRef: 'task-claim-only', declaredChecked: true },
    ],
  };
  const identityRecovery = {
    schema: 'atlas.openspec-task-identity-recovery.v1',
    runId,
    source: { census: censusRef, workspaceRevision: revision },
    summary: {
      taskCount: 9,
      canonicalKeyCoverageCount: 9,
      canonicalKeyAdmittedCount: 7,
      identityStateCounts: { AMBIGUOUS: 2, CONFLICTING: 0 },
    },
  };
  const receiptTyping = {
    schema: 'atlas.openspec-receipt-type-classification.v1',
    runId,
    source: { census: censusRef, workspaceRevision: revision },
    summary: { receiptCount: 8 },
  };
  const receiptBinding = {
    schema: 'atlas.openspec-orphan-binding-resolution.v1',
    runId,
    source: {
      census: censusRef,
      workspaceRevision: revision,
      identityRecovery: runRef('identity-recovery-v1.json'),
      receiptTypes: runRef('receipt-typing-v1.json'),
    },
    summary: {
      receiptCount: 8,
      missingTaskCount: 3,
      ambiguousCount: 2,
      trueOrphanCount: 1,
      missingRevisionCount: 1,
      staleRevisionCount: 1,
      bindingDispositionCounts: { MISSING_TASK: 3, AMBIGUOUS: 2, TRUE_ORPHAN: 1 },
    },
  };
  const reconciliation = {
    schema: 'atlas.openspec-evidence-census-reconciliation.v1',
    runId,
    source: {
      census: censusRef,
      workspaceRevision: revision,
      identity: runRef('identity-recovery-v1.json'),
      receiptTypes: runRef('receipt-typing-v1.json'),
      orphanBindings: runRef('receipt-binding-v1.json'),
      predicates: runRef('predicate-resolution-v1.json'),
    },
    strictCurrent: { canonicalKeyAdmitted: 7 },
  };
  const predicateResolution = {
    schema: 'atlas.openspec-task-evidence-bindings.v1',
    runId,
    source: { census: censusRef, workspaceRevision: revision },
    bindings: [
      { taskRef: 'task-checked', proofState: 'PROVEN' },
      { taskRef: 'task-open', proofState: 'PROVEN' },
      { taskRef: 'task-claim-only', proofState: 'CLAIM_ONLY' },
    ],
  };
  const files = {
    census: path.join(runDirectory, 'census-v1.json'),
    identityRecovery: path.join(runDirectory, 'identity-recovery-v1.json'),
    receiptTyping: path.join(runDirectory, 'receipt-typing-v1.json'),
    receiptBinding: path.join(runDirectory, 'receipt-binding-v1.json'),
    reconciliation: path.join(runDirectory, 'reconciliation-v1.json'),
    predicateResolution: path.join(runDirectory, 'predicate-resolution-v1.json'),
    diagnostics: {
      evidenceCards: path.join(runDirectory, 'evidence-cards-v1.json'),
      workboardProjection: path.join(runDirectory, 'workboard-projection-v1.json'),
      workboardReconciliation: path.join(runDirectory, 'workboard-reconciliation-v1.json'),
      goldenTask: path.join(runDirectory, 'golden-task-v1.json'),
      goldenReceipt: path.join(runDirectory, 'tree-node-identity-formula-receipt-v1.json'),
    },
  };
  for (const [key, value] of Object.entries({ census, identityRecovery, receiptTyping, receiptBinding, reconciliation, predicateResolution })) writeJson(files[key], value);
  writeJson(files.diagnostics.evidenceCards, {
    schema: 'atlas.openspec-evidence-cards.v1', runId,
    source: { census: runRef('census-v1.json'), bindings: runRef('predicate-resolution-v1.json'), workspaceRevision: revision },
  });
  writeJson(files.diagnostics.workboardProjection, {
    schema: 'atlas.openspec-evidence-workboard-projection.v1', runId,
    source: { census: runRef('census-v1.json'), bindings: runRef('predicate-resolution-v1.json'), cards: runRef('evidence-cards-v1.json'), workspaceRevision: revision },
  });
  writeJson(files.diagnostics.workboardReconciliation, {
    schema: 'atlas.openspec-workboard-evidence-reconciliation.v1', runId,
    source: { evidenceCards: runRef('evidence-cards-v1.json'), workspaceRevision: revision },
  });
  const goldenReceipt = { schema: 'atlas.evidence-receipt.v1', workspaceRevision: revision, checksum: 'sha256:receipt' };
  writeJson(files.diagnostics.goldenReceipt, goldenReceipt);
  writeJson(files.diagnostics.goldenTask, {
    schema: 'atlas.openspec-golden-task.v1', runId,
    evidence: [runRef('tree-node-identity-formula-receipt-v1.json')],
    source: { census: runRef('census-v1.json'), workspaceRevision: revision, receiptChecksum: goldenReceipt.checksum },
  });
  return { root, runId, runDirectory, files };
}

test('final authority binds same-run checksums and uses reconciled metrics over raw census counters', () => {
  const data = fixture();
  const { summary, manifest } = compileOpenSpecEvidenceRunManifestV1({
    runId: data.runId,
    runDirectory: data.runDirectory,
    paths: data.files,
    generatedAt: '2026-10-01T00:00:00.000Z',
    gitRevision: 'abc123',
  });

  assert.equal(summary.status, 'PIPELINE_COMPLETED_READ_ONLY');
  assert.equal(summary.counts.tasks, 9);
  assert.equal(summary.counts.canonicalKeys, 9);
  assert.equal(summary.counts.admittedCanonicalKeys, 7);
  assert.equal(summary.counts.quarantinedIdentities, 2);
  assert.equal(summary.counts.ambiguousIdentities, 2);
  assert.equal(summary.counts.checkedClaimsProven, 1);
  assert.equal(summary.counts.uncheckedTasksProven, 1);
  assert.equal(summary.counts.checkedClaimsProven, 1);
  assert.equal(summary.counts.missingTask, 3);
  assert.equal(summary.counts.ambiguous, 2);
  assert.equal(summary.counts.trueOrphan, 1);
  assert.equal(summary.counts.missingOrStaleRevision, 2);
  assert.equal(Object.hasOwn(summary.counts, 'ambiguousTaskIdentities'), false);
  assert.equal(summary.gates.find((item) => item.id === 'EVF-RUN-06_STALE_METRIC_DETECTION').status, 'PASS');
  assert.equal(manifest.finalSummary.path.endsWith('final-summary-v1.json'), true);
  assert.match(manifest.finalSummary.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(manifest.diagnostics.evidenceCards.runId, data.runId);
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('manifest checksum-binds same-run workboard and golden diagnostics', () => {
  const data = fixture();
  const result = compileOpenSpecEvidenceRunManifestV1({ runId: data.runId, runDirectory: data.runDirectory, paths: data.files });
  assert.equal(verifyOpenSpecEvidenceRunManifestV1(result.manifestPath).manifest.status, 'PIPELINE_COMPLETED_READ_ONLY');
  fs.appendFileSync(data.files.diagnostics.workboardProjection, ' ');
  assert.throws(() => verifyOpenSpecEvidenceRunManifestV1(result.manifestPath), /RUN_STAGE_CHECKSUM_MISMATCH/);
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('rejects stage artifacts outside the explicit run directory', () => {
  const data = fixture();
  const external = path.join(data.root, 'outside.json');
  writeJson(external, { schema: 'atlas.openspec-task-identity-recovery.v1' });
  assert.throws(() => compileOpenSpecEvidenceRunManifestV1({
    runId: data.runId,
    runDirectory: data.runDirectory,
    paths: { ...data.files, identityRecovery: external },
  }), /ARTIFACT_OUTSIDE_RUN_DIRECTORY/);
  fs.rmSync(data.root, { recursive: true, force: true });
});

test('manifest hashes the exact final-summary bytes and stage artifacts', () => {
  const data = fixture();
  const result = compileOpenSpecEvidenceRunManifestV1({ runId: data.runId, runDirectory: data.runDirectory, paths: data.files });
  const summaryBytes = fs.readFileSync(result.summaryPath);
  const expected = `sha256:${crypto.createHash('sha256').update(summaryBytes).digest('hex')}`;
  assert.equal(result.manifest.finalSummary.sha256, expected);
  assert.equal(result.manifest.stages.census.sha256, `sha256:${crypto.createHash('sha256').update(fs.readFileSync(data.files.census)).digest('hex')}`);
  assert.equal(verifyOpenSpecEvidenceRunManifestV1(result.manifestPath).summary.status, 'PIPELINE_COMPLETED_READ_ONLY');
  fs.appendFileSync(data.files.census, ' ');
  assert.throws(() => verifyOpenSpecEvidenceRunManifestV1(result.manifestPath), /RUN_STAGE_CHECKSUM_MISMATCH/);
  fs.rmSync(data.root, { recursive: true, force: true });
});
