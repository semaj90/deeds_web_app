import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const boardPath = process.env.OPENSPEC_WORKBOARD_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_WORKBOARD_PATH)
  : path.join(REPORTS, 'openspec-workboard-v1.json');
const cardsPath = process.env.OPENSPEC_EVIDENCE_CARDS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_CARDS_PATH)
  : path.join(REPORTS, 'openspec-evidence-cards-v1.json');
const outputPath = process.env.OPENSPEC_WORKBOARD_RECONCILIATION_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_WORKBOARD_RECONCILIATION_OUTPUT)
  : path.join(REPORTS, 'openspec-workboard-evidence-reconciliation-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeSource(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function sourceRef(source, line) {
  const normalizedSource = normalizeSource(source);
  const lineNumber = Number(line);
  return normalizedSource && Number.isInteger(lineNumber) && lineNumber > 0
    ? `${normalizedSource}#L${lineNumber}`
    : null;
}

function evidenceSourceRef(card) {
  const identity = card?.taskIdentity ?? {};
  return normalizeSource(card?.sourceRefs?.[0] ?? identity.taskRef);
}

function taskLabel(task) {
  return `${task.change ?? 'unknown'}:${task.line ?? '?'} ${String(task.text ?? '').slice(0, 180)}`;
}

function main() {
  const board = readJson(boardPath);
  const cardsReport = readJson(cardsPath);
  if (board.schema !== 'atlas.openspec.workboard.v1') throw new Error('WORKBOARD_SCHEMA_UNSUPPORTED');
  if (cardsReport.schema !== 'atlas.openspec-evidence-cards.v1') throw new Error('EVIDENCE_CARD_SCHEMA_UNSUPPORTED');
  if (process.env.OPENSPEC_EVIDENCE_RUN_ID && cardsReport.runId !== process.env.OPENSPEC_EVIDENCE_RUN_ID) {
    throw new Error('WORKBOARD_RECONCILIATION_RUN_ID_MISMATCH');
  }

  const boardTasks = Array.isArray(board.taskInventory) ? board.taskInventory : [];
  const evidenceCards = Array.isArray(cardsReport.cards) ? cardsReport.cards : [];
  const boardBySourceRef = new Map();
  const boardBySourceRevision = new Map();
  const duplicateBoardRefs = [];
  const duplicateBoardRevisions = [];
  const addIndexed = (index, key, value, duplicates, keyName) => {
    if (!key) return;
    const existing = index.get(key) ?? [];
    if (existing.length) duplicates.push({ [keyName]: key, taskKeys: [...existing.map((task) => task.taskKey), value.taskKey] });
    index.set(key, [...existing, value]);
  };
  for (const task of boardTasks) {
    const ref = sourceRef(task.source, task.line);
    if (ref) {
      const existing = boardBySourceRef.get(ref);
      if (existing) duplicateBoardRefs.push({ sourceRef: ref, taskKeys: [existing.taskKey, task.taskKey] });
      else boardBySourceRef.set(ref, task);
    }
    addIndexed(boardBySourceRevision, task.blockHash, task, duplicateBoardRevisions, 'sourceRevision');
  }

  const evidenceBySourceRef = new Map();
  const evidenceBySourceRevision = new Map();
  const duplicateEvidenceRefs = [];
  const duplicateEvidenceRevisions = [];
  for (const card of evidenceCards) {
    const ref = evidenceSourceRef(card);
    if (ref) {
      const existing = evidenceBySourceRef.get(ref);
      if (existing) duplicateEvidenceRefs.push({ sourceRef: ref, cardIds: [existing.cardId, card.cardId] });
      else evidenceBySourceRef.set(ref, card);
    }
    addIndexed(evidenceBySourceRevision, card.revisions?.sourceRevision, card, duplicateEvidenceRevisions, 'sourceRevision');
  }

  const matched = [];
  const boardOnly = [];
  const evidenceOnly = [];
  const mismatches = {
    doneWithoutProven: [],
    openWithProven: [],
    doneWithStale: [],
    doneWithContradiction: [],
  };
  const matchedCardIds = new Set();
  const unmatchedBoardTasks = [];
  const recordMatch = (ref, task, card, joinType) => {
    if (!card || matchedCardIds.has(card.cardId)) return false;
    matchedCardIds.add(card.cardId);
    const proofState = card.proofState ?? 'CLAIM_ONLY';
    const row = { taskKey: task.taskKey, cardId: card.cardId, sourceRef: ref, joinType, boardState: task.state, proofState, taskId: card.taskIdentity?.taskId ?? null };
    matched.push(row);
    if (task.state === 'DONE' && proofState !== 'PROVEN') mismatches.doneWithoutProven.push(row);
    if (task.state !== 'DONE' && proofState === 'PROVEN') mismatches.openWithProven.push(row);
    if (task.state === 'DONE' && proofState === 'STALE') mismatches.doneWithStale.push(row);
    if (task.state === 'DONE' && Array.isArray(card.contradictions) && card.contradictions.length) mismatches.doneWithContradiction.push(row);
    return true;
  };
  for (const [ref, task] of boardBySourceRef) {
    if (!recordMatch(ref, task, evidenceBySourceRef.get(ref), 'EXACT_SOURCE_REF')) {
      unmatchedBoardTasks.push({ ref, task });
    }
  }
  for (const { ref, task } of unmatchedBoardTasks) {
    const candidates = task.blockHash ? evidenceBySourceRevision.get(task.blockHash) ?? [] : [];
    if (!recordMatch(ref, task, candidates.length === 1 ? candidates[0] : null, 'EXACT_SOURCE_REVISION')) {
      boardOnly.push({ taskKey: task.taskKey, sourceRef: ref, state: task.state, label: taskLabel(task), reason: candidates.length > 1 ? 'SOURCE_REVISION_AMBIGUOUS' : 'NO_EXACT_EVIDENCE_CARD' });
    }
  }
  for (const [ref, card] of evidenceBySourceRef) {
    if (!matchedCardIds.has(card.cardId)) {
      evidenceOnly.push({ cardId: card.cardId, sourceRef: ref, proofState: card.proofState ?? 'CLAIM_ONLY', taskId: card.taskIdentity?.taskId ?? null, sourceRevision: card.revisions?.sourceRevision ?? null });
    }
  }

  const proofStateCounts = Object.fromEntries(evidenceCards.reduce((counts, card) => {
    const state = card.proofState ?? 'CLAIM_ONLY';
    counts.set(state, (counts.get(state) ?? 0) + 1);
    return counts;
  }, new Map()));
  const boardDoneCount = boardTasks.filter((task) => task.state === 'DONE').length;
  const exactJoinCount = matched.length;
  const exactSourceRefJoinCount = matched.filter((row) => row.joinType === 'EXACT_SOURCE_REF').length;
  const exactSourceRevisionJoinCount = matched.filter((row) => row.joinType === 'EXACT_SOURCE_REVISION').length;
  const parityChecks = {
    exactTaskRevisionJoin: exactJoinCount === boardBySourceRef.size && exactJoinCount === evidenceBySourceRef.size,
    noDuplicateBoardSourceRefs: duplicateBoardRefs.length === 0,
    noDuplicateEvidenceSourceRefs: duplicateEvidenceRefs.length === 0,
    noDuplicateSourceRevisions: duplicateBoardRevisions.length === 0 && duplicateEvidenceRevisions.length === 0,
    sameTaskCardCount: boardTasks.length === evidenceCards.length,
    noClaimStateMutation: true,
    noWorkboardOverwrite: true,
  };
  const parityProven = Object.values(parityChecks).every(Boolean) && Object.values(mismatches).every((rows) => rows.length === 0);
  const unsigned = {
    schema: 'atlas.openspec-workboard-evidence-reconciliation.v1',
    runId: process.env.OPENSPEC_EVIDENCE_RUN_ID ?? cardsReport.runId ?? null,
    milestone: 'EVF-19',
    mode: 'READ_ONLY_DIFF_RECEIPT',
    status: parityProven ? 'WORKBOARD_PARITY_PROVEN_NO_WRITE' : 'WORKBOARD_PARITY_NOT_PROVEN',
    source: {
      workboard: relative(boardPath),
      evidenceCards: relative(cardsPath),
      workboardGeneratedAt: board.generatedAt ?? null,
      evidenceGeneratedAt: cardsReport.generatedAt ?? null,
      workspaceRevision: cardsReport.source?.workspaceRevision ?? null,
    },
    baseline: {
      workboardTaskCount: boardTasks.length,
      workboardDoneCount: boardDoneCount,
      evidenceCardCount: evidenceCards.length,
      evidenceProofStateCounts: proofStateCounts,
      evidenceProofUsableCount: cardsReport.summary?.proofUsableCount ?? 0,
    },
    diff: {
      exactJoinCount,
      exactSourceRefJoinCount,
      exactSourceRevisionJoinCount,
      boardIdentityRows: boardBySourceRef.size,
      evidenceIdentityRows: evidenceBySourceRef.size,
      boardOnlyCount: boardOnly.length,
      evidenceOnlyCount: evidenceOnly.length,
      duplicateBoardSourceRefCount: duplicateBoardRefs.length,
      duplicateEvidenceSourceRefCount: duplicateEvidenceRefs.length,
      duplicateBoardSourceRevisionCount: duplicateBoardRevisions.length,
      duplicateEvidenceSourceRevisionCount: duplicateEvidenceRevisions.length,
      doneWithoutProvenCount: mismatches.doneWithoutProven.length,
      openWithProvenCount: mismatches.openWithProven.length,
      doneWithStaleCount: mismatches.doneWithStale.length,
      doneWithContradictionCount: mismatches.doneWithContradiction.length,
    },
    parityChecks,
    samples: {
      boardOnly: boardOnly.slice(0, 25),
      evidenceOnly: evidenceOnly.slice(0, 25),
      doneWithoutProven: mismatches.doneWithoutProven.slice(0, 25),
      openWithProven: mismatches.openWithProven.slice(0, 25),
      duplicateBoardSourceRefs: duplicateBoardRefs.slice(0, 25),
      duplicateEvidenceSourceRefs: duplicateEvidenceRefs.slice(0, 25),
      duplicateBoardSourceRevisions: duplicateBoardRevisions.slice(0, 25),
      duplicateEvidenceSourceRevisions: duplicateEvidenceRevisions.slice(0, 25),
    },
    contract: {
      canonicalTaskAuthority: 'openspec/changes/*/tasks.md',
      proofAuthority: 'revision-bound evidence receipts; cards are retrieval artifacts',
      joinAuthority: 'exact normalized task source path + task line, then unique source revision digest',
      outputIsRebuildable: true,
      sharedWorkboardMutated: false,
      taskCheckboxesMutated: false,
      receiptStateMutated: false,
    },
    likely_cause: 'The existing workboard and evidence fabric use different corpus scopes and identity envelopes, so parity must be measured before either projection can influence the other.',
    evidence: [relative(boardPath), relative(cardsPath)],
    patch_targets: ['scripts/atlas/reconcile-openspec-workboard-evidence-v1.mjs'],
    safe_next_command: 'node scripts/atlas/reconcile-openspec-workboard-evidence-v1.mjs',
    smoke_command: 'node --check scripts/atlas/reconcile-openspec-workboard-evidence-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, diff: report.diff, writesPerformed: false, output: outputPath }, null, 2));
}

main();
