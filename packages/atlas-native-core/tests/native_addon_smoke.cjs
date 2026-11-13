const assert = require('node:assert/strict');
const path = require('node:path');

const addon = require(path.join(path.resolve(process.argv[2]), 'atlas_native_core.node'));
const { execFileSync } = require('node:child_process');
const somSortedIndices = addon.radixSortSomCandidateIndicesV1(
  Uint16Array.from([1, 0, 1]),
  Uint16Array.from([2, 9, 2]),
  Uint32Array.from([7, 8, 1]),
);
assert.deepEqual(Array.from(somSortedIndices), [1, 2, 0]);
assert.throws(() => addon.radixSortSomCandidateIndicesV1(
  Uint16Array.from([1]), Uint16Array.from([400]), Uint32Array.from([0]),
), /SOM_BMU_ID_OUT_OF_RANGE/);
assert.throws(() => addon.radixSortSomCandidateIndicesV1(
  Uint16Array.from([1]), Uint16Array.from([]), Uint32Array.from([0]),
), /SOM_RADIX_ARRAY_LENGTH_MISMATCH/);
assert.throws(() => addon.radixSortSomCandidateIndicesV1(
  Uint16Array.from([1]), Uint16Array.from([1]), Uint16Array.from([0]),
), /Expected/);
assert.deepEqual(Array.from(addon.radixSortSomCandidateIndicesV1(
  Uint16Array.from([]), Uint16Array.from([]), Uint32Array.from([]),
)), []);
assert.deepEqual(Array.from(addon.radixSortSomCandidateIndicesV1(
  Uint16Array.from([99, 1, 4, 4, 1]),
  Uint16Array.from([399, 3, 2, 2, 0]),
  Uint32Array.from([0xffffffff, 11, 7, 3, 9]),
)), [4, 1, 3, 2, 0]);
assert.throws(() => addon.radixSortSomCandidateIndicesV1(
  Uint16Array.from([1, 1]), Uint16Array.from([2, 2]), Uint32Array.from([8, 8]),
), /SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE/);

// Exercise real N-API typed-array views with nonzero byte offsets.
const clusterBacking = Uint16Array.from([1234, 1, 0, 1, 1234]);
const somBacking = Uint16Array.from([1234, 2, 399, 2, 1234]);
const ordinalBacking = Uint32Array.from([1234, 5, 2, 3, 1234]);
const clusterView = clusterBacking.subarray(1, 4);
const somView = somBacking.subarray(1, 4);
const ordinalView = ordinalBacking.subarray(1, 4);
assert.equal(clusterView.byteOffset > 0, true);
assert.deepEqual(Array.from(addon.radixSortSomCandidateIndicesV1(clusterView, somView, ordinalView)), [1, 2, 0]);

const radixCountLimit = 65536;
assert.throws(() => addon.radixSortSomCandidateIndicesV1(
  new Uint16Array(radixCountLimit + 1),
  new Uint16Array(radixCountLimit + 1),
  new Uint32Array(radixCountLimit + 1),
), /SOM_RADIX_CANDIDATE_LIMIT_EXCEEDED/);
const detection = addon.detectRfcOrLanguage('detect RFC7519 in session middleware');
assert.equal(detection.matched, true);
assert.equal(detection.rfcId, 'RFC-7519');
assert.equal(detection.authority, 'PROPOSAL_ONLY');
assert.equal(addon.detectRfcOrLanguage('RFC7519 without detect').matched, false);

const packed = addon.packTurboVecMrl128(Float32Array.from({ length: 128 }, (_, index) => index));
assert.ok(Buffer.isBuffer(packed.bytea4bit));
assert.ok(Buffer.isBuffer(packed.bytea2bit));
assert.ok(Buffer.isBuffer(packed.signBitset128));
assert.equal(packed.bytea4bit.length, 64);
assert.equal(packed.bytea2bit.length, 32);
assert.equal(packed.signBitset128.length, 16);
assert.equal(packed.signBitset128BitString.length, 128);
assert.equal(packed.signBitset128BitString, '1'.repeat(128));
assert.equal(packed.authority, 'PROJECTION_PROPOSAL');
assert.throws(() => addon.packTurboVecMrl128(Float32Array.from({ length: 128 }, () => Number.NaN)));
assert.throws(() => addon.packTurboVecMrl128(Float32Array.from({ length: 128 }, () => Number.POSITIVE_INFINITY)));
assert.throws(() => addon.packTurboVecMrl128(new Float64Array(128)), /Float32Array/);
const retainedPayload = Buffer.from(packed.bytea4bit);
if (global.gc) {
  for (let index = 0; index < 4; index += 1) global.gc();
}
assert.deepEqual(packed.bytea4bit, retainedPayload);

const bitsetA = Buffer.alloc(16);
const bitsetB = Buffer.alloc(16);
bitsetA[0] = 0b11000000;
bitsetB[0] = 0b10100000;
assert.ok(Math.abs(addon.bitset128JaccardSimilarity(bitsetA, bitsetB) - (1 / 3)) < 1e-6);
const hammingQuery = Buffer.alloc(16);
const hammingCandidates = Buffer.concat([
  Buffer.alloc(16),
  Buffer.alloc(16, 0xff),
  Buffer.from([1, ...Array(15).fill(0)]),
]);
const hammingBatch = addon.scoreHamming128Batch(hammingQuery, hammingCandidates);
assert.equal(hammingBatch.schema, 'atlas.hamming128.batch-result.v1');
assert.equal(hammingBatch.authority, 'PROPOSAL_ONLY');
assert.equal(hammingBatch.candidateCount, 3);
assert.ok(['avx2-nibble-popcount', 'avx512-vpopcntdq', 'scalar-64bit-popcount'].includes(hammingBatch.backend));
assert.ok(hammingBatch.distances instanceof Uint16Array);
assert.deepEqual(Array.from(hammingBatch.distances), [0, 128, 1]);
assert.deepEqual(Array.from(addon.scoreHamming128Batch(hammingQuery, Buffer.alloc(0)).distances), []);
assert.throws(() => addon.scoreHamming128Batch(Buffer.alloc(15), Buffer.alloc(16)), /HAMMING128_BUFFER_LENGTH_INVALID/);
assert.throws(() => addon.scoreHamming128Batch(Buffer.alloc(16), Buffer.alloc(17)), /HAMMING128_BUFFER_LENGTH_INVALID/);
assert.deepEqual(
  Array.from(addon.scoreHamming128Batch(new Uint8Array(16), new Uint8Array(16)).distances),
  [0],
);
const unalignedQuery = Buffer.alloc(17).subarray(1);
const unalignedCandidates = Buffer.alloc(49).subarray(1);
unalignedCandidates[0] = 1;
assert.deepEqual(
  Array.from(addon.scoreHamming128Batch(unalignedQuery, unalignedCandidates).distances),
  [1, 0, 0],
);
assert.throws(() => addon.scoreHamming128Batch(Buffer.alloc(16), Buffer.alloc((65536 + 1) * 16)), /HAMMING128_CANDIDATE_LIMIT_EXCEEDED/);
assert.throws(() => addon.scoreHamming128Batch(new Float32Array(4), Buffer.alloc(16)), /Expected/);
const int2Fixture = Buffer.alloc(32);
int2Fixture[0] = 0b00011011;
assert.equal(addon.asymmetricDot2Bit(Float32Array.from({ length: 128 }, () => 1), int2Fixture, 0, 0.5), 3);
assert.throws(() => addon.asymmetricDot2Bit(Float32Array.from({ length: 128 }, () => 1), Buffer.alloc(31), 0, 0.5));
assert.throws(() => addon.asymmetricDot2Bit(new Float64Array(128), int2Fixture, 0, 0.5), /Float32Array/);
assert.throws(() => addon.asymmetricDot2Bit(Float32Array.from({ length: 128 }, () => Number.POSITIVE_INFINITY), int2Fixture, 0, 0.5), /Non-finite/);
assert.throws(() => addon.asymmetricDot2Bit(Float32Array.from({ length: 128 }, () => 1), int2Fixture, 0, Number.POSITIVE_INFINITY), /Non-finite/);
const int4Fixture = Buffer.alloc(64);
int4Fixture[0] = 0x12;
assert.equal(addon.asymmetricDot4Bit(Float32Array.from({ length: 128 }, () => 1), int4Fixture, 0, 0.5), 1.5);
assert.throws(() => addon.asymmetricDot4Bit(Float32Array.from({ length: 128 }, () => 1), Buffer.alloc(63), 0, 0.5));
assert.throws(() => addon.asymmetricDot4Bit(Float32Array.from({ length: 128 }, () => Number.NaN), int4Fixture, 0, 0.5), /Invalid query/);
assert.throws(() => addon.asymmetricDot4Bit(Float32Array.from({ length: 128 }, () => 1), int4Fixture, 0, -0.5), /Invalid query/);
const pgvectorWire = Buffer.alloc(4 + 768 * 4);
pgvectorWire.writeUInt16BE(768, 0);
pgvectorWire.writeUInt16BE(0, 2);
pgvectorWire.writeFloatBE(1, 4);
pgvectorWire.writeFloatBE(-2.5, 8);
const pgvectorValues = addon.unpackPgvectorBinary768(pgvectorWire);
assert.ok(pgvectorValues instanceof Float32Array);
assert.equal(pgvectorValues.length, 768);
assert.deepEqual(Array.from(pgvectorValues.slice(0, 3)), [1, -2.5, 0]);
assert.throws(() => addon.unpackPgvectorBinary768(pgvectorWire.subarray(1)), /PGVECTOR_768_BINARY_INVALID/);

const lodValues = Float32Array.from({ length: 128 }, (_, index) => index);
const lodBlock = addon.assembleLodTextureBlockV1(lodValues, 91, 13, 5);
assert.equal(lodBlock.length, 128);
assert.deepEqual(
  lodBlock,
  Buffer.from(execFileSync(process.argv[3], ['--emit-lod-texture-block-v1-fixture'], { encoding: 'utf8' }).trim(), 'hex'),
);
const retainedLodBlock = Buffer.from(lodBlock);
const lodBlockAlias = Buffer.from(lodBlock.buffer, lodBlock.byteOffset, lodBlock.byteLength);
lodBlockAlias[0] ^= 0xff;
assert.equal(lodBlock[0], lodBlockAlias[0]);
lodBlockAlias[0] ^= 0xff;
assert.deepEqual(lodBlock, retainedLodBlock);
if (global.gc) {
  for (let index = 0; index < 4; index += 1) global.gc();
}
assert.deepEqual(lodBlock, retainedLodBlock);
assert.throws(() => addon.assembleLodTextureBlockV1(lodValues, -1, 13, 5), /candidateOrdinal must be uint32/);
assert.throws(() => addon.assembleLodTextureBlockV1(lodValues, 91, 65536, 5), /somBmuId must be uint16/);
assert.throws(() => addon.assembleLodTextureBlockV1(Float32Array.from({ length: 128 }, () => Number.NaN), 91, 13, 5), /non-finite/);

process.stdout.write('node_api_smoke=PASS\n');
