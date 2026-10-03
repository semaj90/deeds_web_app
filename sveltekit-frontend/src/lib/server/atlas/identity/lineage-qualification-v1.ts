import type { EvidenceEligibilityV1 } from './atlas-coordinate-v1.js';

/**
 * LINEAGE-QUALIFIER-01 — the one pure owner of "is this evidence qualified, and at what grain?". Feature producers, crosswalks and
 * audits consume this verdict instead of each re-implementing source_ref / revision / lineage joins.
 *
 *   packet match != chunk match != feature eligibility
 *
 * A packet can be exactly identified by packet_key and still be ineligible for any chunk-derived feature until a PROVEN,
 * revision-qualified packet->chunk membership exists. This function reads no database and writes nothing; callers pass rows in.
 *
 * Predicates for CHUNK qualification (all required, none substitutable):
 *   packet.packetKey == membership.packetKey
 *   membership.revisionStatus == 'PROVEN'
 *   membership.canonicalChunkId is not null
 *   membership.sourceRevision == expected.sourceRevision
 *   packet.workspaceRevisionKey == expected.workspaceRevision
 * NEVER substituted: same source path, same content hash, same packet_id, latest chunk, nearest revision.
 * `sourceRef` is carried as-is for evidence only; it is never a join key here.
 */
export interface LineagePacketV1 {
  packetKey: string;
  /** `atlas_packets.workspace_revision_key` (the admitted revision), NOT the legacy integer `workspace_revision`. */
  workspaceRevisionKey: string | null;
  sourceRevision: string | null;
  sourceRef: string | null;
}

export interface LineageMembershipV1 {
  packetKey: string;
  canonicalChunkId: string | null;
  revisionStatus: string;
  sourceRevision: string | null;
  lineageBindingChecksum?: string | null;
}

export interface ExpectedEvidenceCoordinateV1 {
  workspaceRevision: string;
  sourceRevision: string;
}

export type PacketIdentityStatusV1 = 'EXACT' | 'NOT_FOUND';
export type ChunkIdentityStatusV1 =
  | 'EXACT'
  | 'MISSING_LINEAGE'
  | 'SOURCE_REVISION_MISMATCH'
  | 'WORKSPACE_REVISION_MISMATCH'
  | 'AMBIGUOUS';

export interface EvidenceQualificationV1 {
  packetIdentity: { status: PacketIdentityStatusV1; packetKey: string | null };
  chunkIdentity: {
    status: ChunkIdentityStatusV1;
    /** Sorted, de-duplicated. Exactly one for EXACT; more than one for AMBIGUOUS (callers wanting set semantics must consume this list explicitly). */
    canonicalChunkIds: string[];
  };
  eligibility: EvidenceEligibilityV1;
  derivable: { packetDerived: boolean; chunkDerived: boolean };
  evidenceRefs: string[];
}

const present = (v: string | null | undefined): v is string => typeof v === 'string' && v.trim().length > 0;

export function qualifyEvidenceV1(input: {
  packet: LineagePacketV1 | null;
  memberships: readonly LineageMembershipV1[];
  expected: ExpectedEvidenceCoordinateV1;
}): EvidenceQualificationV1 {
  const { packet, memberships, expected } = input;
  const refs: string[] = [];
  const verdict = (
    packetStatus: PacketIdentityStatusV1,
    chunkStatus: ChunkIdentityStatusV1,
    ids: string[],
    eligibility: EvidenceEligibilityV1,
  ): EvidenceQualificationV1 => ({
    packetIdentity: { status: packetStatus, packetKey: packet?.packetKey ?? null },
    chunkIdentity: { status: chunkStatus, canonicalChunkIds: ids },
    eligibility,
    derivable: {
      packetDerived: eligibility === 'PACKET_REVISION_QUALIFIED' || eligibility === 'CHUNK_REVISION_QUALIFIED',
      chunkDerived: eligibility === 'CHUNK_REVISION_QUALIFIED',
    },
    evidenceRefs: refs,
  });

  if (!packet || !present(packet.packetKey)) {
    return verdict('NOT_FOUND', 'MISSING_LINEAGE', [], 'INELIGIBLE');
  }
  refs.push(`packet:${packet.packetKey}`);

  // Workspace is checked before source revision: a packet outside the expected workspace is not comparable at all.
  if (!present(packet.workspaceRevisionKey) || packet.workspaceRevisionKey !== expected.workspaceRevision) {
    return verdict('EXACT', 'WORKSPACE_REVISION_MISMATCH', [], 'DEGRADED');
  }
  if (!present(packet.sourceRevision) || packet.sourceRevision !== expected.sourceRevision) {
    return verdict('EXACT', 'SOURCE_REVISION_MISMATCH', [], 'DEGRADED');
  }

  const proven = memberships.filter((m) => m.packetKey === packet.packetKey && m.revisionStatus === 'PROVEN' && present(m.canonicalChunkId));
  if (proven.length === 0) {
    // Packet is revision-qualified; there is simply no proven lineage. Packet-grained features may proceed, chunk-grained may not.
    return verdict('EXACT', 'MISSING_LINEAGE', [], 'PACKET_REVISION_QUALIFIED');
  }

  const current = proven.filter((m) => m.sourceRevision === expected.sourceRevision);
  if (current.length === 0) {
    return verdict('EXACT', 'SOURCE_REVISION_MISMATCH', [], 'PACKET_REVISION_QUALIFIED');
  }

  const ids = [...new Set(current.map((m) => m.canonicalChunkId as string))].sort();
  for (const m of current) if (present(m.lineageBindingChecksum)) refs.push(`lineage:${m.lineageBindingChecksum}`);
  if (ids.length === 1) return verdict('EXACT', 'EXACT', ids, 'CHUNK_REVISION_QUALIFIED');
  return verdict('EXACT', 'AMBIGUOUS', ids, 'PACKET_REVISION_QUALIFIED');
}
