import assert from 'node:assert/strict';
import turbovec from './wrapper.js';

assert.equal(typeof turbovec.computeDhash64, 'function', 'dHash N-API export must be present');
assert.equal(typeof turbovec.batchHammingSearchTopK, 'function', 'Hamming N-API export must be present');

const gray9x8 = new Uint8Array(72);
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 9; col++) gray9x8[row * 9 + col] = col;
}
assert.equal(turbovec.computeDhash64(gray9x8), 'ffffffffffffffff');
assert.throws(() => turbovec.computeDhash64(new Uint8Array(71)));

// BigUint64Array views with nonzero byteOffset must retain their intended bytes.
const query = new BigUint64Array([99n, 0n, 88n]).subarray(1, 2);
const corpus = new BigUint64Array([77n, 0n, 1n, 3n, 0x8000000000000000n, 66n]).subarray(1, 5);
const matches = turbovec.batchHammingSearchTopK(query, corpus, 1, 4);
assert.deepEqual(matches.map(({ index, distance }) => [index, distance]), [
  [0, 0],
  [1, 1],
  [3, 1],
  [2, 2],
]);
assert.throws(() => turbovec.batchHammingSearchTopK(new Uint8Array(7), new Uint8Array(8), 1, 1));

console.log('turbovec_native_smoke=PASS dhash=64-bit hamming=stable byteOffset=PASS invalid-length=PASS');
