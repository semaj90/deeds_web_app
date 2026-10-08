import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupersessionLinkV1, buildTaskTriageCorpusV1, selectOpenSpecTaskCardsV1, supersessionLinkChecksumV1 } from './openspec-report-manifest-v1.mjs';

const card = {
  stableKey: 'example#task-a',
  taskRevision: 'sha256:task-a',
  sourceFileRevision: 'sha256:task-file',
  sourcePath: 'openspec/changes/example/tasks.md',
  sourceLine: 3,
  reviewReasons: ['SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED'],
};

test('heuristic supersession candidate never suppresses a task', () => {
  const link = buildSupersessionLinkV1(card);
  assert.equal(link.confirmed, false);
  assert.equal(link.successorTaskKey, null);
  assert.equal(link.retrievalSuppressed, false);
  assert.equal(link.canonicalAuthority, false);
});

test('explicit duplicate declarations become review-only links with no inferred successor', () => {
  const link = buildSupersessionLinkV1({
    ...card,
    reviewReasons: ['EXPLICIT_DUPLICATE_OF_DECLARATION_REQUIRES_REVIEW'],
  });
  assert.equal(link.relation, 'SUPERSESSION_REVIEW_CANDIDATE');
  assert.equal(link.successorTaskKey, null);
  assert.equal(link.reviewState, 'REVIEW_REQUIRED');
  assert.equal(link.confirmed, false);
  assert.equal(link.retrievalSuppressed, false);
  assert.match(link.reason, /not a confirmed supersession/);
});

function supersessionFixture() {
  const taskCardCorpus = {
    schema: 'atlas.openspec-task-card-corpus.v1',
    source: { workspaceHead: 'head', sourcePopulationChecksum: 'sha256:population' },
    cards: [
      {
        stableKey: 'task:old', taskRevision: 'sha256:old-task', sourceFileRevision: 'sha256:old-file',
        sourcePath: 'openspec/changes/old/tasks.md', sourceLine: 2, state: 'OPEN', retrievalState: 'REVIEW_REQUIRED',
        reviewReasons: ['SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED'], evidenceState: 'CLAIM_ONLY', canonicalAuthority: false,
      },
      {
        stableKey: 'task:new', taskRevision: 'sha256:new-task', sourceFileRevision: 'sha256:new-file',
        sourcePath: 'openspec/changes/new/tasks.md', sourceLine: 4, state: 'OPEN', retrievalState: 'CURRENT',
        reviewReasons: [], evidenceState: 'CLAIM_ONLY', canonicalAuthority: false,
      },
    ],
    summary: { taskCount: 2, retrievalStateCounts: { REVIEW_REQUIRED: 1, CURRENT: 1 } },
  };
  const reportManifestCorpus = {
    schema: 'atlas.report-artifact-manifest-corpus.v1',
    workspaceHead: 'head',
    summary: { artifactCount: 0 },
    artifacts: [],
  };
  const link = {
    schema: 'atlas.openspec-supersession-link.v1',
    sourceTaskKey: 'task:old',
    sourceTaskRevision: 'sha256:old-task',
    sourceFileRevision: 'sha256:old-file',
    successorTaskKey: 'task:new',
    successorRevision: 'sha256:new-task',
    successorSourceFileRevision: 'sha256:new-file',
    sourceRef: 'openspec/changes/old/tasks.md#L2',
    successorSourceRef: 'openspec/changes/new/tasks.md#L4',
    lastValidRevision: 'sha256:old-task',
    workspaceHead: 'head',
    taskPopulationRevision: 'sha256:population',
    relation: 'SUPERSEDED_BY',
    basis: 'EXPLICIT_REPLACEMENT',
    reason: 'Task task:new explicitly replaces task:old.',
    evidenceRefs: ['openspec/changes/old/tasks.md#L2', 'openspec/changes/new/tasks.md#L4'],
    reviewState: 'CONFIRMED',
    confirmed: true,
    reviewedBy: 'reviewer:human-1',
    reviewedAt: '2026-10-03T12:00:00.000Z',
    retrievalSuppressed: true,
    mutationAuthorized: false,
    archiveManifestRef: null,
    rawArtifactPointer: null,
    canonicalAuthority: false,
  };
  link.checksum = supersessionLinkChecksumV1(link);
  return { taskCardCorpus, reportManifestCorpus, link };
}

test('a current reviewed receipt suppresses only the derived predecessor and preserves history', () => {
  const { taskCardCorpus, reportManifestCorpus, link } = supersessionFixture();
  const corpus = buildTaskTriageCorpusV1({
    taskCardCorpus, reportManifestCorpus, workspaceHead: 'head', reviewedSupersessionLinks: [link],
  });
  const predecessor = corpus.taskCardCorpus.cards.find((card) => card.stableKey === 'task:old');
  assert.equal(predecessor.retrievalState, 'SUPERSEDED');
  assert.equal(predecessor.lifecycleState, 'SUPERSEDED');
  assert.equal(predecessor.state, 'OPEN');
  assert.equal(predecessor.evidenceState, 'CLAIM_ONLY');
  assert.equal(predecessor.canonicalAuthority, false);
  assert.equal(predecessor.mutationAuthorized, false);
  assert.equal(corpus.supersessionLinks[0].lastValidRevision, 'sha256:old-task');
  assert.equal(corpus.supersessionLinks[0].archiveManifestRef, null);
  assert.equal(corpus.supersessionLinks[0].rawArtifactPointer, null);
  assert.equal(corpus.summary.confirmedSupersededCount, 1);
  assert.equal(corpus.summary.archiveEligibleCount, 0);
  assert.deepEqual(selectOpenSpecTaskCardsV1({ corpus }).cards.map((card) => card.stableKey), ['task:new']);
  assert.deepEqual(selectOpenSpecTaskCardsV1({ corpus, includeHistory: true }).cards.map((card) => card.stableKey), ['task:old', 'task:new']);
});

test('stale or tampered supersession receipts fail closed before default suppression', () => {
  const { taskCardCorpus, reportManifestCorpus, link } = supersessionFixture();
  const stale = { ...link, sourceTaskRevision: 'sha256:stale' };
  stale.checksum = supersessionLinkChecksumV1(stale);
  assert.throws(() => buildTaskTriageCorpusV1({
    taskCardCorpus, reportManifestCorpus, workspaceHead: 'head', reviewedSupersessionLinks: [stale],
  }), /SUPERSESSION_RECEIPT_TASK_REVISION_MISMATCH/);

  const tampered = { ...link, reason: 'silently edited' };
  assert.throws(() => buildTaskTriageCorpusV1({
    taskCardCorpus, reportManifestCorpus, workspaceHead: 'head', reviewedSupersessionLinks: [tampered],
  }), /SUPERSESSION_RECEIPT_CHECKSUM_MISMATCH/);

  const missingReplacementEvidence = { ...link, evidenceRefs: ['openspec/changes/old/tasks.md#L2'] };
  missingReplacementEvidence.checksum = supersessionLinkChecksumV1(missingReplacementEvidence);
  assert.throws(() => buildTaskTriageCorpusV1({
    taskCardCorpus, reportManifestCorpus, workspaceHead: 'head', reviewedSupersessionLinks: [missingReplacementEvidence],
  }), /SUPERSESSION_RECEIPT_SOURCE_EVIDENCE_REQUIRED/);

  const staleSuccessorSource = { ...link, successorSourceFileRevision: 'sha256:stale-file' };
  staleSuccessorSource.checksum = supersessionLinkChecksumV1(staleSuccessorSource);
  assert.throws(() => buildTaskTriageCorpusV1({
    taskCardCorpus, reportManifestCorpus, workspaceHead: 'head', reviewedSupersessionLinks: [staleSuccessorSource],
  }), /SUPERSESSION_RECEIPT_TASK_REVISION_MISMATCH/);
});

test('multiple successors and supersession cycles fail closed', () => {
  const { taskCardCorpus, reportManifestCorpus, link } = supersessionFixture();
  taskCardCorpus.cards.push({
    stableKey: 'task:other', taskRevision: 'sha256:other-task', sourceFileRevision: 'sha256:other-file',
    sourcePath: 'openspec/changes/other/tasks.md', sourceLine: 1, state: 'OPEN', retrievalState: 'CURRENT',
    reviewReasons: [], evidenceState: 'CLAIM_ONLY', canonicalAuthority: false,
  });
  taskCardCorpus.source.sourcePopulationChecksum = 'sha256:population-expanded';
  link.taskPopulationRevision = 'sha256:population-expanded';
  link.checksum = supersessionLinkChecksumV1(link);
  const secondSuccessor = {
    ...link,
    successorTaskKey: 'task:other',
    successorRevision: 'sha256:other-task',
    successorSourceFileRevision: 'sha256:other-file',
    successorSourceRef: 'openspec/changes/other/tasks.md#L1',
    evidenceRefs: ['openspec/changes/old/tasks.md#L2', 'openspec/changes/other/tasks.md#L1'],
  };
  secondSuccessor.checksum = supersessionLinkChecksumV1(secondSuccessor);
  assert.throws(() => buildTaskTriageCorpusV1({
    taskCardCorpus, reportManifestCorpus, workspaceHead: 'head', reviewedSupersessionLinks: [link, secondSuccessor],
  }), /SUPERSESSION_RECEIPT_AMBIGUOUS_SUCCESSOR/);

  const successor = taskCardCorpus.cards[1];
  const reverse = {
    ...link,
    sourceTaskKey: successor.stableKey,
    sourceTaskRevision: successor.taskRevision,
    sourceFileRevision: successor.sourceFileRevision,
    sourceRef: 'openspec/changes/new/tasks.md#L4',
    successorTaskKey: taskCardCorpus.cards[0].stableKey,
    successorRevision: taskCardCorpus.cards[0].taskRevision,
    successorSourceFileRevision: taskCardCorpus.cards[0].sourceFileRevision,
    successorSourceRef: 'openspec/changes/old/tasks.md#L2',
    lastValidRevision: successor.taskRevision,
  };
  reverse.checksum = supersessionLinkChecksumV1(reverse);
  assert.throws(() => buildTaskTriageCorpusV1({
    taskCardCorpus, reportManifestCorpus, workspaceHead: 'head', reviewedSupersessionLinks: [link, reverse],
  }), /SUPERSESSION_RECEIPT_CYCLE/);
});

test('joined triage corpus rejects mismatched workspace snapshots', () => {
  assert.throws(() => buildTaskTriageCorpusV1({
    taskCardCorpus: { schema: 'atlas.openspec-task-card-corpus.v1', source: { workspaceHead: 'old' }, cards: [] },
    reportManifestCorpus: { schema: 'atlas.report-artifact-manifest-corpus.v1', workspaceHead: 'head', summary: { artifactCount: 0 }, artifacts: [] },
    workspaceHead: 'head',
  }), /TRIAGE_WORKSPACE_HEAD_MISMATCH/);
});

test('joined corpus retains default retrieval filters and review-only state', () => {
  const corpus = buildTaskTriageCorpusV1({
    taskCardCorpus: {
      schema: 'atlas.openspec-task-card-corpus.v1',
      source: { workspaceHead: 'head', sourcePopulationChecksum: 'sha256:tasks' },
      cards: [card],
      summary: { taskCount: 1, retrievalStateCounts: { REVIEW_REQUIRED: 1 } },
    },
    reportManifestCorpus: {
      schema: 'atlas.report-artifact-manifest-corpus.v1',
      workspaceHead: 'head',
      summary: { artifactCount: 2 },
      artifacts: [{ archiveEligible: false }, { archiveEligible: false }],
    },
    workspaceHead: 'head',
  });
  assert.equal(corpus.summary.supersessionReviewCandidateCount, 1);
  assert.equal(corpus.summary.confirmedSupersededCount, 0);
  assert.equal(corpus.summary.archiveEligibleCount, 0);
  assert.deepEqual(corpus.retrievalPolicy.defaultStates, ['CURRENT', 'WAITING', 'REVIEW_REQUIRED']);
  assert.equal(corpus.writesPerformed, false);
});

test('retrieval excludes historical states unless explicitly requested and preserves order', () => {
  const corpus = {
    schema: 'atlas.openspec-task-triage-corpus.v1',
    workspaceHead: 'head',
    taskPopulationRevision: 'sha256:tasks',
    retrievalPolicy: {
      defaultStates: ['CURRENT', 'WAITING', 'REVIEW_REQUIRED'],
      historyOnlyStates: ['SUPERSEDED', 'HISTORICAL'],
    },
    taskCardCorpus: { cards: [
      { stableKey: 'current', retrievalState: 'CURRENT' },
      { stableKey: 'historical', retrievalState: 'HISTORICAL' },
      { stableKey: 'review', retrievalState: 'REVIEW_REQUIRED' },
    ] },
  };
  const current = selectOpenSpecTaskCardsV1({ corpus, limit: 2 });
  assert.deepEqual(current.cards.map((item) => item.stableKey), ['current', 'review']);
  assert.equal(current.orderingOwner, 'TASK_CARD_COMPILER_INPUT_ORDER');
  assert.equal(current.rankerApplied, false);
  const history = selectOpenSpecTaskCardsV1({ corpus, includeHistory: true, limit: 3 });
  assert.deepEqual(history.cards.map((item) => item.stableKey), ['current', 'historical', 'review']);
  assert.equal(history.writesPerformed, false);
});

test('retrieval rejects unsafe output limits', () => {
  assert.throws(() => selectOpenSpecTaskCardsV1({ corpus: {}, limit: 1001 }), /TRIAGE_CORPUS_SCHEMA_UNSUPPORTED/);
  assert.throws(() => selectOpenSpecTaskCardsV1({
    corpus: { schema: 'atlas.openspec-task-triage-corpus.v1' }, limit: 10001,
  }), /TRIAGE_RETRIEVAL_LIMIT_INVALID/);
});
