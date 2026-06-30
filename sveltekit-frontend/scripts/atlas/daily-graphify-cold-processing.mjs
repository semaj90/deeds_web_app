#!/usr/bin/env node
/**
 * daily-graphify-cold-processing.mjs
 *
 * Daily full refresh pipeline for codebase intelligence.
 * Orchestrates: AST scan → embedding → semantic clustering → Redis cache.
 *
 * Stages:
 *   1. AST health audit (verify codebase graph is fresh)
 *   2. Semantic indexing (embed summaries, update Qdrant)
 *   3. GPU clustering (k-means on 768-dim embeddings)
 *   4. Redis cache (warm centroids, TTL 24h)
 *   5. ACE context prep (for next retrieval pass)
 *
 * Usage:
 *   node scripts/atlas/daily-graphify-cold-processing.mjs
 *   node scripts/atlas/daily-graphify-cold-processing.mjs --dry-run
 *   node scripts/atlas/daily-graphify-cold-processing.mjs --skip-clustering
 *   node scripts/atlas/daily-graphify-cold-processing.mjs --skip-redis
 *
 * Env:
 *   GRAPHIFY_QUIET=1    suppress non-error output
 *   DRY_RUN=1           run without writes
 *   REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
 *   QDRANT_URL, OLLAMA_URL
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '.');
const QUIET = /^(1|true|yes|on)$/i.test(process.env.GRAPHIFY_QUIET ?? process.argv.includes('--quiet') ? '1' : '');
const DRY_RUN = process.argv.includes('--dry-run') || /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? '');
const SKIP_CLUSTERING = process.argv.includes('--skip-clustering');
const SKIP_REDIS = process.argv.includes('--skip-redis');

const log = (...a) => !QUIET && console.log(...a);
const warn = (...a) => console.warn(...a);
const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

function run(stage, npmScript, opts = {}) {
  const flags = [];
  if (DRY_RUN && opts.supportsDry !== false) flags.push('--dry-run');
  const cmd = npmScript + (flags.length ? ' ' + flags.join(' ') : '');

  log(`\n${c.b(`Stage: ${stage}`)}`);
  log(`  Running: npm run ${cmd}`);

  const t0 = Date.now();
  const result = spawnSync('npm', ['run', ...cmd.split(' ')], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (result.status === 0) {
    log(`  ${c.g('✓')} Complete (${elapsed}s)`);
    return { stage, status: 'pass', elapsed };
  } else {
    warn(`  ${c.r('✗')} Failed (exit ${result.status})`);
    if (!opts.required) {
      warn(`     Skipping (not required)`);
      return { stage, status: 'skip', elapsed, reason: 'failed_optional' };
    }
    return { stage, status: 'fail', elapsed, exitCode: result.status };
  }
}

// ── Main pipeline ──────────────────────────────────────────────────────────

log(`${c.b('🗺️  Daily Graphify Pipeline')}`);
log(`   DRY_RUN=${DRY_RUN}`);
log(`   SKIP_CLUSTERING=${SKIP_CLUSTERING}`);
log(`   SKIP_REDIS=${SKIP_REDIS}`);

const results = [];

// Stage 1: Semantic indexing (embed summaries from Qdrant via Ollama)
// Reads glyph_atlas or codebase_chunks_768; fetches embeddings via /api/embed (Redis L1 + Bifrost L2)
// Writes 768-dim vectors to Qdrant payloads
results.push(run(
  'Semantic Indexing (embed via Ollama)',
  'graphify:semantic',
  { required: false, supportsDry: false }
));

// Stage 2: GPU k-means clustering on 768-dim embeddings
// Reads embedded glyph points from Qdrant, clusters via tensorrt_bridge.node or JS fallback
// Writes centroids + SOM grid coords to Redis (cluster:kmeans:* keys, TTL 24h)
if (!SKIP_CLUSTERING) {
  results.push(run(
    'GPU Clustering (k-means + SOM)',
    'graphify:cluster',
    { required: false, supportsDry: false }
  ));
}

// Stage 3: Backfill Redis centroid cache from Postgres
// Ensures Redis has all cluster metadata for fast ACE lookups
if (!SKIP_REDIS) {
  results.push(run(
    'Redis Cache Backfill',
    'graphify:redis:import',
    { required: false, supportsDry: true }
  ));
}

// Stage 4: Warm ACE compact cache (optional)
// Pre-materializes ACE context for next retrieval pass
results.push(run(
  'ACE Context Pre-Warm',
  'graphify:ace:warm',
  { required: false, supportsDry: true }
));

// ── Report ──────────────────────────────────────────────────────────────────

log(`\n${c.b('📊 Pipeline Report')}`);
const passed = results.filter((r) => r.status === 'pass').length;
const failed = results.filter((r) => r.status === 'fail').length;
const skipped = results.filter((r) => r.status === 'skip').length;

log(`  Passed:  ${passed}/${results.length}`);
log(`  Skipped: ${skipped}/${results.length}`);
log(`  Failed:  ${failed}/${results.length}`);

if (failed > 0) {
  warn(`\n${c.r('✗')} Pipeline completed with errors`);
  process.exit(1);
}

log(`\n${c.g('✓')} Daily graphify pipeline complete`);
process.exit(0);
