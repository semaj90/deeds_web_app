#!/usr/bin/env node
/**
 * Writes the raw-glyph + reference binary files
 * native/cutile-ace-level2/glyph_kernels_bench.cu reads, for the
 * GlyphScoreV1 and ResidencySortKeyV1-GPU exact-match verification
 * (openspec/changes/parent-atlas-cutile-ace-level2, tasks.md 4.1).
 *
 * Reuses the existing generateAceRadix01FixtureV1() glyph generator and its
 * existing packedKeys output as the ResidencySortKeyV1 CPU oracle -- no new
 * fixture is generated here, only new binary encodings of the SAME fixture
 * data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateAceRadix01FixtureV1, packedKeysToBuffer } from './fixture-v1.mjs';
import { computeGlyphScoresV1Reference, glyphScoresToBuffer, glyphsToBuffer } from './glyph-score-v1.mjs';

const FIXTURE_SIZES = [256, 1000, 4000];

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

export function writeCutileLevel2Fixtures(outDir) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const n of FIXTURE_SIZES) {
    const { glyphs, packedKeys } = generateAceRadix01FixtureV1(n);
    const scores = computeGlyphScoresV1Reference(glyphs);

    const glyphsPath = join(outDir, `glyphs-n${n}.bin`);
    const scoresPath = join(outDir, `glyph-scores-n${n}-reference.bin`);
    const keysPath = join(outDir, `packed-keys-n${n}-reference.bin`);

    writeFileSync(glyphsPath, glyphsToBuffer(glyphs));
    writeFileSync(scoresPath, glyphScoresToBuffer(scores));
    writeFileSync(keysPath, packedKeysToBuffer(packedKeys));

    written.push({ n, glyphsPath, scoresPath, keysPath });
  }
  return written;
}

if (isMainModule()) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  const written = writeCutileLevel2Fixtures(outDir);
  for (const w of written) {
    console.log(`wrote N=${w.n}: ${w.glyphsPath}, ${w.scoresPath}, ${w.keysPath}`);
  }
}
