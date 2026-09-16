#!/usr/bin/env node
/**
 * CUTILE-ACE-BOUNDARY-01 -- explicit boundary-value fixture (not random).
 *
 * Closes two previously-recorded gaps at once:
 *   1. "CUDA boundary-value tests -- not pursued" (recorded in
 *      next_steps/active/2026-09-14_gpu-mini-fabric-cutile-level3-and-tests.md
 *      for LEVEL 2's glyph_kernels_bench.cu) -- all-zero/all-max glyphs were
 *      never explicitly tested, only the seeded-random fixture.
 *   2. The LEVEL 3 Python kernel's ct.floordiv() unsigned-division backend
 *      limitation was worked around by casting pagerankQuantized/recency to
 *      int32 before dividing (glyph_fused_tile.py). That cast is safe ONLY
 *      if these fields never exceed INT32_MAX when read as unsigned -- this
 *      fixture proves the ACTUAL admitted bound is far narrower than that:
 *      both fields are declared/sampled as uint16 (0..65535, see
 *      fixture-v1.mjs's own docstring: "sampled uniformly within its
 *      declared bit-width bounds"), which is nowhere near INT32_MAX
 *      (2147483647). This fixture exercises the real boundary (65535), not
 *      an arbitrary "large enough" number, so the workaround is proven
 *      correct for the declared field contract, not merely empirically
 *      unproblematic for random seeded values.
 *
 * All rows share a fixed baseline for fields not under test, varying ONE
 * axis per row (plus two "everything extreme at once" rows), matching the
 * "explicit all-zero/all-max glyph" ask directly.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packGlyphKeyV1 } from './fixture-v1.mjs';
import { computeGlyphScoresV1Reference, glyphScoresToBuffer, glyphsToBuffer } from './glyph-score-v1.mjs';

const BASELINE = {
  projectionOrdinal: 12345,
  featureBits: 0x00ff,
  lod: 3,
  residency: 2,
  pagerankQuantized: 500,
  recency: 500,
  somCell: 0, // never a scoring input -- held at an arbitrary fixed value throughout
  flags: 0x00ff,
};

const PAGERANK_RECENCY_BOUNDARY_VALUES = [0, 1, 256, 257, 258, 65535];

export function generateCutileAceBoundaryFixtureV1() {
  const glyphs = [];

  // Axis 1: pagerankQuantized boundary sweep (recency held at baseline).
  for (const v of PAGERANK_RECENCY_BOUNDARY_VALUES) {
    glyphs.push({ ...BASELINE, pagerankQuantized: v });
  }
  // Axis 2: recency boundary sweep (pagerankQuantized held at baseline).
  for (const v of PAGERANK_RECENCY_BOUNDARY_VALUES) {
    glyphs.push({ ...BASELINE, recency: v });
  }
  // Axis 3: pagerankQuantized and recency at opposite extremes simultaneously.
  glyphs.push({ ...BASELINE, pagerankQuantized: 0, recency: 65535 });
  glyphs.push({ ...BASELINE, pagerankQuantized: 65535, recency: 0 });

  // Axis 4: featureBits / flags bit-pattern extremes (the originally-flagged
  // "all-zero featureBits, all-max featureBits, all-zero flags, all-max
  // flags" gap) -- each varied independently of the other.
  glyphs.push({ ...BASELINE, featureBits: 0x0000 });
  glyphs.push({ ...BASELINE, featureBits: 0xffff });
  glyphs.push({ ...BASELINE, flags: 0x0000 });
  glyphs.push({ ...BASELINE, flags: 0xffff });

  // Axis 5: lod / residency at their declared uint8 bounds.
  glyphs.push({ ...BASELINE, lod: 0 });
  glyphs.push({ ...BASELINE, lod: 255 });
  glyphs.push({ ...BASELINE, residency: 0 });
  glyphs.push({ ...BASELINE, residency: 255 });

  // Axis 6: projectionOrdinal at its declared uint32 bounds.
  glyphs.push({ ...BASELINE, projectionOrdinal: 0 });
  glyphs.push({ ...BASELINE, projectionOrdinal: 4294967295 });

  // Axis 7: everything-extreme-at-once, both directions (all-zero glyph,
  // all-max glyph) -- the two cases most likely to reveal an integer
  // overflow, wraparound, or sign-extension bug if one exists.
  glyphs.push({
    projectionOrdinal: 0,
    featureBits: 0,
    lod: 0,
    residency: 0,
    pagerankQuantized: 0,
    recency: 0,
    somCell: 0,
    flags: 0,
  });
  glyphs.push({
    projectionOrdinal: 4294967295,
    featureBits: 0xffff,
    lod: 255,
    residency: 255,
    pagerankQuantized: 65535,
    recency: 65535,
    somCell: 65535,
    flags: 0xffff,
  });

  const scores = computeGlyphScoresV1Reference(glyphs);
  const packedKeys = glyphs.map(packGlyphKeyV1);

  return { glyphs, scores, packedKeys };
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  mkdirSync(outDir, { recursive: true });
  const { glyphs, scores, packedKeys } = generateCutileAceBoundaryFixtureV1();
  const n = glyphs.length;

  const glyphsPath = join(outDir, `glyphs-boundary-n${n}.bin`);
  const scoresPath = join(outDir, `glyph-scores-boundary-n${n}-reference.bin`);
  const keysPath = join(outDir, `packed-keys-boundary-n${n}-reference.bin`);

  writeFileSync(glyphsPath, glyphsToBuffer(glyphs));
  writeFileSync(scoresPath, glyphScoresToBuffer(scores));

  const keysBuffer = Buffer.alloc(packedKeys.length * 8);
  for (let i = 0; i < packedKeys.length; i += 1) {
    keysBuffer.writeBigUInt64LE(packedKeys[i], i * 8);
  }
  writeFileSync(keysPath, keysBuffer);

  console.log(`wrote N=${n} boundary fixture: ${glyphsPath}, ${scoresPath}, ${keysPath}`);
  for (let i = 0; i < n; i += 1) {
    console.log(`  [${i}] ${JSON.stringify(glyphs[i])} -> score=${scores[i]} key=${packedKeys[i]}`);
  }
}
