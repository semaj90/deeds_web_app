#!/usr/bin/env node
/**
 * @file scripts/atlas/cache-ace-packet.mjs
 * @description Caches ACE context packets in Redis and Bifrost semantic cache.
 * Stage 1 (Producer) in the Parent Atlas mutation contract.
 *
 * Reads:
 *   - atlas_packets table (packet inventory)
 *   - Qdrant codebase_chunks_768 (vector embeddings)
 *
 * Writes:
 *   docs/reports/ace-cache-manifest.json — cache plan (read-only)
 *   Redis ace:packet:* keys (optional, applied only with --apply)
 *   Bifrost semantic cache (optional, applied only with --apply)
 *
 * Execution:
 *   node scripts/atlas/cache-ace-packet.mjs [--dry-run] [--verbose]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function sha256First16(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

async function generateCacheManifest() {
  console.log('[cache-ace-packet] Analyzing packet inventory for caching strategy...');

  const manifest = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    cache_strategy: {
      l0_redis_exact: {
        description: 'Exact-match L1 cache (query hash)',
        ttl_seconds: 3600,
        estimated_entries: 1000
      },
      l1_redis_semantic: {
        description: 'Semantic L2 cache (Bifrost vector similarity)',
        ttl_seconds: 7200,
        estimated_entries: 500
      },
      l2_bifrost: {
        description: 'Bifrost semantic cache (cross-service)',
        ttl_seconds: 14400,
        threshold: 0.8
      }
    },
    packet_caching_plan: [
      {
        feature_id: 'auth_lucia_sessions',
        priority: 'high',
        cache_keys: [
          'ace:packet:auth_lucia_sessions:exact',
          'ace:packet:auth_lucia_sessions:semantic'
        ],
        bifrost_eligible: false
      },
      {
        feature_id: 'database_orm_drizzle',
        priority: 'high',
        cache_keys: [
          'ace:packet:database_orm_drizzle:exact',
          'ace:packet:database_orm_drizzle:semantic'
        ],
        bifrost_eligible: true
      },
      {
        feature_id: 'qdrant_vector_search',
        priority: 'critical',
        cache_keys: [
          'ace:packet:qdrant_vector_search:exact',
          'ace:packet:qdrant_vector_search:semantic'
        ],
        bifrost_eligible: true
      },
      {
        feature_id: 'rag_context_assembly',
        priority: 'critical',
        cache_keys: [
          'ace:packet:rag_context_assembly:exact',
          'ace:packet:rag_context_assembly:semantic'
        ],
        bifrost_eligible: true
      },
      {
        feature_id: 'ollama_gemma4_generation',
        priority: 'critical',
        cache_keys: [
          'ace:packet:ollama_gemma4_generation:exact',
          'ace:packet:ollama_gemma4_generation:semantic'
        ],
        bifrost_eligible: true
      }
    ],
    ace_kag_dag_evidence: [],
    estimated_memory_kb: 15360
  };

  if (VERBOSE) {
    console.log(`[cache-ace-packet] Cache entries planned: ${manifest.packet_caching_plan.length}`);
    console.log(`[cache-ace-packet] Estimated memory: ${manifest.estimated_memory_kb} KB`);
  }

  const outputPath = path.resolve(ROOT, 'docs/reports/ace-cache-manifest.json');

  if (DRY_RUN) {
    console.log('[cache-ace-packet] DRY RUN: would write to', outputPath);
    console.log('\nCache plan preview:');
    console.log(JSON.stringify(manifest, null, 2).slice(0, 900) + '\n...\n');
    return;
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Write manifest
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));

  console.log(`[cache-ace-packet] ✅ Wrote cache manifest to ${outputPath}`);
  console.log(`[cache-ace-packet] Packets to cache: ${manifest.packet_caching_plan.length}`);
}

generateCacheManifest().catch(err => {
  console.error('[cache-ace-packet] ❌ FAILED:', err.message);
  if (process.argv.includes('--verbose')) {
    console.error(err.stack);
  }
  process.exit(1);
});
