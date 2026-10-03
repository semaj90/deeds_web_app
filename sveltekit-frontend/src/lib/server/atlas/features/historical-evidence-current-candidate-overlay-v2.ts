import { candidateOrdinalMapChecksum, compareUtf8 } from './canonical-candidate-v1.js';

/**
 * HIST-EVIDENCE-OVERLAY (v2). One derived, NON-canonical resolution boundary from historical
 * evidence (legacy summary HINTs, MapReduce records, later AST/ontology observations) onto the
 * current CandidateOrdinal universe through exact current PROVEN chunk lineage.
 *
 * Set-valued by design: a file-grained historical record legitimately projects onto 0..N current
 * chunks. There is intentionally NO 1:1 "resolve to candidate" helper. The overlay never upgrades
 * historical evidence into a current feature value.
 */
export const HISTORICAL_EVIDENCE_OVERLAY_SCHEMA_V2 = 'atlas.historical-evidence-current-candidate-overlay.v2' as const;

export type HistoricalEvidenceKindV2 = 'LEGACY_SUMMARY_HINT' | 'MAPREDUCE_RECORD' | 'HISTORICAL_AST_OBSERVATION';
export type HistoricalEvidenceGranularityV2 = 'FILE' | 'PACKET' | 'CHUNK';
export type HistoricalResolutionStateV2 =
  | 'EXACT_CHUNK'
  | 'CURRENT_CHUNK_SET'
  | 'SOURCE_REVISION_CHANGED'
  | 'CURRENT_PACKET_NOT_FOUND'
  | 'CURRENT_PROVEN_LINEAGE_MISSING'
  | 'HISTORICAL_IDENTITY_INSUFFICIENT'
  | 'DUPLICATE_HISTORICAL_EVIDENCE';

export interface CurrentCandidateV2 {
  candidateOrdinal: number;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
}
export interface CurrentChunkMembershipV2 {
  candidateOrdinal: number;
  chunkRowId: string;
  canonicalChunkId: string;
}
export interface CurrentCandidateIndexV2 {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  candidates: readonly CurrentCandidateV2[];
  memberships: readonly CurrentChunkMembershipV2[];
}

export interface HistoricalEvidenceInputV2 {
  evidenceId: string;
  evidenceKind: HistoricalEvidenceKindV2;
  evidenceGranularity: HistoricalEvidenceGranularityV2;
  historicalArtifactRevision: string;
  historicalEvidenceDigest: string;
  sourceRef: string | null;
  sourceRevision: string | null;
  /** Required for CHUNK granularity. */
  chunk?: { chunkRowId: string; canonicalChunkId: string; packetKey?: string | null } | null;
  /** Set when an earlier record already carries the same historical identity. */
  duplicateOfEvidenceId?: string | null;
  evidenceRefs?: readonly string[];
}

export interface HistoricalEvidenceCurrentCandidateOverlayV2 {
  schema: typeof HISTORICAL_EVIDENCE_OVERLAY_SCHEMA_V2;
  evidenceId: string;
  evidenceKind: HistoricalEvidenceKindV2;
  evidenceGranularity: HistoricalEvidenceGranularityV2;
  historicalArtifactRevision: string;
  historicalEvidenceDigest: string;
  sourceRef: string | null;
  sourceRevision: string | null;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  resolution: {
    state: HistoricalResolutionStateV2;
    /** Authoritative, sorted (candidateOrdinal, chunkRowId, canonicalChunkId), de-duplicated. */
    memberships: CurrentChunkMembershipV2[];
    /** Derived views of `memberships`, recomputed on verify. */
    candidateOrdinals: number[];
    chunkRowIds: string[];
    canonicalChunkIds: string[];
    duplicateOfEvidenceId: string | null;
  };
  evidenceRefs: string[];
  overlayChecksum: string;
  canonicalAuthority: false;
  retrievalVote: false;
}

const membershipKey = (m: CurrentChunkMembershipV2) => `${m.candidateOrdinal}\0${m.chunkRowId}\0${m.canonicalChunkId}`;

/** candidateOrdinal ASC, chunkRowId ASC, canonicalChunkId ASC; duplicates removed. */
export function normalizeMembershipsV2(input: readonly CurrentChunkMembershipV2[]): CurrentChunkMembershipV2[] {
  const seen = new Map<string, CurrentChunkMembershipV2>();
  for (const m of input) seen.set(membershipKey(m), { candidateOrdinal: m.candidateOrdinal, chunkRowId: m.chunkRowId, canonicalChunkId: m.canonicalChunkId });
  return [...seen.values()].sort((a, b) =>
    a.candidateOrdinal - b.candidateOrdinal || compareUtf8(a.chunkRowId, b.chunkRowId) || compareUtf8(a.canonicalChunkId, b.canonicalChunkId));
}

function deriveViews(memberships: readonly CurrentChunkMembershipV2[]) {
  return {
    candidateOrdinals: [...new Set(memberships.map((m) => m.candidateOrdinal))].sort((a, b) => a - b),
    chunkRowIds: [...new Set(memberships.map((m) => m.chunkRowId))].sort(compareUtf8),
    canonicalChunkIds: [...new Set(memberships.map((m) => m.canonicalChunkId))].sort(compareUtf8),
  };
}

function checksumBody(o: Omit<HistoricalEvidenceCurrentCandidateOverlayV2, 'overlayChecksum'>) {
  return candidateOrdinalMapChecksum(o);
}

/** Validates an index is internally consistent before anything resolves against it. */
export function assertCurrentCandidateIndexV2(index: CurrentCandidateIndexV2): void {
  if (!index.candidateSnapshotRevision || !/^[0-9a-f]{64}$/i.test(index.ordinalMapChecksum.replace(/^sha256:/, ''))) throw new Error('HIST_OVERLAY_INDEX_COORDINATES_INVALID');
  const ordinals = new Set<number>();
  for (const c of index.candidates) {
    if (ordinals.has(c.candidateOrdinal)) throw new Error(`HIST_OVERLAY_INDEX_DUPLICATE_ORDINAL:${c.candidateOrdinal}`);
    ordinals.add(c.candidateOrdinal);
  }
  const seen = new Set<string>();
  for (const m of index.memberships) {
    if (!ordinals.has(m.candidateOrdinal)) throw new Error(`HIST_OVERLAY_INDEX_MEMBERSHIP_ORPHAN:${m.candidateOrdinal}`);
    const k = membershipKey(m);
    if (seen.has(k)) throw new Error('HIST_OVERLAY_INDEX_DUPLICATE_MEMBERSHIP');
    seen.add(k);
  }
}

/**
 * Set-valued resolution. Historical evidence resolves to 0..N current (candidate, chunk) memberships.
 * CHUNK granularity + exact lineage -> EXACT_CHUNK; FILE/PACKET granularity -> CURRENT_CHUNK_SET.
 */
export function resolveHistoricalEvidenceToCandidates(
  evidence: HistoricalEvidenceInputV2,
  index: CurrentCandidateIndexV2,
): HistoricalEvidenceCurrentCandidateOverlayV2 {
  let state: HistoricalResolutionStateV2;
  let memberships: CurrentChunkMembershipV2[] = [];
  const duplicateOf = evidence.duplicateOfEvidenceId ?? null;

  const chunkRequired = evidence.evidenceGranularity === 'CHUNK';
  if (duplicateOf) {
    state = 'DUPLICATE_HISTORICAL_EVIDENCE';
  } else if (!evidence.sourceRef || !evidence.sourceRevision || (chunkRequired && (!evidence.chunk?.chunkRowId || !evidence.chunk?.canonicalChunkId))) {
    state = 'HISTORICAL_IDENTITY_INSUFFICIENT';
  } else {
    const bySource = index.candidates.filter((c) => c.sourceRef === evidence.sourceRef);
    const exact = bySource.filter((c) => c.sourceRevision === evidence.sourceRevision);
    if (bySource.length === 0) state = 'CURRENT_PACKET_NOT_FOUND';
    else if (exact.length === 0) state = 'SOURCE_REVISION_CHANGED';
    else {
      const ordinals = new Set(exact.map((c) => c.candidateOrdinal));
      let current = index.memberships.filter((m) => ordinals.has(m.candidateOrdinal));
      if (chunkRequired) {
        const packetKey = evidence.chunk?.packetKey ?? null;
        const packetOrdinals = packetKey ? new Set(exact.filter((c) => c.packetKey === packetKey).map((c) => c.candidateOrdinal)) : ordinals;
        current = current.filter((m) => packetOrdinals.has(m.candidateOrdinal)
          && m.chunkRowId === evidence.chunk!.chunkRowId && m.canonicalChunkId === evidence.chunk!.canonicalChunkId);
      }
      memberships = normalizeMembershipsV2(current);
      state = memberships.length === 0 ? 'CURRENT_PROVEN_LINEAGE_MISSING' : chunkRequired ? 'EXACT_CHUNK' : 'CURRENT_CHUNK_SET';
      if (state === 'EXACT_CHUNK' && memberships.length !== 1) throw new Error('HIST_OVERLAY_EXACT_CHUNK_NOT_SINGLE');
    }
  }

  const body: Omit<HistoricalEvidenceCurrentCandidateOverlayV2, 'overlayChecksum'> = {
    schema: HISTORICAL_EVIDENCE_OVERLAY_SCHEMA_V2,
    evidenceId: evidence.evidenceId,
    evidenceKind: evidence.evidenceKind,
    evidenceGranularity: evidence.evidenceGranularity,
    historicalArtifactRevision: evidence.historicalArtifactRevision,
    historicalEvidenceDigest: evidence.historicalEvidenceDigest,
    sourceRef: evidence.sourceRef,
    sourceRevision: evidence.sourceRevision,
    candidateSnapshotRevision: index.candidateSnapshotRevision,
    ordinalMapChecksum: index.ordinalMapChecksum,
    resolution: { state, memberships, ...deriveViews(memberships), duplicateOfEvidenceId: duplicateOf },
    evidenceRefs: [...new Set(evidence.evidenceRefs ?? [])].sort(compareUtf8),
    canonicalAuthority: false,
    retrievalVote: false,
  };
  return { ...body, overlayChecksum: checksumBody(body) };
}

/** Rejects tampering, wrong coordinates, unsorted/duplicated sets, and authority upgrades. */
export function verifyHistoricalEvidenceOverlayV2(
  overlay: HistoricalEvidenceCurrentCandidateOverlayV2,
  expected: { candidateSnapshotRevision: string; ordinalMapChecksum: string },
): void {
  if (overlay.schema !== HISTORICAL_EVIDENCE_OVERLAY_SCHEMA_V2) throw new Error('HIST_OVERLAY_SCHEMA_INVALID');
  if (overlay.canonicalAuthority !== false || overlay.retrievalVote !== false) throw new Error('HIST_OVERLAY_AUTHORITY_UPGRADE_REJECTED');
  if (overlay.candidateSnapshotRevision !== expected.candidateSnapshotRevision) throw new Error('HIST_OVERLAY_SNAPSHOT_MISMATCH');
  if (overlay.ordinalMapChecksum !== expected.ordinalMapChecksum) throw new Error('HIST_OVERLAY_ORDINAL_MAP_MISMATCH');
  const r = overlay.resolution;
  const normalized = normalizeMembershipsV2(r.memberships);
  if (JSON.stringify(normalized) !== JSON.stringify(r.memberships)) throw new Error('HIST_OVERLAY_MEMBERSHIP_ORDER_OR_DUPLICATE');
  if (JSON.stringify(deriveViews(r.memberships)) !== JSON.stringify({ candidateOrdinals: r.candidateOrdinals, chunkRowIds: r.chunkRowIds, canonicalChunkIds: r.canonicalChunkIds })) throw new Error('HIST_OVERLAY_DERIVED_VIEW_MISMATCH');
  const hasSet = r.state === 'EXACT_CHUNK' || r.state === 'CURRENT_CHUNK_SET';
  if (hasSet !== (r.memberships.length > 0)) throw new Error('HIST_OVERLAY_STATE_MEMBERSHIP_MISMATCH');
  if (r.state === 'EXACT_CHUNK' && (r.memberships.length !== 1 || overlay.evidenceGranularity !== 'CHUNK')) throw new Error('HIST_OVERLAY_EXACT_CHUNK_INVALID');
  if (r.state === 'CURRENT_CHUNK_SET' && overlay.evidenceGranularity === 'CHUNK') throw new Error('HIST_OVERLAY_CHUNK_GRANULARITY_UPGRADE_REJECTED');
  const { overlayChecksum, ...body } = overlay;
  if (checksumBody(body) !== overlayChecksum) throw new Error('HIST_OVERLAY_CHECKSUM_MISMATCH');
}

/** Order-independent checksum of a whole overlay set (replay/parity proof). */
export function historicalEvidenceOverlaySetChecksumV2(overlays: readonly HistoricalEvidenceCurrentCandidateOverlayV2[]): string {
  return candidateOrdinalMapChecksum([...overlays].map((o) => [o.evidenceId, o.overlayChecksum]).sort((a, b) => compareUtf8(a[0]!, b[0]!)));
}
