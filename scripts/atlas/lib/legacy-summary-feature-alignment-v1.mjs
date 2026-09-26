const CHUNK_LINEAGE_REF = 'atlas_packet_chunk_lineage:';

/** Pure ordinal-complete input/mask builder. It deliberately does not score cosine. */
export function buildLegacySummaryFeatureAlignmentV1({ candidates, alignedHints, qualityPolicyRevision, ordinalMapChecksum }) {
  if (!Array.isArray(candidates) || !(alignedHints instanceof Map) || !qualityPolicyRevision || !ordinalMapChecksum) {
    throw new Error('FEATURE_ALIGNMENT_INPUTS_REQUIRED');
  }
  if ([...alignedHints.keys()].some((ordinal) => !Number.isInteger(ordinal) || ordinal < 0 || ordinal >= candidates.length)) {
    throw new Error('ALIGNED_ORDINAL_OUT_OF_RANGE');
  }
  return candidates.map((candidate, ordinal) => {
    const chunkRef = candidate.evidenceRefs?.find((ref) => ref.startsWith(CHUNK_LINEAGE_REF));
    const chunkRowId = chunkRef?.slice(CHUNK_LINEAGE_REF.length) ?? null;
    if (!chunkRowId) throw new Error(`CANDIDATE_CHUNK_LINEAGE_REF_MISSING:${ordinal}`);
    const identity = {
      candidateOrdinal: ordinal,
      candidateSnapshotRevision: candidate.candidateSnapshotRevision,
      ordinalMapChecksum,
      chunkRowId,
      canonicalChunkId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
    };
    const aligned = alignedHints.get(ordinal);
    if (!aligned) return {
      schema: 'atlas.legacy-summary-cosine-input.v1', ...identity,
      summaryDigest: null, summaryVectorDigest: null, vectorArtifact: null,
      hintClass: null, qualityPolicyRevision, state: 'UNAVAILABLE',
      unavailableReason: 'NO_CLEAN_LINEAGE_BOUND_HINT_IN_FROZEN_COHORT',
      rawCosine: null, score01: null,
      evidenceRefs: [`candidate-ordinal:${ordinal}`, `candidate-snapshot:${identity.candidateSnapshotRevision}`],
      canonicalAuthority: false, retrievalVote: false, rankingPromotion: false,
    };

    const { hint, vectorDigest } = aligned;
    if (hint.candidateOrdinal !== ordinal || hint.chunkRowId !== chunkRowId
      || hint.canonicalChunkId !== identity.canonicalChunkId || hint.packetKey !== identity.packetKey
      || hint.sourceRef !== identity.sourceRef || hint.sourceRevision !== identity.sourceRevision
      || hint.workspaceRevision !== identity.workspaceRevision
      || hint.candidateSnapshotRevision !== identity.candidateSnapshotRevision
      || hint.ordinalMapChecksum !== identity.ordinalMapChecksum
      || hint.trust !== 'LEGACY_HINT_LINEAGE_BOUND'
      || !/^sha256:[0-9a-f]{64}$/.test(hint.summaryDigest)
      || !/^sha256:[0-9a-f]{64}$/.test(vectorDigest)
      || !Number.isInteger(hint.vectorIndexRow) || hint.vectorIndexRow < 0
      || !Number.isInteger(hint.vectorByteOffset) || hint.vectorByteOffset < 0) {
      throw new Error(`ALIGNED_HINT_IDENTITY_INVALID:${ordinal}`);
    }
    return {
      schema: 'atlas.legacy-summary-cosine-input.v1', ...identity,
      summaryDigest: hint.summaryDigest, summaryVectorDigest: vectorDigest,
      vectorArtifact: { path: 'vectors.f32', row: hint.vectorIndexRow, byteOffset: hint.vectorByteOffset, dimensions: 768, dtype: 'f32le' },
      hintClass: 'LEGACY_HINT_LINEAGE_BOUND', qualityPolicyRevision,
      state: 'PENDING_QUERY_VECTOR', rawCosine: null, score01: null,
      evidenceRefs: [`legacy-summary-digest:${hint.summaryDigest}`, `candidate-ordinal:${ordinal}`, `candidate-snapshot:${identity.candidateSnapshotRevision}`],
      canonicalAuthority: false, retrievalVote: false, rankingPromotion: false,
    };
  });
}
