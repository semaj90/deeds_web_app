import { z } from 'zod';

/**
 * IDENTITY-COORDINATE-OWNER-02 — canonical coordinate + evidence-eligibility contracts. Types and pure guards only,
 * nothing is resolved, and nothing here mints identity.
 *
 * Canonical implementation owner, consistent with docs/atlas/package-boundary-registry.json.
 * App-local imports re-export this module for compatibility; identity semantics live here once.
 *
 * Rule set these contracts encode:
 *   Identity identifies. Coordinates bind a computation. Lineage qualifies evidence. Feature grain determines the required
 *   qualification. Storage IDs never promote identity. Packet qualification never implies chunk qualification.
 *
 * Field names deliberately match AceBitfrostCacheIdentityV1 (sveltekit-frontend/.../atlas/cache/ace-bitfrost-cache-identity-v1.ts) so the
 * cache identity can later be derived from a coordinate instead of re-declared. Revision/checksum values are opaque non-empty strings
 * here: the repo's producers do not yet agree on a prefix (candidateSnapshotRevision is `sha256:`-prefixed, ordinalMapChecksum is bare hex),
 * and this contract must not silently normalize either.
 *
 * Zod note: this package pins zod ^3, the app uses zod 4. Only stable Zod APIs are exposed by this contract.
 */

const value = z.string().min(1);

/** Binds one computation to one exact candidate universe and revision set. Never identity. */
export const atlasCoordinateV1Schema = z.object({
  workspaceRevision: value,
  candidateSnapshotRevision: value,
  ordinalMapChecksum: value,
  coordinateArtifactChecksum: value,
  sourceRevision: value.optional(),
  sourceRevisionSetChecksum: value.optional(),
  representationId: value.optional(),
  representationRevision: value.optional(),
  graphRevision: value.optional(),
  featureRevision: value.optional(),
}).strict();
export type AtlasCoordinateV1 = z.infer<typeof atlasCoordinateV1Schema>;

/** A coordinate plus the canonical packet identity. Sufficient for PACKET-grained features only. */
export const packetEvidenceCoordinateV1Schema = atlasCoordinateV1Schema.extend({
  packetKey: value,
}).strict();
export type PacketEvidenceCoordinateV1 = z.infer<typeof packetEvidenceCoordinateV1Schema>;

/**
 * A packet coordinate plus a PROVEN packet->chunk binding. The only input a chunk-derived feature may accept:
 * `{ packetKey }` (or a packet coordinate) is a compile error and a runtime rejection here.
 * `canonicalChunkId` is canonical only because it is hydrated from lineage identified by `lineageBindingChecksum`;
 * storage locators (packet_id, chunk_row_id, Qdrant point id) are deliberately not fields of this contract.
 */
export const chunkEvidenceCoordinateV1Schema = atlasCoordinateV1Schema.extend({
  packetKey: value,
  canonicalChunkId: value,
  sourceRef: value,
  sourceRevision: value, // required here (optional on the base coordinate)
  chunkLineageRevision: value,
  lineageBindingChecksum: value,
}).strict();
export type ChunkEvidenceCoordinateV1 = z.infer<typeof chunkEvidenceCoordinateV1Schema>;

/**
 * How strongly a piece of evidence is qualified. Distinct from identity strength (IdentityResolutionStatus in
 * retrieval/identity-resolution.ts): an exact packet_key match is an identity fact, not a chunk-eligibility fact.
 */
export const EVIDENCE_ELIGIBILITY_V1 = [
  'PACKET_REVISION_QUALIFIED',
  'CHUNK_REVISION_QUALIFIED',
  'SYMBOL_REVISION_QUALIFIED',
  'SOURCE_GROUP_ONLY',
  'DEGRADED',
  'INELIGIBLE',
] as const;
export type EvidenceEligibilityV1 = (typeof EVIDENCE_ELIGIBILITY_V1)[number];
export const evidenceEligibilityV1Schema = z.enum(EVIDENCE_ELIGIBILITY_V1);

/** The only levels a feature may REQUIRE. SOURCE_GROUP_ONLY / DEGRADED / INELIGIBLE are outcomes, never requirements. */
export type RequiredEvidenceEligibilityV1 = Extract<
  EvidenceEligibilityV1,
  'PACKET_REVISION_QUALIFIED' | 'CHUNK_REVISION_QUALIFIED' | 'SYMBOL_REVISION_QUALIFIED'
>;

/**
 * Does evidence with `actual` eligibility satisfy a feature that requires `required`?
 * Exact match satisfies. Chunk qualification implies packet qualification (proven lineage identifies the packet).
 * Packet qualification NEVER satisfies chunk (or symbol) qualification. Symbol is its own axis.
 * SOURCE_GROUP_ONLY, DEGRADED and INELIGIBLE satisfy nothing.
 */
export function satisfiesEvidenceEligibilityV1(actual: EvidenceEligibilityV1, required: RequiredEvidenceEligibilityV1): boolean {
  if (actual === required) return true;
  return actual === 'CHUNK_REVISION_QUALIFIED' && required === 'PACKET_REVISION_QUALIFIED';
}

/** Runtime guard mirroring the type-level rule: throws unless `input` is a full chunk evidence coordinate. */
export function assertChunkEvidenceCoordinateV1(input: unknown): ChunkEvidenceCoordinateV1 {
  const parsed = chunkEvidenceCoordinateV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`CHUNK_EVIDENCE_COORDINATE_REQUIRED:${parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(',')}`);
  }
  return parsed.data;
}

/** Forgetful projection: a chunk coordinate always contains a valid packet coordinate. Never the reverse. */
export function toPacketEvidenceCoordinateV1(chunk: ChunkEvidenceCoordinateV1): PacketEvidenceCoordinateV1 {
  const { canonicalChunkId: _c, sourceRef: _s, chunkLineageRevision: _l, lineageBindingChecksum: _b, ...packet } = chunk;
  return packetEvidenceCoordinateV1Schema.parse(packet);
}
