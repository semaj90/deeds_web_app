import { createHash } from 'node:crypto';

const retrievalStates = new Set(['CURRENT', 'WAITING', 'REVIEW_REQUIRED']);

export function classifyTaskCardRetrievalState(task, evidenceCard) {
  const reasons = [];
  if (task.taskIdentity?.basis === 'AMBIGUOUS_DECLARED_ID' || task.taskIdentity?.identityState === 'AMBIGUOUS') {
    reasons.push('AMBIGUOUS_TASK_IDENTITY');
  }
  if (task.supersessionReviewState === 'REVIEW_REQUIRED' || task.executionState === 'SUPERSEDED_OR_HISTORICAL') {
    reasons.push('SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED');
  }
  if (task.gateState === 'REVIEW_REQUIRED') reasons.push('WORKBOARD_GATE_REVIEW_REQUIRED');
  if (task.controllerState === 'STALE_CONTROLLER_RECEIPT') reasons.push('CONTROLLER_RECEIPT_STALE_OR_MISSING');
  if (evidenceCard?.proofState === 'STALE') reasons.push('EVIDENCE_RECEIPT_STALE');
  if (task.state === 'DONE' && evidenceCard?.proofState !== 'PROVEN') reasons.push('CHECKED_WITHOUT_PROOF');

  const retrievalState = reasons.length
    ? 'REVIEW_REQUIRED'
    : task.executionState === 'WAITING_ON_DEPENDENCY'
      ? 'WAITING'
      : 'CURRENT';
  if (!retrievalStates.has(retrievalState)) throw new Error('TASK_CARD_RETRIEVAL_STATE_INVALID');
  return { retrievalState, reviewReasons: [...new Set(reasons)].sort() };
}

export function buildOpenSpecTaskCardV1({ task, evidenceTask, evidenceCard, workspaceRevision, sourceFileRevision, verifiedReceiptRefs = [], receiptOutputRefs = [] }) {
  if (!task || !evidenceTask || !workspaceRevision || !sourceFileRevision) throw new Error('TASK_CARD_REQUIRED_INPUT_MISSING');
  if (task.source !== evidenceTask.tasksPath || task.line !== evidenceTask.sourceLine) throw new Error('TASK_CARD_SOURCE_COORDINATE_MISMATCH');
  if (!task.blockHash || task.blockHash !== evidenceTask.taskHash) throw new Error('TASK_CARD_BLOCK_REVISION_MISMATCH');
  if (task.logicalTaskKey && evidenceTask.taskIdentity.logicalTaskKey
    && task.logicalTaskKey !== evidenceTask.taskIdentity.logicalTaskKey) throw new Error('TASK_CARD_LOGICAL_IDENTITY_MISMATCH');
  if (!evidenceCard || evidenceCard.taskRef !== evidenceTask.taskRef) throw new Error('TASK_CARD_EVIDENCE_REF_MISMATCH');
  if (evidenceCard.workspaceRevision !== workspaceRevision) throw new Error('TASK_CARD_EVIDENCE_WORKSPACE_MISMATCH');

  const { retrievalState, reviewReasons } = classifyTaskCardRetrievalState(task, evidenceCard);
  const identity = evidenceTask.taskIdentity;
  const stableKey = task.logicalTaskKey ?? task.taskIdentity?.logicalTaskKey ?? task.stableKey;
  if (!stableKey) throw new Error('TASK_CARD_STABLE_KEY_MISSING');
  const claim = String(evidenceTask.taskText ?? task.text ?? '');
  const claimPreview = claim.slice(0, 320);
  const allEvidenceIds = Array.isArray(evidenceCard.evidenceIds) ? evidenceCard.evidenceIds : [];

  const card = {
    stableKey,
    declaredTaskId: identity.declaredTaskId ?? null,
    identityState: identity.identityState,
    changeId: task.change,
    taskRevision: task.blockHash,
    state: task.state === 'DONE' ? 'CHECKED' : task.executionState === 'WAITING_ON_DEPENDENCY' ? 'WAITING' : 'OPEN',
    retrievalState,
    reviewReasons,
    ...(reviewReasons.length ? { authorityReviewState: 'REVIEW_REQUIRED' } : {}),
    evidenceState: evidenceCard.proofState,
    claim: claimPreview,
    claimTruncated: claim.length > claimPreview.length,
    dependsOn: task.declared?.dependsOn ?? [],
    resolvedDependencyKeys: task.dependsOnTaskIds ?? [],
    unresolvedDependencies: task.declared?.unresolvedDepends ?? [],
    ambiguousDependencies: task.declared?.ambiguousDepends ?? [],
    readSet: task.readSet ?? task.declared?.reads ?? [],
    writeSet: task.writeSet ?? task.declared?.writes ?? [],
    receiptCandidateRefs: allEvidenceIds,
    verifiedReceiptRefs,
    receiptOutputRefs: receiptOutputRefs.map((reference) => ({ ...reference, taskKey: stableKey })),
    blockers: evidenceCard.blockers ?? [],
    contradictions: evidenceCard.contradictions ?? [],
    laneHint: task.lane ?? null,
    sourcePath: task.source,
    sourceLine: task.line,
    sourceCoordinateRole: 'LOCATOR_ONLY',
    canonicalAuthority: false,
  };
  for (const key of [
    'reviewReasons',
    'dependsOn',
    'resolvedDependencyKeys',
    'unresolvedDependencies',
    'ambiguousDependencies',
    'readSet',
    'writeSet',
    'receiptCandidateRefs',
    'verifiedReceiptRefs',
    'receiptOutputRefs',
    'blockers',
    'contradictions',
  ]) {
    if (card[key] == null || (Array.isArray(card[key]) && card[key].length === 0)) delete card[key];
  }
  return card;
}

export function buildOpenSpecTaskCardReportV1({ workboard, evidenceCensus, head, taskFileHashes }) {
  if (workboard?.schema !== 'atlas.openspec.workboard-task-snapshot.v1') throw new Error('TASK_CARD_WORKBOARD_SCHEMA_UNSUPPORTED');
  if (evidenceCensus?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('TASK_CARD_EVIDENCE_SCHEMA_UNSUPPORTED');
  if (evidenceCensus.source?.gitCommit !== head) throw new Error('TASK_CARD_WORKSPACE_HEAD_MISMATCH');
  if (!Array.isArray(workboard.tasks) || !Array.isArray(evidenceCensus.tasks) || !Array.isArray(evidenceCensus.evidenceCards)) {
    throw new Error('TASK_CARD_INPUT_ROWS_MISSING');
  }

  const currentEvidenceTasks = evidenceCensus.tasks.filter((item) => !item.archived
    && item.tasksPath?.startsWith('openspec/changes/')
    && item.tasksPath.split('/').length === 4
    && item.tasksPath.endsWith('/tasks.md'));
  const evidenceByRef = new Map(currentEvidenceTasks.map((item) => [item.taskRef, item]));
  if (currentEvidenceTasks.length !== workboard.tasks.length) throw new Error('TASK_CARD_TASK_POPULATION_MISMATCH');
  const evidenceCardsByRef = new Map(evidenceCensus.evidenceCards.map((item) => [item.taskRef, item]));
  const stableKeyByTaskKey = new Map(workboard.tasks.map((item) => [
    item.taskKey,
    item.logicalTaskKey ?? item.taskIdentity?.logicalTaskKey ?? item.stableKey ?? null,
  ]));
  const qualifiedReceiptsByCanonicalRef = new Map();
  const currentReceiptOutputsByCanonicalRef = new Map();
  for (const receipt of evidenceCensus.proofEligibleReceiptMatches ?? []) {
    if (!receipt.canonicalTaskRef || !receipt.evidenceId) continue;
    const refs = qualifiedReceiptsByCanonicalRef.get(receipt.canonicalTaskRef) ?? [];
    refs.push(receipt.evidenceId);
    qualifiedReceiptsByCanonicalRef.set(receipt.canonicalTaskRef, refs);
  }
  const evidenceTasksByCanonicalRef = new Map(currentEvidenceTasks.map((item) => [item.canonicalTaskRef, item]));
  for (const receipt of evidenceCensus.evidenceMatches ?? []) {
    if (receipt.proofEligible !== true || receipt.workspaceCurrent !== true || receipt.sourceCurrent !== true
      || !receipt.canonicalTaskRef || !receipt.evidenceId) continue;
    const evidenceTask = evidenceTasksByCanonicalRef.get(receipt.canonicalTaskRef);
    if (!evidenceTask || receipt.sourceRevision !== evidenceTask.taskHash) continue;
    const refs = currentReceiptOutputsByCanonicalRef.get(receipt.canonicalTaskRef) ?? [];
    for (const output of receipt.outputs ?? []) {
      if (typeof output.uri !== 'string' || !output.uri.startsWith('docs/reports/') || typeof output.checksum !== 'string') continue;
      refs.push({
        artifactId: output.uri.replaceAll('\\', '/'),
        sha256: output.checksum,
        receiptRef: receipt.evidenceId,
        receiptUri: receipt.uri,
        taskRef: evidenceTask.taskRef,
        taskRevision: evidenceTask.taskHash,
        workspaceRevision: evidenceCensus.source.workspaceRevision,
      });
    }
    currentReceiptOutputsByCanonicalRef.set(receipt.canonicalTaskRef, refs);
  }

  const cards = workboard.tasks.map((task) => {
    const taskRef = `${task.source}#L${task.line}`;
    const evidenceTask = evidenceByRef.get(taskRef);
    const evidenceCard = evidenceCardsByRef.get(taskRef);
    if (!evidenceTask || evidenceTask.taskHash !== task.blockHash) throw new Error(`TASK_CARD_TASK_REVISION_UNJOINED:${taskRef}`);
    const card = buildOpenSpecTaskCardV1({
      task,
      evidenceTask,
      evidenceCard,
      workspaceRevision: evidenceCensus.source.workspaceRevision,
      sourceFileRevision: taskFileHashes[task.source],
      verifiedReceiptRefs: qualifiedReceiptsByCanonicalRef.get(evidenceTask.canonicalTaskRef) ?? [],
      receiptOutputRefs: currentReceiptOutputsByCanonicalRef.get(evidenceTask.canonicalTaskRef) ?? [],
    });
    card.resolvedDependencyKeys = (card.resolvedDependencyKeys ?? []).map((dependencyKey) => ({
      sourceTaskKey: dependencyKey,
      stableKey: stableKeyByTaskKey.get(dependencyKey) ?? null,
    }));
    return card;
  });

  const retrievalStateCounts = Object.fromEntries([...retrievalStates].sort().map((state) => [
    state,
    cards.filter((card) => card.retrievalState === state).length,
  ]));
  const proofStateCounts = Object.fromEntries([...new Set(cards.map((card) => card.evidenceState))].sort().map((state) => [
    state,
    cards.filter((card) => card.evidenceState === state).length,
  ]));
  const sourcePopulationChecksum = sha256(JSON.stringify(Object.entries(taskFileHashes).sort(([a], [b]) => a.localeCompare(b))));
  return {
    schema: 'atlas.openspec-task-card-corpus.v1',
    cardSchema: 'atlas.openspec-task-card.v1',
    generatedAt: new Date().toISOString(),
    source: {
      taskAuthority: 'openspec/changes/*/tasks.md',
      workboardSchema: workboard.schema,
      workboardGeneratedAt: workboard.generatedAt,
      workspaceHead: head,
      workspaceRevision: evidenceCensus.source.workspaceRevision,
      sourcePopulationChecksum,
      taskFileCount: Object.keys(taskFileHashes).length,
      taskFileHashes,
      evidenceCensusGeneratedAt: evidenceCensus.generatedAt,
      evidenceCensusStatus: evidenceCensus.parserAudit?.censusStatus ?? evidenceCensus.summary?.censusStatus ?? 'DIAGNOSTIC_ONLY',
      promotionEligible: false,
    },
    summary: {
      taskCount: cards.length,
      retrievalStateCounts,
      evidenceStateCounts: proofStateCounts,
      checkedWithoutProof: cards.filter((card) => card.state === 'CHECKED' && card.evidenceState !== 'PROVEN').length,
      supersessionReviewCandidates: cards.filter((card) => (card.reviewReasons ?? []).some((reason) => ['SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED', 'SUPERSESSION_HEURISTIC_REQUIRES_REVIEW'].includes(reason))).length,
      verifiedReceiptRefs: cards.reduce((count, card) => count + (card.verifiedReceiptRefs?.length ?? 0), 0),
      reportManifestsJoined: 0,
      canonicalAuthority: false,
      mutationAuthorized: false,
    },
    lifecycleScope: 'CURRENT_OPENSPEC_CHANGE_TASKS_ONLY',
    retrievalPolicy: {
      defaultStates: ['CURRENT', 'WAITING', 'REVIEW_REQUIRED'],
      historyOnlyStates: ['SUPERSEDED', 'HISTORICAL'],
      historyEnabled: false,
      rankerAuthority: 'EXTERNAL_EXISTING_WORKBOARD_AND_TOURNAMENT_ONLY',
    },
    cardPolicy: { canonicalAuthority: false, mutationAuthorized: false },
    cards,
    writesPerformed: false,
  };
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
