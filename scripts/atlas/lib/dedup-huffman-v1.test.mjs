import test from 'node:test';
import assert from 'node:assert/strict';
import { huffmanLengths, canonicalCodes, isCompleteCode, packStrings, unpackStrings } from './dedup-huffman-v1.mjs';

const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

test('known small example: frequencies [5,2,1,1] -> lengths [1,2,3,3], canonical codes 0,10,110,111', () => {
  const lengths = huffmanLengths([5, 2, 1, 1]);
  assert.deepEqual(lengths, [1, 2, 3, 3]);
  assert.deepEqual(canonicalCodes(lengths).codes, [0b0, 0b10, 0b110, 0b111]);
  assert.equal(isCompleteCode(lengths), true);
});

test('lengths are deterministic under frequency ties (smallest symbol index wins)', () => {
  const a = huffmanLengths([1, 1, 1, 1, 1, 1]);
  const b = huffmanLengths([1, 1, 1, 1, 1, 1]);
  assert.deepEqual(a, b);
  assert.equal(isCompleteCode(a), true);
});

test('round trip: empty, single-symbol, two-symbol and unicode inputs', () => {
  for (const input of [[], ['a'], ['a', 'a', 'a'], ['x', 'y', 'x'], ['naive', 'naïve', '日本語', 'naive', '']]) {
    assert.deepEqual(unpackStrings(packStrings(input)), input);
  }
});

test('round trip: 5,000 random rows over a skewed vocabulary', () => {
  const rnd = rngOf(7);
  const vocab = Array.from({ length: 200 }, (_, i) => `openspec/changes/change-${i}/tasks.md`);
  const rows = Array.from({ length: 5000 }, () => vocab[Math.floor(rnd() ** 3 * vocab.length)]);
  const packed = packStrings(rows);
  assert.deepEqual(unpackStrings(packed), rows);
  const raw = Buffer.byteLength(rows.join('\n'));
  assert.ok(packed.length < raw / 5, `packed ${packed.length} should be far below raw ${raw}`);
});

test('dedup: the table holds each distinct string once, sorted by UTF-8 bytes, independent of input order', () => {
  const rows = ['b', 'a', 'c', 'a', 'b', 'a'];
  const shuffled = ['a', 'c', 'a', 'b', 'a', 'b'];
  const p1 = packStrings(rows), p2 = packStrings(shuffled);
  const tableOf = (p) => p.subarray(12, 12 + 6); // three entries of (varint 1, 1 byte)
  assert.deepEqual([...tableOf(p1)], [...tableOf(p2)]);
  assert.deepEqual([...tableOf(p1)], [1, 0x61, 1, 0x62, 1, 0x63]);
  assert.equal(p1.readUInt32LE(8), 3);
});

test('same input twice gives identical bytes', () => {
  const rows = Array.from({ length: 300 }, (_, i) => `label-${i % 17}`);
  assert.ok(packStrings(rows).equals(packStrings(rows)));
});

test('rejects bad magic, truncation, trailing bytes, tampered lengths and padding bits', () => {
  const good = packStrings(['a', 'b', 'a', 'c', 'a', 'b', 'a', 'a', 'd']);
  const bad = Buffer.from(good); bad[0] = 0x58;
  assert.throws(() => unpackStrings(bad), /HFD_BAD_MAGIC/);
  assert.throws(() => unpackStrings(good.subarray(0, good.length - 1)), /HFD_PAYLOAD_SIZE_MISMATCH|HFD_TRUNCATED/);
  assert.throws(() => unpackStrings(Buffer.concat([good, Buffer.from([0])])), /HFD_PAYLOAD_SIZE_MISMATCH/);
  // codeLength bytes follow the table; break the Kraft sum
  const lenOffset = 12 + 4 * 2 + 0; // 4 unique one-byte strings: (varint + byte) x 4 = 8 bytes
  const tampered = Buffer.from(good); tampered[lenOffset] = tampered[lenOffset] + 1;
  assert.throws(() => unpackStrings(tampered), /HFD_CODE_NOT_COMPLETE/);
  const padded = Buffer.from(good); padded[padded.length - 1] |= 0x01;
  const bits = good.readUInt32LE(12 + 8 + 4);
  if (bits % 8) assert.throws(() => unpackStrings(padded), /HFD_PADDING_NOT_ZERO|HFD_PAYLOAD/);
});

test('rejects an unsorted or duplicated table and rows with an empty table', () => {
  const good = packStrings(['a', 'b']);
  const swapped = Buffer.from(good); swapped[13] = 0x62; swapped[15] = 0x61; // table becomes b, a
  assert.throws(() => unpackStrings(swapped), /HFD_TABLE_NOT_SORTED_UNIQUE/);
  const emptyTable = Buffer.alloc(12); Buffer.from('HFD1').copy(emptyTable); emptyTable.writeUInt32LE(3, 4);
  assert.throws(() => unpackStrings(emptyTable), /HFD_EMPTY_TABLE_WITH_ROWS/);
});

test('non-string input is rejected', () => {
  assert.throws(() => packStrings(['a', 5]), /HFD_NON_STRING_INPUT/);
});

test('every prefix code is complete for random frequency vectors', () => {
  const rnd = rngOf(99);
  for (let t = 0; t < 50; t++) {
    const n = 2 + Math.floor(rnd() * 60);
    const f = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 1000));
    assert.equal(isCompleteCode(huffmanLengths(f)), true);
  }
});
