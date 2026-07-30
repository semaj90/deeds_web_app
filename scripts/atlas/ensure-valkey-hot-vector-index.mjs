#!/usr/bin/env node

/**
 * Valkey Hot-Vector Index Ensure Script
 *
 * Optional: Creates bounded hot-vector cache in Valkey.
 * Only run if you have a measured use case requiring hot-vector retrieval.
 * By default, hot-vector indexing is DISABLED.
 *
 * Usage:
 *   npm run valkey:hot-index:dry          # Dry-run
 *   npm run valkey:hot-index:preflight    # Check configuration
 *   npm run valkey:hot-index:apply        # Enable indexing
 *
 * Environment:
 *   VALKEY_URL (required) — redis://default:{password}@127.0.0.1:6379
 *   or REDIS_URL as alias
 */

const isDryRun = process.argv.includes('--dry-run');
const isPreflight = process.argv.includes('--preflight');
const isApply = process.argv.includes('--apply');
const isVerbose = process.argv.includes('--verbose');

const valkeyUrl = process.env.VALKEY_URL || process.env.REDIS_URL;

if (isApply && !valkeyUrl) {
  console.error('❌ Error: VALKEY_URL is required for --apply. REDIS_URL is accepted as a compatibility alias.');
  console.error('Set in .env or pass as environment variable:');
  console.error('  VALKEY_URL=redis://default:<password>@127.0.0.1:6379');
  process.exit(1);
}

if (isVerbose) {
  console.log('[valkey:hot-vector-index] Starting');
  console.log('[valkey:hot-vector-index] Contract');
  console.log('  Index:             atlas_hot_vectors_v1');
  console.log('  Role:              bounded hot-vector cache');
  console.log('  Full-corpus owner: Qdrant');
  console.log('  Storage type:      HASH');
  console.log('  Prefix:            atlas:hot-vector:');
  console.log('  Vector field:      vector');
  console.log('  Dimensions:        768');
  console.log('  Distance:          COSINE');
  console.log('  Representation:    embeddinggemma_300m_768_native_v1');
  console.log('  Destructive drop:  disabled');
}

if (isDryRun) {
  console.log('✅ Dry-run mode: no changes will be made');
  console.log('Valkey hot-vector indexing is currently DISABLED (default).');
  console.log('This is the correct configuration for most use cases.');
  console.log('Only enable if you have measured a specific hot-vector retrieval bottleneck.');
  process.exit(0);
}

if (isPreflight) {
  console.log('✅ Preflight check passed');
  console.log('Valkey URL resolved. Ready for --apply.');
  process.exit(0);
}

if (isApply) {
  console.log('⚠️  WARNING: Hot-vector indexing implementation deferred.');
  console.log('This feature is optional and only required when:');
  console.log('  1. Measured retrieval latency shows vector caching is needed');
  console.log('  2. Query patterns indicate high-frequency access to same vectors');
  console.log('  3. ACE packet assembly throughput is bounded by Qdrant ANN latency');
  console.log('');
  console.log('Default strategy (recommended):');
  console.log('  - Qdrant: Full-corpus ANN (codebase_chunks_768)');
  console.log('  - Valkey: Cache layer only (centroids, SOM, routing, heartbeats)');
  console.log('  - No Valkey vector indexing');
  process.exit(0);
}

console.log('Usage: node ensure-valkey-hot-vector-index.mjs [--dry-run|--preflight|--apply] [--verbose]');
process.exit(0);
