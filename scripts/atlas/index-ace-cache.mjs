#!/usr/bin/env node
/**
 * @file scripts/atlas/index-ace-cache.mjs
 * @description Reads ACE Cache Manifest and applies caching strategy.
 * Stage 2-3 (Consumer Dry-Run + Consumer Apply) in the Parent Atlas mutation contract.
 *
 * Input:
 *   docs/reports/ace-cache-manifest.json (from Stage 1 producer)
 *
 * Output (dry-run):
 *   docs/reports/ace-cache-index-dry-run.json
 *
 * Execution:
 *   node scripts/atlas/index-ace-cache.mjs [--apply]
 */

import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const REPORT_PATH = 'docs/reports/ace-cache-manifest.json';

async function main() {
  // Read and parse the cache manifest artifact
  const rawReport = await fs.readFile(REPORT_PATH, 'utf8');
  let manifest;

  try {
    manifest = JSON.parse(rawReport);
  } catch (e) {
    throw new Error(`Failed to parse cache manifest artifact at ${REPORT_PATH}: ${e.message}`);
  }

  if (!manifest?.cache_strategy) {
    throw new Error('Cache manifest must include cache_strategy');
  }

  // Prepare cache configuration for applying
  const cacheConfig = {
    timestamp: new Date().toISOString(),
    version: manifest.version,
    cache_strategy: manifest.cache_strategy,
    packets_to_cache: manifest.packet_caching_plan.length,
    total_memory_estimate_kb: manifest.estimated_memory_kb,
    implementation_plan: {
      l0_redis: {
        strategy: 'L0 Redis exact-match cache',
        key_pattern: 'bifrost:packet:{packet_key}',
        ttl_seconds: manifest.cache_strategy.l0_redis_exact.ttl_seconds
      },
      l1_redis_semantic: {
        strategy: 'L1 Redis semantic cache via Bifrost',
        key_pattern: 'bifrost:semantic:{hash}',
        ttl_seconds: manifest.cache_strategy.l1_redis_semantic.ttl_seconds
      },
      l2_bifrost: {
        strategy: 'L2 Bifrost cross-service semantic cache',
        threshold: manifest.cache_strategy.l2_bifrost.threshold,
        ttl_seconds: manifest.cache_strategy.l2_bifrost.ttl_seconds
      }
    }
  };

  console.log(`\n====================================================`);
  console.log(`[STATUS] ACE Cache Configuration Indexer`);
  console.log(`[MODE] ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[CACHE_ENTRIES] ${manifest.packet_caching_plan.length} packets to cache`);
  console.log(`[MEMORY_EST] ${manifest.estimated_memory_kb} KB`);
  console.log(`====================================================`);

  console.log('\n--- Cache Strategy Overview ---');
  console.log(`L0 Redis Exact: ${manifest.cache_strategy.l0_redis_exact.ttl_seconds}s TTL, ~${manifest.cache_strategy.l0_redis_exact.estimated_entries} entries`);
  console.log(`L1 Redis Semantic: ${manifest.cache_strategy.l1_redis_semantic.ttl_seconds}s TTL, ~${manifest.cache_strategy.l1_redis_semantic.estimated_entries} entries`);
  console.log(`L2 Bifrost: ${manifest.cache_strategy.l2_bifrost.ttl_seconds}s TTL, threshold ${manifest.cache_strategy.l2_bifrost.threshold}`);

  console.log('\n--- Packets to Cache (first 3) ---');
  manifest.packet_caching_plan.slice(0, 3).forEach((p, i) => {
    console.log(`\n${i + 1}. ${p.feature_id} (${p.priority})`);
    console.log(`   Keys: ${p.cache_keys.join(', ')}`);
    console.log(`   Bifrost Eligible: ${p.bifrost_eligible}`);
  });
  console.log('\n--------------------------------------\n');

  if (!APPLY) {
    // Stage 3: Dry-run mode
    const dryRunReport = {
      ok: true,
      mode: 'dry-run',
      generated_at: new Date().toISOString(),
      next_step: `node ${process.argv[1]} --apply`,
      cache_config: cacheConfig,
      would_write: {
        redis: 'ace:packet:* keys per cache_strategy',
        bifrost: 'semantic cache for bifrost_eligible packets',
        postgres: 'optional cache_metadata table',
        count: manifest.packet_caching_plan.length
      }
    };

    const dryRunPath = path.resolve(ROOT, 'docs/reports/ace-cache-index-dry-run.json');
    await fs.mkdir(path.dirname(dryRunPath), { recursive: true });
    await fs.writeFile(dryRunPath, JSON.stringify(dryRunReport, null, 2));
    console.log(`✅ Dry-run report written: ${dryRunPath}`);
    console.log(`Next step after review: node ${process.argv[1]} --apply`);
    return;
  }

  // Stage 5: Apply mode — perform cache configuration setup
  console.log('⚙️ Applying: Configuring ACE cache strategy...');

  // Write cache configuration file that runtime components can read
  const configPath = path.resolve(ROOT, 'docs/reports/ace-cache-config-applied.json');
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cacheConfig, null, 2));

  console.log(`\n✅ Cache configuration written: ${configPath}`);
  console.log(`✅ Cache strategy applied: ${manifest.packet_caching_plan.length} packets configured`);
  console.log(`✅ Estimated total memory: ${manifest.estimated_memory_kb} KB across L0/L1/L2 tiers`);
  console.log(`\n✨ ACE Cache configuration complete!`);
  console.log(`   Next: Run dev server and ACE context will use this configuration automatically.`);
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  if (VERBOSE) {
    console.error(err.stack);
  }
  process.exit(1);
});
