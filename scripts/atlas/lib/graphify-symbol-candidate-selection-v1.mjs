/**
 * Frozen exclusions for generated/test JSON artifacts. These are useful retrieval artifacts, but
 * not authored symbol-source files; their own producer/receipt owns their structure. Keep this
 * exact policy shared by candidate selection and the admission audit.
 */
export const GRAPHIFY_SYMBOL_EXCLUDED_ARTIFACT_REGEX_V1 = String.raw`(?:^|/)(?:memory/.*\.json$|drizzle/meta/[0-9]+_snapshot\.json$|vectors/content_768_f32_row_map\.json$|phase110_ground_truth/.*\.json$|static/phase72/route-ast-graph\.json$|scripts/atlas/\.stage1-prior-snapshot\.json$|unreachable-classified\.json$)`;

export function isGraphifySymbolExcludedArtifactV1(sourceRef) {
  const normalized = String(sourceRef ?? '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  return new RegExp(GRAPHIFY_SYMBOL_EXCLUDED_ARTIFACT_REGEX_V1, 'i').test(normalized);
}

/** Select a bounded extractor batch without letting unsupported refs consume its limit. */
export function selectBoundedSupportedExtractorCandidates(rows, classifySourceRef, limit, checkSourceRevision = null) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('EXTRACTOR_CANDIDATE_LIMIT_INVALID');
  }

  const supportedPool = rows
    .map((row) => ({ row, kind: classifySourceRef(row.source_ref) }))
    .filter((entry) => entry.kind !== 'unsupported' && !isGraphifySymbolExcludedArtifactV1(entry.row.source_ref));

  const candidates = [];
  let precheckRowsExamined = 0;
  let precheckRevisionMismatchRows = 0;
  let precheckMissingSourceRows = 0;
  let precheckReadErrorRows = 0;
  const sourceRevisionRejectSample = [];

  for (const entry of supportedPool) {
    if (candidates.length >= limit) break;
    precheckRowsExamined += 1;
    const eligibility = checkSourceRevision ? checkSourceRevision(entry.row) : true;
    if (eligibility === false) {
      precheckRevisionMismatchRows += 1;
      if (sourceRevisionRejectSample.length < 25) sourceRevisionRejectSample.push(entry.row.source_ref);
      continue;
    }
    if (eligibility === 'MISSING') {
      precheckMissingSourceRows += 1;
      continue;
    }
    if (eligibility === 'READ_ERROR') {
      precheckReadErrorRows += 1;
      continue;
    }
    candidates.push(entry);
  }

  return {
    candidates,
    candidatePoolRows: rows.length,
    supportedCandidatePoolRows: supportedPool.length,
    skippedUnsupported: rows.length - supportedPool.length,
    precheckRowsExamined,
    precheckRevisionMismatchRows,
    precheckMissingSourceRows,
    precheckReadErrorRows,
    sourceRevisionRejectSample,
  };
}
