#!/usr/bin/env node
/**
 * 6/6 Node tests for ACE-RADIX-SORTPAIRS-01 (`radix-sort-pairs-parity-v1.mjs`).
 * Run with: node scripts/atlas/ace-radix-01/radix-sort-pairs-parity-v1.test.mjs
 */
import assert from 'node:assert/strict';
import { generateAceRadix01FixtureV1 } from './fixture-v1.mjs';
import {
  assertValidRadixKeyOrdinalPairsV1,
  sortResidencyKeyOrdinalPairsV1,
  verifyRadixSortPairsParityV1,
} from './radix-sort-pairs-parity-v1.mjs';

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL - ${name}`);
    console.error(err);
  }
}

// Test 1: Preserves exact key <-> candidateOrdinal association across 256 fixture items
test('1. preserves exact key-ordinal association on N=256 fixture', () => {
  const { packedKeys } = generateAceRadix01FixtureV1(256);
  const pairs = packedKeys.map((key, idx) => ({ key, candidateOrdinal: idx }));
  const sorted = sortResidencyKeyOrdinalPairsV1(pairs);
  assert.equal(sorted.length, 256);
  for (let i = 0; i < sorted.length; i += 1) {
    assert.equal(sorted[i].key, packedKeys[sorted[i].candidateOrdinal]);
    if (i > 0) {
      assert.ok(sorted[i - 1].key <= sorted[i].key);
    }
  }
});

// Test 2: Deterministic tie order by ascending candidateOrdinal when 64-bit keys are identical
test('2. enforces deterministic ascending candidateOrdinal tie order on equal keys', () => {
  const tiedKey = 0x0100050000000000n;
  const pairs = [
    { key: tiedKey, candidateOrdinal: 42 },
    { key: tiedKey, candidateOrdinal: 7 },
    { key: 0x0100020000000000n, candidateOrdinal: 99 },
    { key: tiedKey, candidateOrdinal: 19 },
  ];
  const sorted = sortResidencyKeyOrdinalPairsV1(pairs);
  assert.deepEqual(
    sorted.map((p) => p.candidateOrdinal),
    [99, 7, 19, 42]
  );
});

// Test 3: Rejects duplicate candidateOrdinal values fail-closed
test('3. rejects duplicate candidateOrdinal fail-closed', () => {
  assert.throws(
    () =>
      assertValidRadixKeyOrdinalPairsV1([
        { key: 10n, candidateOrdinal: 3 },
        { key: 20n, candidateOrdinal: 3 },
      ]),
    /RADIX_SORT_PAIRS_DUPLICATE_ORDINAL/
  );
});

// Test 4: Rejects out-of-range uint64 key or negative candidateOrdinal
test('4. rejects out-of-range uint64 key and negative candidateOrdinal', () => {
  assert.throws(
    () => assertValidRadixKeyOrdinalPairsV1([{ key: -1n, candidateOrdinal: 0 }]),
    /RADIX_SORT_PAIRS_KEY_OUT_OF_RANGE/
  );
  assert.throws(
    () => assertValidRadixKeyOrdinalPairsV1([{ key: 1n, candidateOrdinal: -1 }]),
    /RADIX_SORT_PAIRS_ORDINAL_OUT_OF_RANGE/
  );
});

// Test 5: Verifies parity when optional native executor matches CPU reference
test('5. verifies parity when native SortPairs executor matches CPU oracle', () => {
  const pairs = [
    { key: 0x0200000000000005n, candidateOrdinal: 5 },
    { key: 0x0100000000000002n, candidateOrdinal: 2 },
    { key: 0x0100000000000002n, candidateOrdinal: 1 },
  ];
  const receipt = verifyRadixSortPairsParityV1(pairs, (inp) =>
    sortResidencyKeyOrdinalPairsV1(inp)
  );
  assert.equal(receipt.executorStatus, 'NATIVE_PARITY_VERIFIED');
  assert.equal(receipt.parityPassed, true);
  assert.equal(receipt.canonicalAuthority, false);
});

// Test 6: Rejects native executor that corrupts ordinal association on tied keys
test('6. rejects native executor that breaks tie order or ordinal binding', () => {
  const pairs = [
    { key: 0x0100000000000002n, candidateOrdinal: 10 },
    { key: 0x0100000000000002n, candidateOrdinal: 4 },
  ];
  assert.throws(
    () =>
      verifyRadixSortPairsParityV1(pairs, () => [
        { key: 0x0100000000000002n, candidateOrdinal: 10 },
        { key: 0x0100000000000002n, candidateOrdinal: 4 },
      ]),
    /RADIX_SORT_PAIRS_NATIVE_PARITY_MISMATCH/
  );
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\n6/6 SortPairs parity tests passed');
}
