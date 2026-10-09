import test from 'node:test';
import assert from 'node:assert/strict';
import { attachVerifiedSeaweedCopyV1, buildReportArtifactManifestV1, buildReportManifestCorpusV1, joinCurrentReceiptOutputsToReportManifestV1, mediaTypeFor, selectOpenSpecTaskCardsV1 } from './openspec-report-manifest-v1.mjs';

test('manifest keeps unreviewed artifacts local and ineligible for archive', () => {
  const item = buildReportArtifactManifestV1({
    path: 'docs/reports/openspec-example.json',
    sizeBytes: 50_000_000,
    modifiedAt: '2026-10-03T00:00:00.000Z',
    priorEntry: { sha256: 'sha256:old', metadata: { sourceCommit: 'old-head' } },
    sha256: null,
    checksumState: 'REVIEW_REQUIRED_UNHASHED',
  });
  assert.equal(item.sha256, null);
  assert.equal(item.storageClass, 'WARM_LOCAL');
  assert.equal(item.sensitivityClass, 'UNASSESSED');
  assert.equal(item.archiveEligible, false);
  assert.equal(item.seaweedRef, null);
  assert.deepEqual(item.associatedTaskKeys, []);
});

test('manifest corpus preserves cached-checksum caveat and zero archive writes', () => {
  const manifest = buildReportArtifactManifestV1({
    path: 'docs/reports/example.jsonl',
    sizeBytes: 4,
    modifiedAt: '2026-10-03T00:00:00.000Z',
    sha256: 'sha256:cached',
    checksumState: 'CACHED_PRIOR_AUDIT_STAT_MATCH',
  });
  const corpus = buildReportManifestCorpusV1({
    workspaceHead: 'head',
    previousAudit: { generatedAt: '2026-10-03T00:00:00.000Z', auditHead: 'prior' },
    manifests: [manifest],
    metadataOnlyFiles: 1,
    hashedBytes: 0,
  });
  assert.equal(manifest.mediaType, 'application/x-ndjson');
  assert.match(corpus.previousAudit.reusePolicy, /not fresh checksum proof/);
  assert.equal(corpus.summary.cachedChecksumCount, 1);
  assert.equal(corpus.summary.archiveWrites, false);
  assert.equal(corpus.writesPerformed, false);
});

test('cold manifest transition requires fresh checksum plus independent exact readback and retains local source', () => {
  const checksum = 'a'.repeat(64);
  const manifest = buildReportArtifactManifestV1({
    path: 'docs/reports/reviewed-canary.md',
    sizeBytes: 5,
    modifiedAt: '2026-10-03T00:00:00.000Z',
    sha256: `sha256:${checksum}`,
    checksumState: 'FRESH_SHA256',
  });
  const artifactRef = {
    canonical_authority: false,
    artifact: {
      artifact_id: 'artifact-canary-r1',
      backend: 'SEAWEEDFS_S3',
      bucket: 'atlas-archive',
      object_key: `openspec/${checksum}/reviewed-canary.md`,
      content_checksum: checksum,
      content_length_bytes: 5,
      canonical_authority: false,
    },
  };
  const hydrationReceipt = {
    artifact_id: 'artifact-canary-r1',
    expected_checksum: checksum,
    observed_checksum: checksum,
    hydrated_bytes: 5,
    status: 'VERIFIED_READY',
  };

  const copied = attachVerifiedSeaweedCopyV1({ manifest, artifactRef, hydrationReceipt });
  assert.equal(copied.storageClass, 'COLD_SEAWEEDFS');
  assert.equal(copied.seaweedRef, `seaweedfs://atlas-archive/openspec/${checksum}/reviewed-canary.md`);
  assert.equal(copied.archiveCopyState, 'COPY_READBACK_VERIFIED');
  assert.equal(copied.localDisposition, 'RETAIN_LOCAL');
  assert.equal(copied.archiveEligible, false);

  const corpus = buildReportManifestCorpusV1({
    workspaceHead: 'head',
    manifests: [copied],
    metadataOnlyFiles: 0,
    hashedBytes: 5,
  });
  assert.equal(corpus.summary.verifiedColdCopies, 1);
  assert.equal(corpus.summary.archiveWrites, false);
  assert.equal(corpus.summary.localSourcesRetained, true);
  assert.equal(corpus.writesPerformed, false);
});

test('cold manifest transition rejects cached checksums, mismatched readback, and unsafe pointers', () => {
  const checksum = 'b'.repeat(64);
  const manifest = buildReportArtifactManifestV1({
    path: 'docs/reports/canary.json',
    sizeBytes: 3,
    modifiedAt: '2026-10-03T00:00:00.000Z',
    sha256: `sha256:${checksum}`,
    checksumState: 'FRESH_SHA256',
  });
  const artifactRef = {
    canonical_authority: false,
    artifact: {
      artifact_id: 'artifact-r1',
      backend: 'SEAWEEDFS_S3',
      bucket: 'atlas-archive',
      object_key: `reports/${checksum}/canary.json`,
      content_checksum: checksum,
      content_length_bytes: 3,
      canonical_authority: false,
    },
  };
  const hydrationReceipt = {
    artifact_id: 'artifact-r1',
    expected_checksum: checksum,
    observed_checksum: checksum,
    hydrated_bytes: 3,
    status: 'VERIFIED_READY',
  };

  assert.throws(() => attachVerifiedSeaweedCopyV1({
    manifest: { ...manifest, checksumState: 'CACHED_PRIOR_AUDIT_STAT_MATCH' },
    artifactRef,
    hydrationReceipt,
  }), /REPORT_COPY_REQUIRES_FRESH_SOURCE_CHECKSUM/);
  assert.throws(() => attachVerifiedSeaweedCopyV1({
    manifest,
    artifactRef,
    hydrationReceipt: { ...hydrationReceipt, observed_checksum: 'c'.repeat(64) },
  }), /REPORT_COPY_READBACK_UNPROVEN/);
  assert.throws(() => attachVerifiedSeaweedCopyV1({
    manifest,
    artifactRef: { ...artifactRef, artifact: { ...artifactRef.artifact, object_key: '../escape' } },
    hydrationReceipt,
  }), /REPORT_COPY_POINTER_INVALID/);
});

test('media type is based only on known metadata extensions', () => {
  assert.equal(mediaTypeFor('receipt.yaml'), 'application/yaml');
  assert.equal(mediaTypeFor('vector.arrow'), 'application/octet-stream');
});

test('selector preserves its established default state set and binds its exact returned cards', () => {
  const cards = [
    { stableKey: 'current', taskRevision: 'rev-1', retrievalState: 'CURRENT' },
    { stableKey: 'waiting', taskRevision: 'rev-2', retrievalState: 'WAITING' },
    { stableKey: 'review', taskRevision: 'rev-3', retrievalState: 'REVIEW_REQUIRED' },
    { stableKey: 'history', taskRevision: 'rev-4', retrievalState: 'HISTORICAL' },
  ];
  const selected = selectOpenSpecTaskCardsV1({
    corpus: {
      schema: 'atlas.openspec-task-triage-corpus.v1',
      workspaceHead: 'head',
      taskPopulationRevision: 'sha256:population',
      retrievalPolicy: { defaultStates: ['CURRENT', 'WAITING', 'REVIEW_REQUIRED'], historyOnlyStates: ['HISTORICAL'] },
      taskCardCorpus: { cards },
    },
    limit: 10,
  });
  assert.deepEqual(selected.cards, cards.slice(0, 3));
  assert.equal(selected.eligibleCount, 3);
  assert.equal(selected.returnedCount, 3);
  assert.equal(selected.taskPopulationRevision, 'sha256:population');
  assert.match(selected.candidateChecksum, /^sha256:[a-f0-9]{64}$/);
  assert.equal(selected.canonicalAuthority, false);
  assert.equal(selected.writesPerformed, false);
});

test('selector owns optional lifecycle narrowing and keeps it in the selection receipt', () => {
  const cards = [
    { stableKey: 'open', taskRevision: 'rev-1', retrievalState: 'CURRENT', state: 'OPEN' },
    { stableKey: 'checked', taskRevision: 'rev-2', retrievalState: 'CURRENT', state: 'CHECKED' },
    { stableKey: 'waiting', taskRevision: 'rev-3', retrievalState: 'WAITING', state: 'WAITING' },
  ];
  const selected = selectOpenSpecTaskCardsV1({
    corpus: {
      schema: 'atlas.openspec-task-triage-corpus.v1',
      workspaceHead: 'head',
      taskPopulationRevision: 'sha256:population',
      retrievalPolicy: { defaultStates: ['CURRENT', 'WAITING'], historyOnlyStates: [] },
      taskCardCorpus: { cards },
    },
    cardStates: ['OPEN'],
    limit: 10_000,
  });
  assert.deepEqual(selected.cards, [cards[0]]);
  assert.deepEqual(selected.selectedCardStates, ['OPEN']);
  assert.equal(selected.eligibleCount, 1);
  assert.equal(selected.returnedCount, 1);
});

function reportJoinFixture({
  receiptWorkspaceRevision = 'sha256:workspace',
  receiptTaskRevision = 'sha256:task',
  receiptSourceRevision = 'sha256:file',
  outputChecksum = 'sha256:report',
  receiptTaskId = '2.2',
  receiptLineStart = 4,
  receiptLineEnd = 4,
} = {}) {
  const taskCardCorpus = {
    schema: 'atlas.openspec-task-card-corpus.v1',
    source: { workspaceHead: 'head', workspaceRevision: 'sha256:workspace' },
    cards: [{
      stableKey: 'task-a',
      changeId: 'example',
      declaredTaskId: '2.2',
      taskRevision: 'sha256:task',
      sourcePath: 'openspec/changes/example/tasks.md',
      sourceLine: 4,
      receiptOutputRefs: [{
        taskKey: 'task-a',
        artifactId: 'docs/reports/example.json',
        sha256: outputChecksum,
        receiptRef: 'receipt:example:task-a:v1',
        receiptUri: 'docs/reports/receipt.json',
        taskRef: 'openspec/changes/example/tasks.md#L4',
        taskRevision: receiptTaskRevision,
        sourceRevision: receiptSourceRevision,
        workspaceRevision: receiptWorkspaceRevision,
      }],
    }],
  };
  const reportManifestCorpus = buildReportManifestCorpusV1({
    workspaceHead: 'head',
    workspaceRevision: 'sha256:workspace',
    previousAudit: null,
    manifests: [buildReportArtifactManifestV1({
      path: 'docs/reports/example.json',
      sizeBytes: 20,
      modifiedAt: '2026-10-03T00:00:00.000Z',
      sha256: 'sha256:cached',
      checksumState: 'CACHED_PRIOR_AUDIT_STAT_MATCH',
    })],
    metadataOnlyFiles: 1,
    hashedBytes: 0,
  });
  return {
    taskCardCorpus,
    reportManifestCorpus,
    validatedReceiptsByUri: {
      'docs/reports/receipt.json': {
        evidenceId: 'receipt:example:task-a:v1',
        changeId: 'example',
        taskId: receiptTaskId,
        sourceRevision: 'sha256:file',
        taskRevision: 'sha256:task',
        workspaceRevision: 'sha256:workspace',
        sourceRefs: [{ file: 'openspec/changes/example/tasks.md', lineStart: receiptLineStart, lineEnd: receiptLineEnd }],
        outputs: [{ uri: 'docs/reports/example.json', checksum: outputChecksum }],
      },
    },
    freshOutputChecksumsByPath: { 'docs/reports/example.json': 'sha256:report' },
  };
}

test('current task receipt output joins only on exact identity, revision, and fresh checksum', () => {
  const corpus = joinCurrentReceiptOutputsToReportManifestV1(reportJoinFixture());
  const [artifact] = corpus.artifacts;
  assert.deepEqual(artifact.associatedTaskKeys, ['task-a']);
  assert.equal(artifact.taskAssociationState, 'JOINED_CURRENT_RECEIPT_OUTPUT');
  assert.equal(artifact.checksumState, 'FRESH_SHA256');
  assert.equal(corpus.summary.associatedTaskCount, 1);
  assert.equal(corpus.policy.canonicalAuthority, false);
  assert.equal(artifact.archiveEligible, false);
  assert.equal(corpus.writesPerformed, false);
});

test('stale workspace, task revision, and output checksum cannot create report associations', () => {
  const staleWorkspace = joinCurrentReceiptOutputsToReportManifestV1(reportJoinFixture({ receiptWorkspaceRevision: 'sha256:old-workspace' }));
  const staleTask = joinCurrentReceiptOutputsToReportManifestV1(reportJoinFixture({ receiptTaskRevision: 'sha256:old-task' }));
  const staleSource = joinCurrentReceiptOutputsToReportManifestV1(reportJoinFixture({ receiptSourceRevision: 'sha256:old-file' }));
  const changedOutput = joinCurrentReceiptOutputsToReportManifestV1(reportJoinFixture({ outputChecksum: 'sha256:old-report' }));
  for (const corpus of [staleWorkspace, staleTask, staleSource, changedOutput]) {
    assert.deepEqual(corpus.artifacts[0].associatedTaskKeys, []);
    assert.equal(corpus.artifacts[0].taskAssociationState, 'NOT_JOINED');
    assert.equal(corpus.summary.associatedTaskCount, 0);
    assert.equal(corpus.writesPerformed, false);
  }
});

test('canonical receipts bind by declared task identity and exact source span without a non-schema taskRef', () => {
  const mismatchedTask = joinCurrentReceiptOutputsToReportManifestV1(reportJoinFixture({ receiptTaskId: '2.3' }));
  const mismatchedSpan = joinCurrentReceiptOutputsToReportManifestV1(reportJoinFixture({ receiptLineStart: 5, receiptLineEnd: 5 }));
  for (const corpus of [mismatchedTask, mismatchedSpan]) {
    assert.deepEqual(corpus.artifacts[0].associatedTaskKeys, []);
    assert.equal(corpus.summary.associatedTaskCount, 0);
    assert.equal(corpus.writesPerformed, false);
  }
});
