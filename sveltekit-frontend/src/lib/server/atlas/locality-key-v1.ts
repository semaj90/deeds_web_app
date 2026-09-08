import { z } from 'zod';
import { hilbertIndexND } from './tensors/tetris-6d-hilbert-step1.js';
import { hammingDistance1Bit, hammingSimilarity1Bit } from '../search/mla-kv-compress.js';
import type { PacketLodV1, ResidencyStateV1 } from './residency/packet-lod-v1.js';

/**
 * AtlasLocalityKeyV1 — a PHYSICAL storage/batch locality key, never a semantic-similarity or
 * identity claim. See
 * openspec/changes/parent-atlas-packet-control-word-record/specs/locality-key/spec.md.
 *
 * Hard rules enforced by this module (not just documented):
 *   - `hilbertKey` is ALWAYS computed via the existing `hilbertIndexND()`
 *     (tensors/tetris-6d-hilbert-step1.ts) — this module never reimplements Hilbert encoding.
 *   - `hammingSig` comparisons ALWAYS delegate to the existing `hammingDistance1Bit`/
 *     `hammingSimilarity1Bit` (search/mla-kv-compress.ts) — this module never reimplements
 *     popcount/XOR distance.
 *   - Hamming comparisons here are a PRE-FILTER only (shrink a candidate set before expensive
 *     dense/graph/lexical work). Never treat a Hamming-filtered set as already-ranked, and never
 *     fuse Hamming distance into retrieval scoring as an independent RRF-voted lane.
 *   - Resolving a packet from an `AtlasLocalityKeyV1` alone is NOT supported — `packetOrdinal`
 *     still requires a separate ordinal-to-packetKey lookup, exactly as `ResidencySortKeyV1`
 *     already requires elsewhere in this repo (residency/packet-glyph-v1.ts).
 */

export const ATLAS_LOCALITY_KEY_SCHEMA = 'atlas.locality-key.v1' as const;

/** hammingSig is stored as a hex string (serializable through JSON/Postgres) representing a
 * fixed-length byte signature; convert to/from Uint8Array via the helpers below before comparing. */
export const AtlasLocalityKeyV1Schema = z
  .object({
    schema: z.literal(ATLAS_LOCALITY_KEY_SCHEMA),
    domainId: z.number().int().min(0).max(255),
    lodClass: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal('GPU')]),
    residencyClass: z.enum(['ABSENT', 'COLD', 'WARM', 'HOT_CPU', 'HOT_GPU', 'CONSUMED']),
    clusterId: z.number().int().nonnegative(),
    somCell: z.number().int().min(0).max(65535),
    hilbertKey: z.bigint(),
    hammingSig: z.string().regex(/^[0-9a-f]*$/i, 'hammingSig must be a lowercase hex string'),
    packetOrdinal: z.number().int().min(0).max(4294967295),
  })
  .strict();
export type AtlasLocalityKeyV1 = z.infer<typeof AtlasLocalityKeyV1Schema>;

/**
 * computeAtlasHilbertKeyV1 — the ONLY sanctioned way to derive a Hilbert key for this contract.
 * Delegates directly to the existing `hilbertIndexND()`; does not reimplement the curve.
 */
export function computeAtlasHilbertKeyV1(point: readonly number[], bitsPerAxis: number): bigint {
  return hilbertIndexND(point, bitsPerAxis);
}

export function hammingSigToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('locality-key-v1: hammingSig hex string must have even length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHammingSig(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * compareAtlasHammingSigV1 — the ONLY sanctioned way to compare two hammingSig values. Delegates
 * directly to the existing `hammingDistance1Bit`/`hammingSimilarity1Bit`; does not reimplement
 * popcount/XOR distance.
 */
export function compareAtlasHammingSigV1(
  a: string,
  b: string,
): { distance: number; similarity: number } {
  const bytesA = hammingSigToBytes(a);
  const bytesB = hammingSigToBytes(b);
  return {
    distance: hammingDistance1Bit(bytesA, bytesB),
    similarity: hammingSimilarity1Bit(bytesA, bytesB),
  };
}

export function createAtlasLocalityKeyV1(input: {
  domainId: number;
  lod: PacketLodV1;
  residency: ResidencyStateV1;
  clusterId: number;
  somCell: number;
  hilbertKey: bigint;
  hammingSig: string;
  packetOrdinal: number;
}): AtlasLocalityKeyV1 {
  return AtlasLocalityKeyV1Schema.parse({
    schema: ATLAS_LOCALITY_KEY_SCHEMA,
    domainId: input.domainId,
    lodClass: input.lod,
    residencyClass: input.residency,
    clusterId: input.clusterId,
    somCell: input.somCell,
    hilbertKey: input.hilbertKey,
    hammingSig: input.hammingSig,
    packetOrdinal: input.packetOrdinal,
  });
}

/**
 * hammingPrefilterCandidatesV1 — shrinks a candidate set to those within `maxDistance` of `query`
 * by Hamming distance. This is a PRE-FILTER, not a ranked result: callers MUST still run the
 * narrowed set through the real retrieval lanes (dense/graph/lexical) before ranking. This
 * function performs no scoring or ordering beyond the boolean radius cut.
 */
export function hammingPrefilterCandidatesV1<T extends { hammingSig: string }>(
  candidates: readonly T[],
  query: string,
  maxDistance: number,
): T[] {
  const queryBytes = hammingSigToBytes(query);
  return candidates.filter((c) => hammingDistance1Bit(queryBytes, hammingSigToBytes(c.hammingSig)) <= maxDistance);
}
