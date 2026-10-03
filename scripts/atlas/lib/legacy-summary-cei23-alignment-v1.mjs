export const LEGACY_SUMMARY_ALIGNMENT_STATUSES_V1 = Object.freeze([
  'EXACT_CURRENT_CANDIDATE_MATCH',
  'CURRENT_CANDIDATE_NOT_FOUND',
  'SOURCE_REVISION_MISMATCH',
  'WORKSPACE_REVISION_MISMATCH',
  'CHUNK_IDENTITY_MISMATCH',
  'SUMMARY_DIGEST_MISMATCH',
  'DUPLICATE_OR_AMBIGUOUS_MATCH',
]);

export function alignLegacyHintToCandidateV1(hint, candidates) {
  const packetSource = candidates.filter((row) => row.packetKey === hint.packetKey && row.sourceRef === hint.sourceRef);
  if (packetSource.length > 1) return { status: 'DUPLICATE_OR_AMBIGUOUS_MATCH', candidateOrdinals: packetSource.map((x) => x.candidateOrdinal), reasons: ['PACKET_SOURCE_NOT_UNIQUE'] };
  if (!packetSource.length) {
    const sourceRef = candidates.filter((row) => row.sourceRef === hint.sourceRef);
    if (!sourceRef.length) return { status: 'CURRENT_CANDIDATE_NOT_FOUND', candidateOrdinals: [], reasons: ['SOURCE_REF_NOT_IN_CE23_MAP'] };
    if (!sourceRef.some((row) => row.sourceRevision === hint.sourceRevision)) return { status: 'SOURCE_REVISION_MISMATCH', candidateOrdinals: sourceRef.map((x) => x.candidateOrdinal), reasons: ['SOURCE_REVISION_DIFFERS'] };
    if (!sourceRef.some((row) => row.workspaceRevision === hint.workspaceRevision)) return { status: 'WORKSPACE_REVISION_MISMATCH', candidateOrdinals: sourceRef.map((x) => x.candidateOrdinal), reasons: ['WORKSPACE_REVISION_DIFFERS'] };
    return { status: 'CURRENT_CANDIDATE_NOT_FOUND', candidateOrdinals: sourceRef.map((x) => x.candidateOrdinal), reasons: ['PACKET_KEY_NOT_IN_CE23_MAP'] };
  }
  const row = packetSource[0];
  if (row.sourceRevision !== hint.sourceRevision) return { status: 'SOURCE_REVISION_MISMATCH', candidateOrdinals: [row.candidateOrdinal], reasons: ['SOURCE_REVISION_DIFFERS'] };
  if (row.workspaceRevision !== hint.workspaceRevision) return { status: 'WORKSPACE_REVISION_MISMATCH', candidateOrdinals: [row.candidateOrdinal], reasons: ['WORKSPACE_REVISION_DIFFERS'] };
  const lacksChunkCoordinate = !row.chunkRowId || !row.canonicalChunkId;
  if (lacksChunkCoordinate || row.chunkRowId !== hint.chunkRowId || row.canonicalChunkId !== hint.canonicalChunkId) {
    return { status: 'CHUNK_IDENTITY_MISMATCH', candidateOrdinals: [row.candidateOrdinal], reasons: [lacksChunkCoordinate ? 'CEI23_ORDINAL_ROW_HAS_NO_CHUNK_IDENTITY' : 'CHUNK_IDENTITY_DIFFERS'] };
  }
  if (!row.summaryDigest || row.summaryDigest !== hint.summaryDigest) return { status: 'SUMMARY_DIGEST_MISMATCH', candidateOrdinals: [row.candidateOrdinal], reasons: [!row.summaryDigest ? 'CEI23_ORDINAL_ROW_HAS_NO_SUMMARY_DIGEST' : 'SUMMARY_DIGEST_DIFFERS'] };
  return { status: 'EXACT_CURRENT_CANDIDATE_MATCH', candidateOrdinals: [row.candidateOrdinal], reasons: [] };
}

export function buildLegacySummaryAlignmentV1(hints, candidates) {
  const rows = hints.map((hint) => {
    const aligned = alignLegacyHintToCandidateV1(hint, candidates);
    return { chunkRowId: hint.chunkRowId, canonicalChunkId: hint.canonicalChunkId, packetKey: hint.packetKey,
      sourceRef: hint.sourceRef, sourceRevision: hint.sourceRevision, workspaceRevision: hint.workspaceRevision,
      summaryDigest: hint.summaryDigest,
      candidateOrdinal: aligned.status === 'EXACT_CURRENT_CANDIDATE_MATCH' ? aligned.candidateOrdinals[0] : null,
      candidateOrdinalCandidate: aligned.candidateOrdinals.length === 1 ? aligned.candidateOrdinals[0] : null,
      status: aligned.status, reasons: aligned.reasons };
  });
  const counts = Object.fromEntries(LEGACY_SUMMARY_ALIGNMENT_STATUSES_V1.map((status) => [status, rows.filter((r) => r.status === status).length]));
  return { rows, counts, conserved: rows.length === hints.length && Object.values(counts).reduce((a, b) => a + b, 0) === hints.length };
}
