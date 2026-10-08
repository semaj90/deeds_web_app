import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const retrievalStates = new Set(['CURRENT', 'WAITING', 'REVIEW_REQUIRED']);

export function classifyTaskCardRetrievalState(task, evidenceCard) {
  const reasons = [];
  const explicitDuplicateDeclaration = /\bDUPLICATE_OF\s+[A-Z0-9][A-Z0-9_.:-]*(?:\/[A-Z0-9][A-Z0-9_.:-]*)*/.test(String(task.text ?? ''));
  if (task.taskIdentity?.basis === 'AMBIGUOUS_DECLARED_ID' || task.taskIdentity?.identityState === 'AMBIGUOUS') {
    reasons.push('AMBIGUOUS_TASK_IDENTITY');
  }
  if (explicitDuplicateDeclaration) reasons.push('EXPLICIT_DUPLICATE_OF_DECLARATION_REQUIRES_REVIEW');
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

export function classifyTaskEvidenceCardJoinV1({ tasks, evidenceTasks, evidenceCards, workspaceRevision }) {
  if (!Array.isArray(tasks) || !Array.isArray(evidenceTasks) || !Array.isArray(evidenceCards) || !workspaceRevision) {
    throw new Error('TASK_EVIDENCE_JOIN_ROWS_MISSING');
  }
  const evidenceTasksByRef = groupBy(evidenceTasks, (item) => item.taskRef);
  const evidenceCardsByRef = groupBy(evidenceCards, (item) => item.taskRef);
  const tasksByRef = groupBy(tasks, (item) => `${item.source}#L${item.line}`);
  const rows = tasks.map((task) => {
    const taskRef = `${task.source}#L${task.line}`;
    const taskMatches = evidenceTasksByRef.get(taskRef) ?? [];
    const cardMatches = evidenceCardsByRef.get(taskRef) ?? [];
    const cardinality = cardMatches.length === 0 ? 'ZERO' : cardMatches.length === 1 ? 'ONE' : 'MANY';
    const reasons = [];
    if (taskMatches.length !== 1) reasons.push(taskMatches.length === 0 ? 'TASK_EVIDENCE_MISSING' : 'TASK_EVIDENCE_DUPLICATE');
    if (cardinality !== 'ONE') reasons.push(`EVIDENCE_CARD_CARDINALITY_${cardinality}`);
    if (taskMatches.length === 1 && (!task.blockHash || !taskMatches[0].taskHash || task.blockHash !== taskMatches[0].taskHash)) reasons.push('TASK_BLOCK_REVISION_MISMATCH');
    if (taskMatches.length === 1 && !taskMatches[0].canonicalTaskRef) reasons.push('CANONICAL_TASK_REF_MISSING');
    const taskLogicalKey = task.logicalTaskKey ?? task.taskIdentity?.logicalTaskKey;
    const evidenceLogicalKey = taskMatches[0]?.taskIdentity?.logicalTaskKey;
    if (taskLogicalKey && taskLogicalKey !== evidenceLogicalKey) reasons.push('CANONICAL_TASK_IDENTITY_MISMATCH');
    if (cardinality === 'ONE' && cardMatches[0].workspaceRevision !== workspaceRevision) reasons.push('WORKSPACE_REVISION_MISMATCH');
    if (cardinality === 'ONE' && (!task.sourceFileRevision || !cardMatches[0].sourceRevision)) reasons.push('SOURCE_FILE_REVISION_MISSING');
    else if (cardinality === 'ONE' && task.sourceFileRevision !== cardMatches[0].sourceRevision) reasons.push('SOURCE_FILE_REVISION_MISMATCH');
    return { taskRef, evidenceTaskCount: taskMatches.length, evidenceCardCount: cardMatches.length, cardinality, joinable: reasons.length === 0, reasons: reasons.sort() };
  });
  const evidenceCardRows = evidenceCards.map((card, index) => {
    const taskMatches = tasksByRef.get(card.taskRef) ?? [];
    const cardinality = taskMatches.length === 0 ? 'ZERO' : taskMatches.length === 1 ? 'ONE' : 'MANY';
    const taskRef = String(card.taskRef ?? '').replaceAll('\\', '/');
    const scope = taskRef.startsWith('openspec/changes/archive/')
      ? 'ARCHIVED'
      : taskRef.startsWith('openspec/changes/')
        ? 'ACTIVE'
        : 'OTHER';
    const reasons = [];
    if (cardinality !== 'ONE' && scope === 'ACTIVE') reasons.push(`TASK_CARD_CARDINALITY_${cardinality}`);
    if (scope === 'ARCHIVED') reasons.push('ARCHIVED_EVIDENCE_CARD_OUTSIDE_ACTIVE_TASK_SNAPSHOT');
    if (scope === 'OTHER') reasons.push('EVIDENCE_CARD_OUTSIDE_ROOT_OPENSPEC_SCOPE');
    if (card.workspaceRevision !== workspaceRevision) reasons.push('WORKSPACE_REVISION_MISMATCH');
    return {
      evidenceCardRef: `${card.taskRef ?? 'missing-task-ref'}#CARD${index}`,
      taskRef: card.taskRef ?? null,
      taskCardCount: taskMatches.length,
      cardinality,
      scope,
      taskCardStableKeys: taskMatches.map((task) => task.logicalTaskKey ?? task.taskIdentity?.logicalTaskKey ?? task.stableKey ?? null),
      workspaceRevisionMatched: card.workspaceRevision === workspaceRevision,
      reasons: reasons.sort(),
    };
  });
  const cardinalityCounts = Object.fromEntries(['ZERO', 'ONE', 'MANY'].map((value) => [value, rows.filter((row) => row.cardinality === value).length]));
  const evidenceCardCardinalityCounts = Object.fromEntries(['ZERO', 'ONE', 'MANY'].map((value) => [value, evidenceCardRows.filter((row) => row.cardinality === value).length]));
  const activeEvidenceCardCardinalityCounts = Object.fromEntries(['ZERO', 'ONE', 'MANY'].map((value) => [value, evidenceCardRows.filter((row) => row.scope === 'ACTIVE' && row.cardinality === value).length]));
  const evidenceCardScopeCounts = Object.fromEntries(['ACTIVE', 'ARCHIVED', 'OTHER'].map((value) => [value, evidenceCardRows.filter((row) => row.scope === value).length]));
  return { schema: 'atlas.task-evidence-card-join-census.v1', rows, cardinalityCounts, evidenceCardRows, evidenceCardCardinalityCounts, activeEvidenceCardCardinalityCounts, evidenceCardScopeCounts, canonicalAuthority: false, writesPerformed: false };
}

export function evaluateTaskEvidenceAdmissionV1({ taskCard, evidenceTask, evidenceCard, receiptBindings }) {
  if (!taskCard || !evidenceTask || !evidenceCard || !Array.isArray(receiptBindings)) {
    throw new Error('TASK_EVIDENCE_ADMISSION_INPUT_MISSING');
  }
  const reasons = [];
  const revisionPattern = /^sha256:[a-f0-9]{64}$/i;
  const expectedTaskRef = evidenceTask.taskRef;
  if (!taskCard.stableKey) reasons.push('TASK_CARD_ID_MISSING');
  if (!evidenceCard.checksum || evidenceCard.checksum !== sha256(canonicalJson(Object.fromEntries(
    Object.entries(evidenceCard).filter(([key]) => key !== 'checksum'),
  )))) reasons.push('EVIDENCE_CARD_CHECKSUM_INVALID');
  if (taskCard.taskRef !== expectedTaskRef || evidenceCard.taskRef !== expectedTaskRef || evidenceCard.sourceRef !== expectedTaskRef) reasons.push('SOURCE_REF_UNBOUND');
  if (taskCard.canonicalTaskRef !== evidenceTask.canonicalTaskRef) reasons.push('CANONICAL_TASK_IDENTITY_MISMATCH');
  if (!taskCard.taskRevision || taskCard.taskRevision !== evidenceTask.taskHash) reasons.push('TASK_REVISION_MISMATCH');
  if (!revisionPattern.test(String(taskCard.sourceRevision ?? '')) || !revisionPattern.test(String(evidenceCard.sourceRevision ?? ''))) reasons.push('MISSING_SOURCE_REVISION');
  else if (taskCard.sourceRevision !== evidenceCard.sourceRevision) reasons.push('SOURCE_REVISION_MISMATCH');
  if (!taskCard.workspaceRevision || taskCard.workspaceRevision !== evidenceCard.workspaceRevision) reasons.push('WORKSPACE_REVISION_MISMATCH');
  if (evidenceCard.proofState !== 'PROVEN' || evidenceCard.proofUsable !== true) reasons.push('DIAGNOSTIC_ONLY');

  const matchedBindings = receiptBindings.filter((binding) => evidenceCard.evidenceIds?.includes(binding.evidenceId));
  const verifiedBindings = matchedBindings.filter((binding) => binding.proofEligible === true
    && binding.workspaceCurrent === true
    && binding.sourceCurrent === true
    && binding.sourceRefsCurrent === true
    && binding.taskSpanMatched === true
    && binding.canonicalTaskRef === evidenceTask.canonicalTaskRef
    && binding.workspaceRevision === taskCard.workspaceRevision
    && binding.sourceRevision === evidenceTask.taskHash
    && Array.isArray(binding.sourceRefChecks)
    && binding.sourceRefChecks.length > 0
    && binding.sourceRefChecks.every((check) => check.current === true));
  if (verifiedBindings.length === 0) reasons.push('NO_EXACT_VERIFIED_RECEIPT_BINDING');

  const body = {
    schema: 'atlas.task-evidence-admission.v1',
    taskCardId: taskCard.stableKey ?? null,
    evidenceCardChecksum: evidenceCard.checksum ?? null,
    canonicalTaskRef: evidenceTask.canonicalTaskRef ?? null,
    taskRevision: taskCard.taskRevision ?? null,
    evidenceRevision: evidenceCard.checksum ?? null,
    sourceRef: evidenceCard.sourceRef ?? null,
    sourceRevision: evidenceCard.sourceRevision ?? null,
    workspaceRevision: evidenceCard.workspaceRevision ?? null,
    relationKind: 'DECLARED',
    admissionScope: 'TASK_CLAIM_PROOF_ONLY',
    admitted: reasons.length === 0,
    reason: reasons.length === 0 ? 'EXACT_REVISION_MATCH' : [...new Set(reasons)].sort()[0],
    reasonCodes: [...new Set(reasons)].sort(),
    evidenceRefs: verifiedBindings.map((binding) => binding.evidenceId).sort(),
    canonicalAuthority: false,
    writesPerformed: false,
  };
  return { ...body, checksum: sha256(canonicalJson(body)) };
}

function groupBy(values, keyOf) {
  const grouped = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (typeof key !== 'string' || key.length === 0) continue;
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}

function requireUniqueRefs(values, keyOf, errorCode) {
  const grouped = groupBy(values, keyOf);
  const duplicateRef = [...grouped.entries()].find(([, rows]) => rows.length > 1)?.[0];
  if (duplicateRef) throw new Error(`${errorCode}:${duplicateRef}`);
  return new Map([...grouped.entries()].map(([key, rows]) => [key, rows[0]]));
}

export function buildOpenSpecTaskCardV1({ task, evidenceTask, evidenceCard, workspaceRevision, sourceFileRevision, verifiedReceiptRefs = [], receiptOutputRefs = [] }) {
  if (!task || !evidenceTask || !workspaceRevision || !sourceFileRevision) throw new Error('TASK_CARD_REQUIRED_INPUT_MISSING');
  if (task.source !== evidenceTask.tasksPath || task.line !== evidenceTask.sourceLine) throw new Error('TASK_CARD_SOURCE_COORDINATE_MISMATCH');
  if (!task.blockHash || task.blockHash !== evidenceTask.taskHash) throw new Error('TASK_CARD_BLOCK_REVISION_MISMATCH');
  if (task.logicalTaskKey && evidenceTask.taskIdentity.logicalTaskKey
    && task.logicalTaskKey !== evidenceTask.taskIdentity.logicalTaskKey) throw new Error('TASK_CARD_LOGICAL_IDENTITY_MISMATCH');
  if (!evidenceCard || evidenceCard.taskRef !== evidenceTask.taskRef) throw new Error('TASK_CARD_EVIDENCE_REF_MISMATCH');
  if (evidenceCard.workspaceRevision !== workspaceRevision) throw new Error('TASK_CARD_EVIDENCE_WORKSPACE_MISMATCH');
  if (!/^sha256:[a-f0-9]{64}$/i.test(sourceFileRevision)) throw new Error('TASK_CARD_SOURCE_FILE_REVISION_INVALID');
  if (evidenceCard.sourceRevision !== sourceFileRevision) throw new Error('TASK_CARD_EVIDENCE_SOURCE_REVISION_MISMATCH');

  const { retrievalState, reviewReasons } = classifyTaskCardRetrievalState({
    ...task,
    text: evidenceTask.taskText ?? task.text,
  }, evidenceCard);
  const identity = evidenceTask.taskIdentity;
  const stableKey = task.logicalTaskKey ?? task.taskIdentity?.logicalTaskKey ?? task.stableKey;
  if (!stableKey) throw new Error('TASK_CARD_STABLE_KEY_MISSING');
  const claim = String(evidenceTask.taskText ?? task.text ?? '');
  const claimPreview = claim.slice(0, 320);
  const declaredDuplicateTargets = [...claim.matchAll(/\bDUPLICATE_OF\s+([A-Z0-9][A-Z0-9_.:-]*(?:\/[A-Z0-9][A-Z0-9_.:-]*)*)/g)]
    .flatMap((match) => match[1].split('/'))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort();
  const allEvidenceIds = Array.isArray(evidenceCard.evidenceIds) ? evidenceCard.evidenceIds : [];

  const card = {
    stableKey,
    declaredTaskId: identity.declaredTaskId ?? null,
    identityState: identity.identityState,
    changeId: task.change,
    taskRevision: task.blockHash,
    taskRef: evidenceTask.taskRef,
    canonicalTaskRef: evidenceTask.canonicalTaskRef,
    sourceRevision: sourceFileRevision,
    sourceFileRevision,
    workspaceRevision,
    state: task.state === 'DONE' ? 'CHECKED' : task.executionState === 'WAITING_ON_DEPENDENCY' ? 'WAITING' : 'OPEN',
    retrievalState,
    reviewReasons,
    ...(reviewReasons.length ? { authorityReviewState: 'REVIEW_REQUIRED' } : {}),
    evidenceState: evidenceCard.proofState,
    claim: claimPreview,
    claimTruncated: claim.length > claimPreview.length,
    declaredDuplicateTargets,
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
    'declaredDuplicateTargets',
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

export function buildCompactTaskCardSummaryV1(report) {
  if (report?.schema !== 'atlas.openspec-task-card-corpus.v1'
    || !Array.isArray(report.cards)
    || !report.source?.workspaceHead
    || !report.source?.workspaceRevision
    || !report.source?.sourcePopulationChecksum) {
    throw new Error('COMPACT_TASK_CARD_SUMMARY_SOURCE_INVALID');
  }
  const supersessionReasons = new Set([
    'SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED',
    'SUPERSESSION_HEURISTIC_REQUIRES_REVIEW',
    'EXPLICIT_DUPLICATE_OF_DECLARATION_REQUIRES_REVIEW',
  ]);
  const reviewCandidates = report.cards
    .filter((card) => (card.reviewReasons ?? []).some((reason) => supersessionReasons.has(reason)))
    .map((card) => ({
      stableKey: card.stableKey,
      declaredTaskId: card.declaredTaskId ?? null,
      taskRef: card.taskRef,
      canonicalTaskRef: card.canonicalTaskRef,
      taskRevision: card.taskRevision,
      sourceFileRevision: card.sourceFileRevision,
      workspaceRevision: card.workspaceRevision,
      sourcePath: card.sourcePath,
      sourceLine: card.sourceLine,
      claim: card.claim,
      claimTruncated: card.claimTruncated === true,
      declaredDuplicateTargets: card.declaredDuplicateTargets ?? [],
      reviewReasons: [...card.reviewReasons].sort(),
      evidenceState: card.evidenceState,
      receiptCandidateRefs: card.receiptCandidateRefs ?? [],
      verifiedReceiptRefs: card.verifiedReceiptRefs ?? [],
    }))
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey));
  const body = {
    schema: 'atlas.openspec-task-card-summary.v1',
    source: {
      workspaceHead: report.source.workspaceHead,
      workspaceRevision: report.source.workspaceRevision,
      sourcePopulationChecksum: report.source.sourcePopulationChecksum,
      taskFileCount: report.source.taskFileCount,
      evidenceCensusStatus: report.source.evidenceCensusStatus,
    },
    summary: {
      taskCount: report.summary.taskCount,
      retrievalStateCounts: report.summary.retrievalStateCounts,
      evidenceStateCounts: report.summary.evidenceStateCounts,
      checkedWithoutProof: report.summary.checkedWithoutProof,
      supersessionReviewCandidateCount: report.summary.supersessionReviewCandidates,
      reviewRequiredTaskCount: report.summary.retrievalStateCounts?.REVIEW_REQUIRED ?? 0,
      verifiedReceiptRefCount: report.summary.verifiedReceiptRefs,
      reviewCandidateCount: reviewCandidates.length,
      candidatesWithVerifiedReceipts: reviewCandidates.filter((candidate) => candidate.verifiedReceiptRefs.length > 0).length,
      candidatesWithDeclaredTargets: reviewCandidates.filter((candidate) => candidate.declaredDuplicateTargets.length > 0).length,
      reviewedSupersessionReceiptState: 'NOT_EVALUATED_NO_RECEIPT_INPUT',
      canonicalAuthority: false,
      mutationAuthorized: false,
    },
    reviewCandidates,
    sideEffects: { canonicalStoresWritten: false, taskLedgersModified: false },
  };
  return { ...body, checksum: sha256(JSON.stringify(body)) };
}

export function verifyCompactTaskCardSummaryV1(summary) {
  if (!summary || typeof summary !== 'object' || typeof summary.checksum !== 'string') return false;
  const { checksum, ...body } = summary;
  return checksum === sha256(JSON.stringify(body));
}

export function writeTaskCardShardsV1(report, outputPath, maxShardBytes = 2_000_000) {
  if (report?.schema !== 'atlas.openspec-task-card-corpus.v1' || !Array.isArray(report.cards)) {
    throw new Error('TASK_CARD_SHARD_REPORT_INVALID');
  }
  if (!Number.isSafeInteger(maxShardBytes) || maxShardBytes < 1024 || maxShardBytes >= 10_000_000) {
    throw new Error('TASK_CARD_SHARD_LIMIT_INVALID');
  }
  const corpusBytes = Buffer.from(JSON.stringify({ ...report, cards: undefined }));
  const rowsDigest = createHash('sha256');
  for (const card of report.cards) rowsDigest.update(`${JSON.stringify(card)}\n`);
  const rowsChecksum = `sha256:${rowsDigest.digest('hex')}`;
  const contentKey = sha256(`${sha256(corpusBytes)}\n${rowsChecksum}`).slice('sha256:'.length, 'sha256:'.length + 20);
  const shardDirectory = `${outputPath}.shards-${contentKey}`;
  mkdirSync(shardDirectory, { recursive: true });
  const shards = [];
  let currentRows = [];
  let currentBytes = 0;
  const flush = () => {
    const index = shards.length;
    const data = currentRows.join('');
    const fileName = `part-${String(index).padStart(4, '0')}.jsonl`;
    const path = resolve(shardDirectory, fileName);
    const checksum = sha256(data);
    if (existsSync(path)) {
      if (readFileSync(path, 'utf8') !== data) throw new Error(`TASK_CARD_SHARD_CONTENT_CONFLICT:${fileName}`);
    } else {
      writeFileSync(path, data, { encoding: 'utf8', flag: 'wx' });
    }
    shards.push({ path: relative(dirname(outputPath), path).split(sep).join('/'), rowCount: currentRows.length, bytes: Buffer.byteLength(data), checksum });
    currentRows = [];
    currentBytes = 0;
  };
  for (const card of report.cards) {
    const row = `${JSON.stringify(card)}\n`;
    const rowBytes = Buffer.byteLength(row);
    if (rowBytes > maxShardBytes) throw new Error('TASK_CARD_ROW_EXCEEDS_SHARD_LIMIT');
    if (currentRows.length && currentBytes + rowBytes > maxShardBytes) flush();
    currentRows.push(row);
    currentBytes += rowBytes;
  }
  if (currentRows.length || shards.length === 0) flush();
  const { cards, ...corpus } = report;
  const manifestBody = {
    schema: 'atlas.openspec-task-card-shard-manifest.v1',
    corpusSchema: report.schema,
    cardSchema: report.cardSchema,
    corpus,
    rowCount: cards.length,
    rowsChecksum,
    shardCount: shards.length,
    shards,
  };
  const manifest = { ...manifestBody, checksum: sha256(JSON.stringify(manifestBody)) };
  const serialized = `${JSON.stringify(manifest)}\n`;
  if (Buffer.byteLength(serialized) >= 10_000_000) throw new Error('TASK_CARD_SHARD_MANIFEST_OVER_LIMIT');
  writeFileSync(outputPath, serialized, 'utf8');
  const readback = loadTaskCardCorpusV1(outputPath);
  if (readback.cards.length !== cards.length || readback.rowsChecksum !== rowsChecksum) {
    throw new Error('TASK_CARD_SHARD_READBACK_MISMATCH');
  }
  return { rowCount: cards.length, shardCount: shards.length, bytes: Buffer.byteLength(serialized), checksum: manifest.checksum };
}

export function loadTaskCardCorpusV1(inputPath) {
  const parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
  if (parsed?.schema === 'atlas.openspec-task-card-corpus.v1') return parsed;
  if (parsed?.schema !== 'atlas.openspec-task-card-shard-manifest.v1'
    || parsed.corpusSchema !== 'atlas.openspec-task-card-corpus.v1' || !Array.isArray(parsed.shards)) {
    throw new Error('TASK_CARD_CORPUS_SCHEMA_UNSUPPORTED');
  }
  const { checksum, ...manifestBody } = parsed;
  if (checksum !== sha256(JSON.stringify(manifestBody))) throw new Error('TASK_CARD_SHARD_MANIFEST_CHECKSUM_MISMATCH');
  const cards = [];
  const rowsDigest = createHash('sha256');
  for (const shard of parsed.shards) {
    if (typeof shard.path !== 'string' || isAbsolute(shard.path)) throw new Error('TASK_CARD_SHARD_PATH_INVALID');
    const path = resolve(dirname(inputPath), shard.path);
    const rel = relative(dirname(inputPath), path);
    if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('TASK_CARD_SHARD_PATH_INVALID');
    const data = readFileSync(path, 'utf8');
    if (Buffer.byteLength(data) !== shard.bytes || sha256(data) !== shard.checksum) throw new Error(`TASK_CARD_SHARD_CHECKSUM_MISMATCH:${shard.path}`);
    rowsDigest.update(data);
    const shardRows = data.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (shardRows.length !== shard.rowCount) throw new Error(`TASK_CARD_SHARD_ROW_COUNT_MISMATCH:${shard.path}`);
    cards.push(...shardRows);
  }
  if (cards.length !== parsed.rowCount) throw new Error('TASK_CARD_SHARD_TOTAL_ROW_COUNT_MISMATCH');
  if (`sha256:${rowsDigest.digest('hex')}` !== parsed.rowsChecksum) throw new Error('TASK_CARD_SHARD_ROWS_CHECKSUM_MISMATCH');
  return { ...parsed.corpus, schema: parsed.corpusSchema, cardSchema: parsed.cardSchema, rowsChecksum: parsed.rowsChecksum, cards };
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
  const evidenceByRef = requireUniqueRefs(currentEvidenceTasks, (item) => item.taskRef, 'TASK_CARD_DUPLICATE_EVIDENCE_TASK_REF');
  if (currentEvidenceTasks.length !== workboard.tasks.length) throw new Error('TASK_CARD_TASK_POPULATION_MISMATCH');
  const evidenceCardsByRef = requireUniqueRefs(evidenceCensus.evidenceCards, (item) => item.taskRef, 'TASK_CARD_DUPLICATE_EVIDENCE_CARD_REF');
  requireUniqueRefs(workboard.tasks, (item) => `${item.source}#L${item.line}`, 'TASK_CARD_DUPLICATE_WORKBOARD_TASK_REF');
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
      supersessionReviewCandidates: cards.filter((card) => (card.reviewReasons ?? []).some((reason) => ['SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED', 'SUPERSESSION_HEURISTIC_REQUIRES_REVIEW', 'EXPLICIT_DUPLICATE_OF_DECLARATION_REQUIRES_REVIEW'].includes(reason))).length,
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
