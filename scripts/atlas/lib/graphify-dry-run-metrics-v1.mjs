export function coverageMetric(numerator, denominator) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0 || denominator < 0) {
    return { status: 'INVALID_COUNTS', numerator, denominator, percent: null };
  }
  if (denominator === 0) return { status: 'NO_DENOMINATOR', numerator, denominator, percent: null };
  if (numerator > denominator) return { status: 'IDENTITY_DEDUP_REQUIRED', numerator, denominator, percent: null };
  return { status: 'MEASURED', numerator, denominator, percent: Number((numerator / denominator * 100).toFixed(1)) };
}

export function bm25ExecutionCounts(candidateCount, rowsWritten, apply) {
  return {
    bm25Candidates: candidateCount,
    bm25WouldBackfill: apply ? 0 : candidateCount,
    bm25RowsWritten: apply ? rowsWritten : 0,
  };
}
