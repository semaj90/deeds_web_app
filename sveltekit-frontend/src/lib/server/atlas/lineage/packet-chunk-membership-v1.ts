import { z } from 'zod';

/**
 * PACKET-CHUNK-LINEAGE-CONTRACT-01 (frozen).
 *
 * atlas_packets stays FILE-granularity (one row per source_ref). A file
 * packet's relationship to codebase_chunk_index rows is LINEAGE MEMBERSHIP,
 * not identity equality: packet identity != chunk identity. A 37-chunk file
 * is 1 atlas_packets row + up to 37 PacketChunkMembershipV1 rows, never 37
 * packets and never 1 packet arbitrarily bound to a single "representative"
 * chunk.
 *
 * This table holds PROVEN memberships only. Unresolved/ambiguous candidates
 * (NO_MEMBER, NAMESPACE_UNPROVEN, CONFLICTING_MEMBERSHIP per
 * PACKET-CHUNK-LINEAGE-BACKFILL-SCOPE-01's classification) do not get rows
 * here -- they belong in receipts/reports or a separate candidate table.
 * A row existing in this table asserts: this packet<->chunk membership is
 * real and this packet's sourceNamespace is known. revisionStatus may still
 * be UNPROVEN -- that is an honest, admissible state, not a reason to
 * exclude the row (per PACKET-SOURCE-REVISION-OWNER-01: real revision
 * authority exists but only covers ~1.3% of the corpus; UNPROVEN is the
 * expected common case for legacy data, not an edge case).
 *
 * Hard rule (the canonical-id-hierarchy.ts / backfill-unified-id-hierarchy.mjs
 * landmine this contract exists to prevent repeating): canonicalChunkId MUST
 * originate from an existing codebase_chunk_index.chunk_id value read at
 * write time. It MUST NOT be produced via randomUUID(), a hash of sourceRef,
 * tree_node_id, a Qdrant point id, or nearest-match/AST-derived inference.
 * This file cannot enforce that at the type level (it requires a live DB
 * read) -- callers (the future-capture writer and the historical backfill,
 * once built) are responsible for sourcing canonicalChunkId from a real row
 * and must not construct this schema from any other origin.
 */

const nonEmptyString = z.string().min(1);

export const PacketChunkMembershipStatusSchema = z.enum(['EXACT_SINGLE_MEMBER', 'EXACT_MULTI_MEMBER']);
export type PacketChunkMembershipStatus = z.infer<typeof PacketChunkMembershipStatusSchema>;

export const PacketChunkRevisionStatusSchema = z.enum(['PROVEN', 'UNPROVEN']);
export type PacketChunkRevisionStatus = z.infer<typeof PacketChunkRevisionStatusSchema>;

export const PacketChunkMembershipV1Schema = z
  .object({
    schema: z.literal('atlas.packet-chunk-membership.v1'),
    packetKey: nonEmptyString,
    /** codebase_chunk_index.chunk_id -- durable, content-derived identity. The lineage identity. */
    canonicalChunkId: nonEmptyString,
    /** codebase_chunk_index.id -- uuid row PK. Physical coordinate only, never treated as canonical identity. */
    chunkRowId: nonEmptyString,
    sourceRef: nonEmptyString,
    /**
     * Real namespace authority only (e.g. graphify_files.workspace_id).
     * NEVER atlas_packets.repository_id -- confirmed corrupted in
     * PACKET-SOURCE-REVISION-OWNER-01 (58,365/58,365 populated values were
     * all distinct: a synthetic randomUUID()-per-row, not a shared namespace).
     * A row cannot be admitted into this table without a proven namespace,
     * so this field is required, never a placeholder.
     */
    sourceNamespace: nonEmptyString,
    /** Null iff revisionStatus is UNPROVEN -- never a synthesized placeholder. */
    sourceRevision: nonEmptyString.nullable(),
    membershipStatus: PacketChunkMembershipStatusSchema,
    revisionStatus: PacketChunkRevisionStatusSchema,
    /** Position of this chunk within its source file's chunk sequence, for stable ordering only -- not an identity field. */
    chunkOrdinal: z.number().int().nonnegative(),
    /** Revision of the producer (writer script or backfill run) that wrote this row. */
    lineageProducerRevision: nonEmptyString,
    /** Report/receipt paths or run ids substantiating this membership -- not free-text notes. */
    evidenceRefs: z.array(nonEmptyString).default([]),
  })
  .strict()
  .refine((v) => (v.revisionStatus === 'PROVEN') === (v.sourceRevision !== null), {
    message: 'revisionStatus must be PROVEN if and only if sourceRevision is present (non-null)',
    path: ['revisionStatus'],
  });

export type PacketChunkMembershipV1 = z.infer<typeof PacketChunkMembershipV1Schema>;

/**
 * Canonical relation shape for atlas_packet_chunk_lineage (frozen contract;
 * migration is a separate, later gate -- PACKET-CHUNK-LINEAGE-MIGRATION-01,
 * proved on a disposable database before touching the live one).
 *
 * NOT NULL: packet_key, canonical_chunk_id, chunk_row_id, source_ref,
 *   source_namespace, membership_status, revision_status,
 *   lineage_producer_revision
 * NULLABLE: source_revision (absent whenever revision_status = 'UNPROVEN')
 * UNIQUE: (packet_key, canonical_chunk_id, lineage_producer_revision)
 *   -- deliberately NOT including source_revision in the uniqueness key:
 *   the dominant historical state (per BACKFILL-SCOPE-01: 60,882/61,660
 *   namespace-unproven, and revision tracks namespace 1:1 in this corpus)
 *   is expected to have source_revision absent, and a nullable column
 *   cannot usefully participate in a uniqueness constraint anyway (NULL
 *   never equals NULL in Postgres).
 */
export const ATLAS_PACKET_CHUNK_LINEAGE_TABLE_NAME = 'atlas_packet_chunk_lineage';

export interface AtlasPacketChunkLineageRow {
  packet_key: string;
  canonical_chunk_id: string;
  chunk_row_id: string;
  source_ref: string;
  source_namespace: string;
  source_revision: string | null;
  membership_status: PacketChunkMembershipStatus;
  revision_status: PacketChunkRevisionStatus;
  chunk_ordinal: number;
  lineage_producer_revision: string;
  evidence_refs: string[];
  created_at: string;
}

export function toAtlasPacketChunkLineageRow(
  membership: PacketChunkMembershipV1,
  createdAtIso: string,
): AtlasPacketChunkLineageRow {
  return {
    packet_key: membership.packetKey,
    canonical_chunk_id: membership.canonicalChunkId,
    chunk_row_id: membership.chunkRowId,
    source_ref: membership.sourceRef,
    source_namespace: membership.sourceNamespace,
    source_revision: membership.sourceRevision,
    membership_status: membership.membershipStatus,
    revision_status: membership.revisionStatus,
    chunk_ordinal: membership.chunkOrdinal,
    lineage_producer_revision: membership.lineageProducerRevision,
    evidence_refs: membership.evidenceRefs,
    created_at: createdAtIso,
  };
}
