const SHA256 = /^sha256:[a-f0-9]{64}$/;

/** Add resolution evidence to exact diagnostic cards without changing Kanban task status. */
export function projectDiagnosticResolutionOnBoardV1({
  board,
  receipt,
  receiptSha256,
  artifactReadbackVerified,
}) {
  if (artifactReadbackVerified !== true) throw new Error('DIAGNOSTIC_RESOLUTION_ARTIFACTS_NOT_VERIFIED');
  if (!board || !Array.isArray(board.tasks)) throw new Error('DIAGNOSTIC_RESOLUTION_BOARD_INVALID');
  if (receipt?.schema !== 'atlas.svelte-check-diagnostic-resolution.v1'
    || receipt.status !== 'CLEAN_RUN_RESOLUTION_CANDIDATES'
    || receipt.completionAuthorized !== false
    || receipt.writesPerformed !== false
    || receipt.boardWritesPerformed !== false
    || receipt.databaseWritesPerformed !== false
    || typeof receipt.previousRunId !== 'string'
    || typeof receipt.currentRunId !== 'string'
    || !SHA256.test(receipt.checkerScopeId ?? '')
    || !SHA256.test(receiptSha256 ?? '')
    || !Array.isArray(receipt.resolvedDiagnostics)
    || !Array.isArray(receipt.resolvedDiagnosticFingerprints)
    || !receipt.artifacts?.previous
    || !receipt.artifacts?.current) {
    throw new Error('DIAGNOSTIC_RESOLUTION_RECEIPT_INVALID');
  }

  const records = new Map();
  for (const record of receipt.resolvedDiagnostics) {
    if (!record || typeof record.taskId !== 'string' || !SHA256.test(record.fingerprint ?? '')) {
      throw new Error('DIAGNOSTIC_RESOLUTION_RECORD_INVALID');
    }
    if (records.has(record.fingerprint)) throw new Error('DIAGNOSTIC_RESOLUTION_RECORD_DUPLICATE');
    records.set(record.fingerprint, record);
  }
  const fingerprints = [...records.keys()].sort();
  if (JSON.stringify(fingerprints) !== JSON.stringify([...receipt.resolvedDiagnosticFingerprints].sort())
    || receipt.resolvedCount !== records.size) {
    throw new Error('DIAGNOSTIC_RESOLUTION_FINGERPRINT_SET_MISMATCH');
  }

  let matchedCount = 0;
  const seenBoardFingerprints = new Set();
  const tasks = board.tasks.map((task) => {
    if (task?.origin !== 'agentic_error_fixing_v1' || !records.has(task.diagnostic_fingerprint)) return task;
    if (seenBoardFingerprints.has(task.diagnostic_fingerprint)) {
      throw new Error('DIAGNOSTIC_RESOLUTION_BOARD_FINGERPRINT_AMBIGUOUS');
    }
    seenBoardFingerprints.add(task.diagnostic_fingerprint);
    const record = records.get(task.diagnostic_fingerprint);
    matchedCount += 1;
    return {
      ...task,
      diagnostic_resolution: {
        schema: 'atlas.svelte-check-diagnostic-board-resolution.v1',
        status: 'ABSENT_IN_CLEAN_CHECK',
        receiptSha256,
        previousRunId: receipt.previousRunId,
        currentRunId: receipt.currentRunId,
        checkerScopeId: receipt.checkerScopeId,
        completionAuthorized: false,
      },
      diagnostic_resolution_task_id: record.taskId,
    };
  });
  const matchedFingerprints = seenBoardFingerprints;
  const unmatchedFingerprints = fingerprints.filter((fingerprint) => !matchedFingerprints.has(fingerprint));
  return {
    board: { ...board, tasks },
    receiptSha256,
    resolvedCandidateCount: records.size,
    matchedCount,
    unmatchedFingerprints,
    boardTaskStatusesChanged: false,
    canonicalTaskStatusesChanged: false,
    completionAuthorized: false,
  };
}
