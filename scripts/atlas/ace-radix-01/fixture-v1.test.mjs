#!/usr/bin/env node
/**
 * Regression test: ACE-RADIX-01 fixture regeneration is byte-identical at a
 * fixed N. Run with: node scripts/atlas/ace-radix-01/fixture-v1.test.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateAceRadix01FixtureV1, packedKeysToBuffer } from './fixture-v1.mjs';

function bufferSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL - ${name}`);
    console.error(err);
  }
}

for (const n of [256, 1000, 4000]) {
  check(`fixture N=${n} regenerates byte-identical`, () => {
    const first = generateAceRadix01FixtureV1(n);
    const second = generateAceRadix01FixtureV1(n);

    assert.deepEqual(first.glyphs, second.glyphs);
    assert.equal(first.packedKeys.length, n);
    assert.equal(second.packedKeys.length, n);

    const firstHash = bufferSha256(packedKeysToBuffer(first.packedKeys));
    const secondHash = bufferSha256(packedKeysToBuffer(second.packedKeys));
    assert.equal(firstHash, secondHash);
  });
}

check('different N values produce different seeds (sanity)', () => {
  const a = generateAceRadix01FixtureV1(256);
  const b = generateAceRadix01FixtureV1(1000);
  const hashA = bufferSha256(packedKeysToBuffer(a.packedKeys.slice(0, 256)));
  const hashB = bufferSha256(packedKeysToBuffer(b.packedKeys.slice(0, 256)));
  assert.notEqual(hashA, hashB);
});

check('every glyph field stays within its declared bit-width bound', () => {
  const { glyphs } = generateAceRadix01FixtureV1(4000);
  for (const g of glyphs) {
    assert.ok(g.projectionOrdinal >= 0 && g.projectionOrdinal <= 4294967295);
    assert.ok(g.featureBits >= 0 && g.featureBits <= 65535);
    assert.ok(g.lod >= 0 && g.lod <= 255);
    assert.ok(g.residency >= 0 && g.residency <= 255);
    assert.ok(g.pagerankQuantized >= 0 && g.pagerankQuantized <= 65535);
    assert.ok(g.recency >= 0 && g.recency <= 65535);
    assert.ok(g.somCell >= 0 && g.somCell <= 65535);
    assert.ok(g.flags >= 0 && g.flags <= 65535);
  }
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nall checks passed');
}
