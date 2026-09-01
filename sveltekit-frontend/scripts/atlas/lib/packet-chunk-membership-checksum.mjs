/**
 * Single shared definition of "membership set identity" for the
 * PacketChunkMembershipV1 lineage program. Both
 * packet-chunk-lineage-backfill-dry-01.mts and
 * packet-chunk-lineage-backfill-canary-01.mts import this -- neither script
 * is permitted to reimplement an "approximately equivalent" serializer.
 * A checksum divergence between dry-run and canary would otherwise be
 * indistinguishable from two different definitions of membership identity.
 *
 * Algorithm (byte-for-byte, matches the original BACKFILL-DRY-01 definition):
 *   sha256(`${packetKey}\n${JSON.stringify(sortedUniqueCanonicalChunkIds)}`)
 * Order-independent by construction -- canonicalChunkIds are deduplicated
 * and lexicographically sorted before hashing, so physical row/insertion
 * order never affects the checksum.
 */
import { createHash } from 'node:crypto';

export function computeMembershipSetChecksum(packetKey, canonicalChunkIds) {
  const uniqueSorted = [...new Set(canonicalChunkIds)].sort();
  return createHash('sha256').update(`${packetKey}\n${JSON.stringify(uniqueSorted)}`).digest('hex');
}
