import { z } from 'zod';

/**
 * ACE-BITFROST-RESIDENCY-GLYPH
 *
 * GPU primitive ownership boundary (per root CLAUDE.md's "One Canonical Runtime
 * Owner Per Capability" governance rule — do not add a competing owner without
 * updating this table and the governing OpenSpec change):
 *
 * | Primitive              | Owns                                                        |
 * |-------------------------|--------------------------------------------------------------|
 * | CUB (radix sort/partition/compact) | BitFrost cache/tensor-materialization reorganization — required oracle baseline for ACE-RADIX-01 |
 * | cuTile                  | Challenger only, gated behind CUB — never introduced merely to have a custom kernel |
 * | cuBLASLt                | Dense candidate scoring / batched projection linear algebra (NOT ACE ranking) |
 * | cuGraph                 | PageRank/PPR/Leiden/BFS/SSSP (existing NetworkX↔cuGraph parity pipeline) |
 * | cuVS                    | ANN semantic search (exact + CAGRA) — existing retrieval lane |
 * | ACE/BitFrost             | Admission, residency, cache-tier promotion policy — sole legitimate consumer of ResidencySortKeyV1/PacketGlyphV1 |
 * | SOM                     | Experimental representation/routing only — never retrieval truth |
 *
 * See openspec/changes/parent-atlas-ace-radix-residency/ for the full proposal,
 * design rationale, and the ACE-RADIX-01 proof gate this module's contracts feed.
 */

/**
 * Compact fixed-shape record per candidate packet for cheap GPU-local scans over
 * large candidate sets (e.g. 100K candidates at ~16 bytes/candidate) before
 * dereferencing heavier representations along the NES-style LOD ladder
 * (LOD0 identity -> LOD7 prompt-ready tokens).
 *
 * MUST NOT carry packetKey or any other canonical-identity field — this is a
 * scan-only projection, not an identity record. Bit-width bounds below are set
 * to the exact ceiling of the target packed width so a value that passes Zod
 * validation is always representable in the eventual packed binary layout.
 */
export const PacketGlyphV1Schema = z.object({
  projectionOrdinal: z.number().int().min(0).max(4294967295), // uint32
  featureBits: z.number().int().min(0).max(65535), // uint16
  lod: z.number().int().min(0).max(255), // uint8
  residency: z.number().int().min(0).max(255), // uint8
  pagerankQuantized: z.number().int().min(0).max(65535), // uint16
  recency: z.number().int().min(0).max(65535), // uint16
  somCell: z.number().int().min(0).max(65535), // uint16
  flags: z.number().int().min(0).max(65535), // uint16
}).strict();

export type PacketGlyphV1 = z.infer<typeof PacketGlyphV1Schema>;

/**
 * GPU-local integer sort key used exclusively inside BitFrost cache/tensor-
 * materialization reorganization. `projectionOrdinal` is a non-canonical
 * GPU-local coordinate (same treatment as `gpuNodeId` elsewhere in this repo) —
 * this key MUST NOT carry or be derived into canonical packetKey identity.
 */
export const ResidencySortKeyV1Schema = z.object({
  tier: z.number().int().min(0).max(255),
  lod: z.number().int().min(0).max(255),
  utilityBucket: z.number().int().min(0).max(255),
  recencyBucket: z.number().int().min(0).max(255),
  projectionOrdinal: z.number().int().min(0).max(4294967295),
}).strict();

export type ResidencySortKeyV1 = z.infer<typeof ResidencySortKeyV1Schema>;

export function buildPacketGlyphV1(input: PacketGlyphV1): PacketGlyphV1 {
  return PacketGlyphV1Schema.parse(input);
}

export function buildResidencySortKeyV1(input: ResidencySortKeyV1): ResidencySortKeyV1 {
  return ResidencySortKeyV1Schema.parse(input);
}
