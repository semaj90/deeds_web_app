#!/usr/bin/env node
/**
 * Regression tests for GlyphScoreV1's CPU oracle.
 * Run with: node scripts/atlas/ace-radix-01/glyph-score-v1.test.mjs
 */
import assert from 'node:assert/strict';
import { generateAceRadix01FixtureV1 } from './fixture-v1.mjs';
import { computeGlyphScoreV1Reference, computeGlyphScoresV1Reference, popcount16 } from './glyph-score-v1.mjs';

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

check('popcount16 matches known values', () => {
  assert.equal(popcount16(0), 0);
  assert.equal(popcount16(0xffff), 16);
  assert.equal(popcount16(0b1010101010101010), 8);
  assert.equal(popcount16(1), 1);
});

for (const n of [256, 1000, 4000]) {
  check(`GlyphScoreV1 regenerates byte-identical for N=${n}`, () => {
    const { glyphs } = generateAceRadix01FixtureV1(n);
    const first = computeGlyphScoresV1Reference(glyphs);
    const second = computeGlyphScoresV1Reference(glyphs);
    assert.deepEqual(first, second);
    assert.equal(first.length, n);
  });
}

check('GlyphScoreV1 stays within the verified max bound (656,950)', () => {
  const { glyphs } = generateAceRadix01FixtureV1(4000);
  const scores = computeGlyphScoresV1Reference(glyphs);
  for (const s of scores) {
    assert.ok(s >= 0 && s <= 656950, `score ${s} out of bounds`);
  }
});

check('somCell does not influence the score', () => {
  const base = {
    pagerankQuantized: 1000,
    recency: 2000,
    residency: 10,
    lod: 5,
    featureBits: 0b1010,
    flags: 0b0101,
    somCell: 111,
    projectionOrdinal: 1,
  };
  const variant = { ...base, somCell: 65535 };
  assert.equal(computeGlyphScoreV1Reference(base), computeGlyphScoreV1Reference(variant));
});

check('projectionOrdinal does not influence the score', () => {
  const base = {
    pagerankQuantized: 1000,
    recency: 2000,
    residency: 10,
    lod: 5,
    featureBits: 0b1010,
    flags: 0b0101,
    somCell: 111,
    projectionOrdinal: 1,
  };
  const variant = { ...base, projectionOrdinal: 4294967295 };
  assert.equal(computeGlyphScoreV1Reference(base), computeGlyphScoreV1Reference(variant));
});

check('formula is purely additive integer arithmetic (spot check against hand-computed value)', () => {
  const glyph = {
    pagerankQuantized: 100,
    recency: 200,
    residency: 3,
    lod: 2,
    featureBits: 0b11, // popcount 2
    flags: 0b1, // popcount 1
  };
  // 100*4 + 200*3 + 3*257*2 + 2*257*1 + 2*50 + 1*50
  const expected = 400 + 600 + 1542 + 514 + 100 + 50;
  assert.equal(computeGlyphScoreV1Reference(glyph), expected);
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\nall checks passed');
}
