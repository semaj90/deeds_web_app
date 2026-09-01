#!/usr/bin/env node
/**
 * ACE-RADIX-01 fixture generator.
 *
 * Deterministic PacketGlyphV1 fixture generator per
 * openspec/changes/parent-atlas-tensor-residency-integration/tasks.md.
 *
 * Seeding algorithm: mulberry32 PRNG seeded with a fixed 32-bit constant
 * derived from `sha256("ace-radix-01:" + N).slice(0, 8)` interpreted as a
 * big-endian uint32. This makes the seed itself a pure function of N (no
 * external seed file to keep in sync), and the PRNG is a standard, small,
 * widely-documented deterministic generator (not a CSPRNG — determinism, not
 * unpredictability, is the requirement here).
 *
 * Each PacketGlyphV1 field is sampled uniformly within its declared bit-width
 * bounds (see specs/ace-bitfrost-residency-glyph/spec.md). The corresponding
 * ResidencySortKeyV1 fields are derived deterministically from the glyph:
 *   tier            = residency               (already 0..255)
 *   lod              = lod                     (already 0..255)
 *   utilityBucket    = floor(pagerankQuantized / 257)   (0..65535 -> 0..255)
 *   recencyBucket    = floor(recency / 257)             (0..65535 -> 0..255)
 *   projectionOrdinal = projectionOrdinal      (already 0..4294967295)
 *
 * The packed 64-bit sort key (matching CUB DeviceRadixSort::SortKeys ascending
 * order) is:
 *   packedKey = (tier << 56) | (lod << 48) | (utilityBucket << 40)
 *             | (recencyBucket << 32) | projectionOrdinal
 *
 * Output: a flat little-endian uint64 array written as raw bytes, one entry
 * per candidate, in generation order. This file format is what the native
 * ACE-RADIX-01 benchmark harness (native/ace-radix-01/radix_bench.cu) reads.
 */
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_SIZES = [256, 1000, 4000, 16000, 64000];

function seedFor(n) {
  const digest = createHash('sha256').update(`ace-radix-01:${n}`).digest();
  return digest.readUInt32BE(0);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(next, maxInclusive) {
  return Math.floor(next() * (maxInclusive + 1));
}

/**
 * @param {number} n
 * @returns {{ glyphs: Array<Record<string, number>>, packedKeys: bigint[] }}
 */
export function generateAceRadix01FixtureV1(n) {
  const next = mulberry32(seedFor(n));
  const glyphs = [];
  const packedKeys = [];

  for (let i = 0; i < n; i += 1) {
    const projectionOrdinal = randInt(next, 4294967295);
    const featureBits = randInt(next, 65535);
    const lod = randInt(next, 255);
    const residency = randInt(next, 255);
    const pagerankQuantized = randInt(next, 65535);
    const recency = randInt(next, 65535);
    const somCell = randInt(next, 65535);
    const flags = randInt(next, 65535);

    glyphs.push({
      projectionOrdinal,
      featureBits,
      lod,
      residency,
      pagerankQuantized,
      recency,
      somCell,
      flags,
    });

    const tier = BigInt(residency);
    const lodField = BigInt(lod);
    const utilityBucket = BigInt(Math.floor(pagerankQuantized / 257));
    const recencyBucket = BigInt(Math.floor(recency / 257));
    const ordinal = BigInt(projectionOrdinal);

    const packedKey =
      (tier << 56n) | (lodField << 48n) | (utilityBucket << 40n) | (recencyBucket << 32n) | ordinal;
    packedKeys.push(packedKey);
  }

  return { glyphs, packedKeys };
}

export function packedKeysToBuffer(packedKeys) {
  const buffer = Buffer.alloc(packedKeys.length * 8);
  for (let i = 0; i < packedKeys.length; i += 1) {
    buffer.writeBigUInt64LE(packedKeys[i], i * 8);
  }
  return buffer;
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  mkdirSync(outDir, { recursive: true });

  for (const n of FIXTURE_SIZES) {
    const { packedKeys } = generateAceRadix01FixtureV1(n);
    const buffer = packedKeysToBuffer(packedKeys);
    const outPath = join(outDir, `packed-keys-n${n}.bin`);
    writeFileSync(outPath, buffer);
    console.log(`wrote ${outPath} (${buffer.length} bytes, ${n} keys)`);
  }
}
