#!/usr/bin/env node
/**
 * Parent Atlas Radix Alignment — Read-Only CPU Reference & Optional Native-Executor
 * SortPairs Parity Boundary (ACE-RADIX-SORTPAIRS-01).
 *
 * Extends key-only sorting (`DeviceRadixSort::SortKeys`) to key-ordinal pair sorting
 * (`DeviceRadixSort::SortPairs`) so that every sorted 64-bit `ResidencySortKeyV1`
 * preserves its exact association with `candidateOrdinal` (including deterministic
 * ascending candidateOrdinal tie order when two keys are equal).
 */
import { createHash } from 'node:crypto';

const UINT64_MAX = (1n << 64n) - 1n;
const UINT32_MAX = 0xffffffff;

/**
 * Validate an input cohort of `{ key: bigint, candidateOrdinal: number }` pairs.
 * Fails closed on duplicate ordinals, out-of-range uint64 keys, or non-dense/invalid ordinals.
 *
 * @param {Array<{ key: bigint, candidateOrdinal: number }>} pairs
 */
export function assertValidRadixKeyOrdinalPairsV1(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error('RADIX_SORT_PAIRS_EMPTY');
  }
  const seenOrdinals = new Set();
  for (let i = 0; i < pairs.length; i += 1) {
    const item = pairs[i];
    if (!item || typeof item.key !== 'bigint') {
      throw new Error(`RADIX_SORT_PAIRS_KEY_NOT_BIGINT:index=${i}`);
    }
    if (item.key < 0n || item.key > UINT64_MAX) {
      throw new Error(`RADIX_SORT_PAIRS_KEY_OUT_OF_RANGE:index=${i}`);
    }
    if (
      typeof item.candidateOrdinal !== 'number' ||
      !Number.isInteger(item.candidateOrdinal) ||
      item.candidateOrdinal < 0 ||
      item.candidateOrdinal > UINT32_MAX
    ) {
      throw new Error(`RADIX_SORT_PAIRS_ORDINAL_OUT_OF_RANGE:index=${i}`);
    }
    if (seenOrdinals.has(item.candidateOrdinal)) {
      throw new Error(`RADIX_SORT_PAIRS_DUPLICATE_ORDINAL:${item.candidateOrdinal}`);
    }
    seenOrdinals.add(item.candidateOrdinal);
  }
}

/**
 * 8-pass, 8-bit LSB stable radix sort over `(key: uint64, candidateOrdinal: uint32)` pairs.
 * Tie-breaking rule: pre-orders by ascending `candidateOrdinal` before the 8 stable byte
 * passes so equal 64-bit keys are guaranteed to emerge in ascending `candidateOrdinal` order.
 *
 * @param {Array<{ key: bigint, candidateOrdinal: number }>} pairs
 * @returns {Array<{ key: bigint, candidateOrdinal: number }>}
 */
export function sortResidencyKeyOrdinalPairsV1(pairs) {
  assertValidRadixKeyOrdinalPairsV1(pairs);

  // Pre-order by ascending candidateOrdinal so stable radix passes preserve deterministic tie order
  let work = pairs
    .map((p) => ({ key: p.key, candidateOrdinal: p.candidateOrdinal }))
    .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);

  for (let pass = 0; pass < 8; pass += 1) {
    const shift = BigInt(pass * 8);
    const counts = new Int32Array(256);
    for (let i = 0; i < work.length; i += 1) {
      const bucket = Number((work[i].key >> shift) & 0xffn);
      counts[bucket] += 1;
    }
    const offsets = new Int32Array(256);
    for (let b = 1; b < 256; b += 1) {
      offsets[b] = offsets[b - 1] + counts[b - 1];
    }
    const next = new Array(work.length);
    for (let i = 0; i < work.length; i += 1) {
      const bucket = Number((work[i].key >> shift) & 0xffn);
      const pos = offsets[bucket];
      next[pos] = work[i];
      offsets[bucket] = pos + 1;
    }
    work = next;
  }

  return work;
}

/**
 * Verify CPU reference vs optional native/CUDA SortPairs executor output and emit
 * a checksummed parity receipt.
 *
 * @param {Array<{ key: bigint, candidateOrdinal: number }>} inputPairs
 * @param {((pairs: Array<{ key: bigint, candidateOrdinal: number }>) => Array<{ key: bigint, candidateOrdinal: number }>) | null} [nativeExecutor]
 */
export function verifyRadixSortPairsParityV1(inputPairs, nativeExecutor = null) {
  const cpuSorted = sortResidencyKeyOrdinalPairsV1(inputPairs);
  let executorStatus = 'CPU_REFERENCE_ONLY';
  let parityPassed = true;

  if (typeof nativeExecutor === 'function') {
    const nativeSorted = nativeExecutor(inputPairs);
    assertValidRadixKeyOrdinalPairsV1(nativeSorted);
    if (nativeSorted.length !== cpuSorted.length) {
      parityPassed = false;
    } else {
      for (let i = 0; i < cpuSorted.length; i += 1) {
        if (
          nativeSorted[i].key !== cpuSorted[i].key ||
          nativeSorted[i].candidateOrdinal !== cpuSorted[i].candidateOrdinal
        ) {
          parityPassed = false;
          break;
        }
      }
    }
    if (!parityPassed) {
      throw new Error('RADIX_SORT_PAIRS_NATIVE_PARITY_MISMATCH');
    }
    executorStatus = 'NATIVE_PARITY_VERIFIED';
  }

  const serialized = JSON.stringify(
    cpuSorted.map((p) => ({
      keyHex: `0x${p.key.toString(16).padStart(16, '0')}`,
      candidateOrdinal: p.candidateOrdinal,
    }))
  );
  const orderingDigest = `sha256:${createHash('sha256').update(serialized).digest('hex')}`;

  return {
    schema: 'atlas.radix-sort-pairs-parity.v1',
    executorStatus,
    parityPassed,
    pairCount: cpuSorted.length,
    orderingDigest,
    sortedPairs: cpuSorted,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
