#!/usr/bin/env node
/**
 * CUTILE-ACE-01 LEVEL 2 wrapper harness.
 *
 * Runs native/cutile-ace-level2/glyph_kernels_bench.exe against every
 * fixture size, and writes the consolidated
 * docs/reports/cutile-ace-level2-results.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BENCH_EXE = join(REPO_ROOT, 'native', 'cutile-ace-level2', 'glyph_kernels_bench.exe');
const FIXTURES_DIR = join(REPO_ROOT, 'scripts', 'atlas', 'ace-radix-01', 'fixtures');
const OUT_PATH = join(REPO_ROOT, 'docs', 'reports', 'cutile-ace-level2-results.json');

const FIXTURE_SIZES = [256, 1000, 4000];

function main() {
  const perSizeResults = [];
  for (const n of FIXTURE_SIZES) {
    const glyphsPath = join(FIXTURES_DIR, `glyphs-n${n}.bin`);
    const scoresPath = join(FIXTURES_DIR, `glyph-scores-n${n}-reference.bin`);
    const keysPath = join(FIXTURES_DIR, `packed-keys-n${n}-reference.bin`);

    const stdout = execFileSync(
      BENCH_EXE,
      [glyphsPath, scoresPath, keysPath, String(n)],
      { encoding: 'utf8' }
    ).trim();
    perSizeResults.push(JSON.parse(stdout));
  }

  const allExact = perSizeResults.every(
    (r) => r.glyphScoreV1ExactMatch && r.residencyKeyPackV1ExactMatch
  );

  const report = {
    schema: 'atlas.cutile-ace-level2.wrapped-result.v1',
    test: 'CUTILE-ACE-01-LEVEL2',
    read_only: true,
    canonical_production_data_touched: false,
    canonical_production_data_mutated: false,
    per_size_results: perSizeResults,
    gate: {
      criterion: 'GlyphScoreV1 and ResidencySortKeyV1-GPU must exactly match their CPU oracles at every tested fixture size',
      fixture_sizes_tested: FIXTURE_SIZES,
      all_exact_match: allExact,
      RESULT: allExact ? 'DRY_RUN_PROVEN' : 'FAIL',
    },
    level3_gate_status: {
      level1_cub_oracle: 'DRY_RUN_PROVEN (docs/reports/ace-radix-01-results.json)',
      level2_glyph_score_and_key_pack: allExact ? 'DRY_RUN_PROVEN (this report)' : 'FAIL (this report)',
      cutile_ace_01_level3_unblocked: allExact,
      note: 'LEVEL 3 (fused cuTile score->key-pack->partition) still requires a CUDA 13.2+ host with a real cuTile programming API (this dev host\'s native Windows CUDA 13.0 toolkit only ships a compiler-intrinsic stub, per ACE-RADIX-01\'s own finding) -- LEVEL 2 passing here unblocks attempting LEVEL 3, it does not itself run it.',
    },
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log('Report:', OUT_PATH);
}

main();
