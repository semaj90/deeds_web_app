export interface ByteHasher {
  sha256(input: Uint8Array): Uint8Array;
}

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function largestPowerOfTwoLessThan(n: number): number {
  if (!Number.isSafeInteger(n) || n <= 1) {
    throw new Error(`Expected integer n > 1, got ${n}`);
  }
  let k = 1;
  while ((k << 1) < n) k <<= 1;
  return k;
}

export function merkleLeafHash(
  canonicalEventBytes: Uint8Array,
  hasher: ByteHasher,
): Uint8Array {
  return hasher.sha256(concatBytes(LEAF_PREFIX, canonicalEventBytes));
}

export function merkleNodeHash(
  left: Uint8Array,
  right: Uint8Array,
  hasher: ByteHasher,
): Uint8Array {
  return hasher.sha256(concatBytes(NODE_PREFIX, left, right));
}

/**
 * RFC-9162/RFC-6962-style Merkle Tree Hash:
 * empty => SHA256("")
 * one leaf => SHA256(0x00 || leaf)
 * n > 1 => split at largest power of two < n, recurse, then
 * SHA256(0x01 || left || right).
 *
 * Do NOT duplicate the last leaf for odd populations.
 */
export function merkleTreeHash(
  canonicalLeaves: readonly Uint8Array[],
  hasher: ByteHasher,
): Uint8Array {
  const n = canonicalLeaves.length;

  if (n === 0) return hasher.sha256(new Uint8Array());
  if (n === 1) return merkleLeafHash(canonicalLeaves[0], hasher);

  const k = largestPowerOfTwoLessThan(n);
  const left = merkleTreeHash(canonicalLeaves.slice(0, k), hasher);
  const right = merkleTreeHash(canonicalLeaves.slice(k), hasher);
  return merkleNodeHash(left, right, hasher);
}

export function bytesToHex(input: Uint8Array): string {
  return Array.from(input, (b) => b.toString(16).padStart(2, '0')).join('');
}
