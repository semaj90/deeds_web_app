#!/usr/bin/env node
/**
 * scripts/atlas/smoke-multihop-contextual-tree.mjs
 *
 * Smoke test for multi-hop contextual tree retrieval lane.
 *
 * Usage:
 *   cd sveltekit-frontend
 *   npx tsx ../scripts/atlas/smoke-multihop-contextual-tree.mjs [--dry-run|--no-cache]
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(ROOT, '.tmp', 'multihop-contextual-tree-report.json');

// Bootstrapping dotenv
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });

// Dynamically import retrieveMultihopContext from the SvelteKit backend
const backendPath = path.resolve(ROOT, 'sveltekit-frontend/src/lib/server/ace/multihop-contextual-tree.ts');
const { retrieveMultihopContext } = await import(pathToFileURL(backendPath).href);

async function run() {
  console.log('=== Multi-Hop Contextual Tree Smoke Test ===');
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}`);

  // Test parameters
  const query = process.argv.includes('--no-cache')
    ? 'auth middleware route handlers ' + Date.now()
    : 'auth middleware route handlers';
  console.log(`Executing retrieval for query: "${query}"`);

  const t0 = Date.now();
  let packet;
  try {
    packet = await retrieveMultihopContext({
      query,
      topK: 5,
      maxHops: 2
    });
  } catch (err) {
    console.error('Fatal execution error:', err);
    process.exit(1);
  }
  const latency = Date.now() - t0;

  console.log(`\nLatency: ${latency}ms`);
  console.log('Assembled Packet Fields:');
  console.log(`- source_refs:         ${packet.source_refs?.length ?? 0}`);
  console.log(`- feature_ids:         ${packet.feature_ids?.length ?? 0} (${packet.feature_ids?.join(', ')})`);
  console.log(`- lane_ids:            ${packet.lane_ids?.length ?? 0} (${packet.lane_ids?.join(', ')})`);
  console.log(`- cluster_id:          ${packet.cluster_id}`);
  console.log(`- som_cluster:         ${packet.som_cluster}`);
  console.log(`- centroid_id:         ${packet.centroid_id}`);
  console.log(`- qdrant_hits:         ${packet.qdrant_hits?.length ?? 0}`);
  console.log(`- neo4j_neighbors:     ${packet.neo4j_neighbors?.length ?? 0}`);
  console.log(`- topology_path:       ${packet.topology_path?.length ?? 0}`);
  console.log(`- authority_score:     ${packet.authority_score}`);
  console.log(`- redis_hot_keys:      ${packet.redis_hot_keys?.length ?? 0}`);
  console.log(`- runtime_packet_refs: ${packet.runtime_packet_refs?.length ?? 0}`);

  // 1. Qdrant returns sourceRefs validation
  const hasSourceRefs = Array.isArray(packet.source_refs);
  const qdrantReturnsRefs = hasSourceRefs && (packet.source_refs.length > 0 || isDryRun);

  // 2. Parent Atlas expands feature_id validation
  const parentAtlasExpands = Array.isArray(packet.feature_ids) && (packet.feature_ids.length > 0 || isDryRun);

  // 3. Neo4j returns neighbors validation
  const neo4jWorks = Array.isArray(packet.neo4j_neighbors);

  // 4. Redis cache write/read works validation
  const redisWorks = Array.isArray(packet.redis_hot_keys) && packet.redis_hot_keys.includes(`bitfrost:multihop:${crypto.createHash('sha256').update(query).digest('hex')}`);

  // 5. No feature:* rows treated as file paths validation
  const featureRefsExhausted = packet.source_refs.every(ref => !ref.startsWith('feature:'));

  const checks = {
    qdrant_returns_refs: qdrantReturnsRefs,
    parent_atlas_expands: parentAtlasExpands,
    neo4j_neighbors_works: neo4jWorks,
    redis_cache_works: redisWorks,
    no_feature_bucket_as_file_path: featureRefsExhausted,
    packet_fields_complete: [
      'source_refs', 'feature_ids', 'lane_ids', 'cluster_id', 'som_cluster', 'centroid_id',
      'qdrant_hits', 'neo4j_neighbors', 'topology_path', 'authority_score', 'redis_hot_keys',
      'runtime_packet_refs'
    ].every(field => field in packet)
  };

  console.log('\nVerification Checks:');
  for (const [name, passed] of Object.entries(checks)) {
    console.log(`  [${passed ? '✓' : '✗'}] ${name}`);
  }

  const allPassed = Object.values(checks).every(Boolean);
  const report = {
    test_run: {
      query,
      latency_ms: latency,
      timestamp: new Date().toISOString(),
      dry_run: isDryRun
    },
    checks,
    packet_summary: {
      source_refs_count: packet.source_refs?.length ?? 0,
      feature_ids_count: packet.feature_ids?.length ?? 0,
      lane_ids: packet.lane_ids,
      cluster_id: packet.cluster_id,
      som_cluster: packet.som_cluster,
      centroid_id: packet.centroid_id,
      qdrant_hits_count: packet.qdrant_hits?.length ?? 0,
      neo4j_neighbors_count: packet.neo4j_neighbors?.length ?? 0,
      topology_path: packet.topology_path,
      authority_score: packet.authority_score,
      redis_hot_keys: packet.redis_hot_keys,
      runtime_packet_refs_count: packet.runtime_packet_refs?.length ?? 0
    }
  };

  // Ensure .tmp directory exists
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nSaved smoke test report to: ${REPORT_PATH}`);

  if (allPassed) {
    console.log('\n🎉 SMOKE TEST PASSED');
    process.exit(0);
  } else {
    console.error('\n❌ SMOKE TEST FAILED');
    process.exit(1);
  }
}

// Helper to match imports hash
import crypto from 'crypto';

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
