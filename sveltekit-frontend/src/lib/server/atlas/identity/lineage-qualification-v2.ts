import type { EvidenceEligibilityV1 } from './atlas-coordinate-v1.js';

/** V2 consumes already joined authority records; it does not perform identity normalization or datastore access. */
export interface CurrentSourceBindingV2 {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  bindingChecksum: string;
}

export interface PacketLineageIdentityV2 {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  /** Legacy packet workspace mirror is diagnostic only and may be null. */
  workspaceRevisionMirror: string | null;
}

export interface PacketChunkMembershipV2 {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  membershipStatus: string;
  revisionStatus: string;
  chunkRowId: string;
  canonicalChunkId: string;
  lineageProducerRevision: string | null;
  lineageBindingChecksum: string | null;
}

export interface IndexedChunkEvidenceV2 {
  id: string;
  canonicalChunkId: string;
  sourceRef: string;
  fileContentHash: string | null;
  /** Nullable row mirrors are diagnostics, never authority. */
  sourceRevisionMirror: string | null;
  workspaceRevisionMirror: string | null;
  contentEmbeddingPresent: boolean;
  summaryTextPresent: boolean;
  summaryEmbeddingPresent: boolean;
  summaryEmbeddingAdmissionBound: boolean;
}

export type IndependentReadinessV2 = 'AVAILABLE' | 'MISSING' | 'UNQUALIFIED';
export type ChunkQualificationStatusV2 =
  | 'CHUNK_REVISION_QUALIFIED'
  | 'PACKET_NOT_FOUND'
  | 'SOURCE_BINDING_MISSING'
  | 'SOURCE_BINDING_MISMATCH'
  | 'LINEAGE_MISSING'
  | 'LINEAGE_SOURCE_REF_MISMATCH'
  | 'LINEAGE_SOURCE_REVISION_MISMATCH'
  | 'LINEAGE_STATUS_NOT_PROVEN'
  | 'MEMBERSHIP_STATUS_MISMATCH'
  | 'CHUNK_ROW_MISMATCH'
  | 'CHUNK_SOURCE_DIGEST_MISMATCH'
  | 'CANONICAL_CHUNK_MISMATCH'
  | 'AMBIGUOUS_LINEAGE';

export interface EvidenceQualificationV2 {
  packetState: 'PACKET_REVISION_QUALIFIED' | 'PACKET_NOT_FOUND' | 'PACKET_BINDING_MISMATCH';
  chunkState: ChunkQualificationStatusV2;
  semantic768State: IndependentReadinessV2;
  summaryState: IndependentReadinessV2;
  summarySemanticState: 'AVAILABLE' | 'MISSING' | 'UNBOUND';
  eligibility: EvidenceEligibilityV1;
  lineageDiagnostic: {
    chunkSourceRevisionMirror: string | null;
    chunkWorkspaceRevisionMirror: string | null;
    mirrorsRequired: false;
  };
  evidenceRefs: string[];
}

const present = (value: string | null | undefined): value is string => typeof value === 'string' && value.length > 0;

/** Exact source-binding → packet → PROVEN lineage → indexed row qualification. Null chunk revision mirrors do not block. */
export function qualifyEvidenceV2(input: {
  expectedWorkspaceRevision: string;
  expectedMembershipStatus: string;
  expectedChunkRowId: string;
  expectedCanonicalChunkId: string;
  sourceBinding: CurrentSourceBindingV2 | null;
  packet: PacketLineageIdentityV2 | null;
  memberships: readonly PacketChunkMembershipV2[];
  indexedChunks: readonly IndexedChunkEvidenceV2[];
}): EvidenceQualificationV2 {
  const { sourceBinding: binding, packet, memberships, indexedChunks } = input;
  const evidenceRefs: string[] = [];
  const empty = (packetState: EvidenceQualificationV2['packetState'], chunkState: ChunkQualificationStatusV2): EvidenceQualificationV2 => ({
    packetState,
    chunkState,
    semantic768State: indexedChunks.some((row) => row.contentEmbeddingPresent) ? 'UNQUALIFIED' : 'MISSING',
    summaryState: indexedChunks.some((row) => row.summaryTextPresent) ? 'UNQUALIFIED' : 'MISSING',
    summarySemanticState: indexedChunks.some((row) => row.summaryEmbeddingPresent) ? 'UNBOUND' : 'MISSING',
    eligibility: packetState === 'PACKET_NOT_FOUND' ? 'INELIGIBLE' : 'DEGRADED',
    lineageDiagnostic: { chunkSourceRevisionMirror: null, chunkWorkspaceRevisionMirror: null, mirrorsRequired: false },
    evidenceRefs,
  });

  if (!packet || !present(packet.packetKey)) return empty('PACKET_NOT_FOUND', 'PACKET_NOT_FOUND');
  evidenceRefs.push(`packet:${packet.packetKey}`);
  if (!binding) return empty('PACKET_BINDING_MISMATCH', 'SOURCE_BINDING_MISSING');
  evidenceRefs.push(`source-binding:${binding.bindingChecksum}`);
  if (packet.packetKey !== binding.packetKey || packet.sourceRef !== binding.sourceRef || packet.sourceRevision !== binding.sourceRevision
    || binding.workspaceRevision !== input.expectedWorkspaceRevision) {
    return empty('PACKET_BINDING_MISMATCH', 'SOURCE_BINDING_MISMATCH');
  }

  const packetState: EvidenceQualificationV2['packetState'] = 'PACKET_REVISION_QUALIFIED';
  const packetMemberships = memberships.filter((m) => m.packetKey === binding.packetKey);
  if (packetMemberships.length === 0) {
    return { ...empty(packetState, 'LINEAGE_MISSING'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  }
  const sourceRefMemberships = packetMemberships.filter((m) => m.sourceRef === binding.sourceRef);
  if (sourceRefMemberships.length === 0) return { ...empty(packetState, 'LINEAGE_SOURCE_REF_MISMATCH'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  const currentRevisionMemberships = sourceRefMemberships.filter((m) => m.sourceRevision === binding.sourceRevision);
  if (currentRevisionMemberships.length === 0) return { ...empty(packetState, 'LINEAGE_SOURCE_REVISION_MISMATCH'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  const candidates = currentRevisionMemberships.filter((m) => m.chunkRowId === input.expectedChunkRowId);
  if (candidates.length === 0) {
    if (currentRevisionMemberships.some((m) => m.canonicalChunkId === input.expectedCanonicalChunkId)) {
      return { ...empty(packetState, 'CHUNK_ROW_MISMATCH'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
    }
    return { ...empty(packetState, 'LINEAGE_MISSING'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  }
  if (candidates.length !== 1) return { ...empty(packetState, 'AMBIGUOUS_LINEAGE'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  const lineage = candidates[0]!;
  if (lineage.canonicalChunkId !== input.expectedCanonicalChunkId) return { ...empty(packetState, 'CANONICAL_CHUNK_MISMATCH'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  if (lineage.revisionStatus !== 'PROVEN') return { ...empty(packetState, 'LINEAGE_STATUS_NOT_PROVEN'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  if (lineage.membershipStatus !== input.expectedMembershipStatus) return { ...empty(packetState, 'MEMBERSHIP_STATUS_MISMATCH'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };

  const rows = indexedChunks.filter((row) => row.id === lineage.chunkRowId);
  if (rows.length !== 1) return { ...empty(packetState, rows.length === 0 ? 'CHUNK_ROW_MISMATCH' : 'AMBIGUOUS_LINEAGE'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  const chunk = rows[0]!;
  if (chunk.canonicalChunkId !== lineage.canonicalChunkId || chunk.sourceRef !== binding.sourceRef) {
    return { ...empty(packetState, 'CANONICAL_CHUNK_MISMATCH'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  }
  const revisionDigest = binding.sourceRevision.startsWith('sha256:') ? binding.sourceRevision.slice(7) : null;
  if (revisionDigest && chunk.fileContentHash !== revisionDigest) {
    return { ...empty(packetState, 'CHUNK_SOURCE_DIGEST_MISMATCH'), packetState, eligibility: 'PACKET_REVISION_QUALIFIED' };
  }
  if (present(lineage.lineageBindingChecksum)) evidenceRefs.push(`lineage:${lineage.lineageBindingChecksum}`);
  if (present(lineage.lineageProducerRevision)) evidenceRefs.push(`lineage-producer:${lineage.lineageProducerRevision}`);
  evidenceRefs.push(`codebase-chunk-index:${chunk.id}`);

  return {
    packetState,
    chunkState: 'CHUNK_REVISION_QUALIFIED',
    semantic768State: chunk.contentEmbeddingPresent ? 'AVAILABLE' : 'MISSING',
    summaryState: chunk.summaryTextPresent ? 'AVAILABLE' : 'MISSING',
    summarySemanticState: chunk.summaryEmbeddingAdmissionBound ? 'AVAILABLE' : chunk.summaryEmbeddingPresent ? 'UNBOUND' : 'MISSING',
    eligibility: 'CHUNK_REVISION_QUALIFIED',
    lineageDiagnostic: {
      chunkSourceRevisionMirror: chunk.sourceRevisionMirror,
      chunkWorkspaceRevisionMirror: chunk.workspaceRevisionMirror,
      mirrorsRequired: false,
    },
    evidenceRefs,
  };
}
