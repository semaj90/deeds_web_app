#!/usr/bin/env node
/**
 * run-seed-nonfatal.mjs — shell-agnostic wrapper for atlas:cartridge-seed
 *
 * Spawns `node scripts/atlas/atlas-cartridge-seed.mjs` and catches any failure,
 * writing a warning into .tmp/atlas-cartridge-seed-meta.json so that
 * graphify-health.mjs can surface it without breaking the daily pipeline.
 *
 * This script ALWAYS exits 0 — it is designed to be used in && chains where
 * `|| true` is not cross-platform (Windows PowerShell vs bash).
 *
 * Usage (from sveltekit-frontend/):
 *   node scripts/atlas/run-seed-nonfatal.mjs
 *   node scripts/atlas/run-seed-nonfatal.mjs -- --publish   (forward flags)
 */

import { spawnSync }                         from 'node:child_process';
import { writeFileSync, mkdirSync }          from 'node:fs';
import { join, resolve }                     from 'node:path';
import { fileURLToPath }                     from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = resolve(__dirname, '../..'); // sveltekit-frontend/
const TMP_DIR   = join(ROOT, '.tmp');
const SEED_META = join(TMP_DIR, 'atlas-cartridge-seed-meta.json');

// Forward any extra flags that appear after the optional `--` separator
const passthrough = process.argv.slice(2).filter(a => a !== '--');

const result = spawnSync(
  process.execPath, // node
  ['scripts/atlas/atlas-cartridge-seed.mjs', ...passthrough],
  {
    stdio:   'inherit',
    shell:   false,
    cwd:     ROOT,
    timeout: 120_000, // 2 min hard cap
  },
);

if (result.status !== 0 || result.error) {
  const code    = result.status ?? 'SIGTERM';
  const errMsg  = result.error?.message ?? `exited with code ${code}`;
  const warning = `atlas:cartridge-seed failed (${errMsg}) — pipeline continues`;

  console.warn('[run-seed-nonfatal] ⚠', warning);

  // Write a degraded meta so graphify-health can report it
  try {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(
      SEED_META,
      JSON.stringify(
        {
          seed_count:  0,
          status:      'failed',
          warning,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch {
    /* best-effort — ignore secondary write failure */
  }
}

// Always exit 0 so the pipeline continues
process.exit(0);
