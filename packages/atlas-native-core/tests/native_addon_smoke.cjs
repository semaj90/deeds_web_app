const assert = require('node:assert/strict');
const path = require('node:path');

const addon = require(path.join(path.resolve(process.argv[2]), 'atlas_native_core.node'));
const { execFileSync } = require('node:child_process');
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
