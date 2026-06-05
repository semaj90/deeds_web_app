#!/usr/bin/env node
/**
 * scripts/tests/smoke-runtime-packet-replay.mjs
 *
 * Replays and decompresses a route runtime telemetry packet from Redis,
 * reconstructs search seeds, queries Qdrant/Neo4j, and tests self-healing recommendations.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Load environment config
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

// Setup DB & Redis & Neo4j parameters
const DATABASE_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = env.REDIS_URL || 'redis://127.0.0.1:6379';
const REDIS_PASS = env.REDIS_PASSWORD || 'redis';
const NEO4J_URI = env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = env.NEO4J_PASSWORD || 'neo4j123';

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const redis = new Redis(REDIS_URL, { password: REDIS_PASS });

async function run() {
  console.log('🧪 Starting Runtime Telemetry Packet Replay & Self-Healing Smoke Test...');
  console.log(`- Postgres: ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`- Redis   : ${REDIS_URL.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`- Neo4j   : ${NEO4J_URI} (user: ${NEO4J_USER})`);

  // 1. Trigger context assembly to log a telemetry packet
  console.log('\n⏳ Importing assembleACEContext...');
  const assemblerPath = path.resolve(ROOT, 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts');
  const { assembleACEContext } = await import(pathToFileURL(assemblerPath).href);

  const testQuery = 'context-assembler ' + Date.now();
  console.log(`- Triggering assembleACEContext for query: "${testQuery}"`);
  
  await assembleACEContext({
    query: testQuery,
    userId: '1',
    conversationId: 'replay-test-' + Date.now(),
    enableCodebaseContext: true,
  });

  console.log('✓ Context assembly executed. Waiting 2.5 seconds for telemetry write & compression...');
  await new Promise(resolve => setTimeout(resolve, 2500));

  // 2. Fetch the latest packet ID
  const latestRow = await pool.query('SELECT id, route, query_preview, source_refs FROM route_runtime_packets ORDER BY captured_at DESC LIMIT 1');
  const packetRow = latestRow.rows[0];
  if (!packetRow) {
    console.error('❌ FAILURE: No route_runtime_packets row found.');
    process.exit(1);
  }
  const packetId = packetRow.id;
  console.log(`✓ Latest packet ID: ${packetId} (Route: "${packetRow.route}", Preview: "${packetRow.query_preview}")`);

  // 3. Decompress the telemetry packet from Redis
  const compressorPath = path.resolve(ROOT, 'sveltekit-frontend/src/lib/server/features/ai/ace/telemetry-compressor.ts');
  const { decompressTelemetry } = await import(pathToFileURL(compressorPath).href);

  console.log(`\n⏳ Fetching and decompressing Redis key: ace:telemetry:${packetId}:lod0...`);
  const decompressed = await decompressTelemetry(packetId);
  
  if (!decompressed) {
    console.error(`❌ FAILURE: Telemetry key ace:telemetry:${packetId}:lod0 not found or could not be decoded.`);
    process.exit(1);
  }

  console.log('✓ Decompression complete! Restored fields:');
  console.log(`  - sourceRefs : [${decompressed.sourceRefs.join(', ')}] (count: ${decompressed.sourceRefs.length})`);
  console.log(`  - featureIds : [${decompressed.featureIds.join(', ')}] (count: ${decompressed.featureIds.length})`);
  console.log(`  - laneIds    : [${decompressed.laneIds.join(', ')}] (count: ${decompressed.laneIds.length})`);
  console.log(`  - qdrantHits : ${decompressed.qdrantHits}`);
  console.log(`  - somCluster : ${decompressed.somCluster}`);

  // 4. Validate reconstructed source refs
  if (decompressed.sourceRefs.length === 0) {
    console.error('❌ FAILURE: Reconstructed sourceRefs list is empty.');
    process.exit(1);
  }
  console.log('✓ Source references successfully restored.');

  // 5. Verify Qdrant indexing status for the resolved refs
  console.log('\n⏳ Checking Qdrant index status for resolved files in Redis...');
  for (const ref of decompressed.sourceRefs) {
    // Retrieve source ref integer ID
    const refRes = await pool.query('SELECT source_ref_id FROM parent_atlas_documents WHERE source_ref = $1', [ref]);
    const refId = refRes.rows[0]?.source_ref_id;
    if (!refId) {
      console.warn(`  ⚠ No source_ref_id found for ${ref}`);
      continue;
    }
    const qdrantPoint = await redis.get(`ace:source:${refId}:qdrant`);
    console.log(`  - ${ref} → source_id: ${refId} → Qdrant ID in Redis: ${qdrantPoint ?? 'missing'}`);
  }

  // 6. Traverse Neo4j 2-hop neighborhood using the reconstructed seeds
  console.log('\n⏳ Traversing Neo4j using decompressed seeds...');
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });

  // Map paths to Neo4j format (strip 'sveltekit-frontend/' prefix)
  const seeds = decompressed.sourceRefs.map(r => r.replace(/^sveltekit-frontend\//, ''));
  let neighbors = [];

  try {
    const result = await session.run(
      `MATCH (c:CodebaseFile)-[:IMPORTS*1..2]-(n:CodebaseFile)
       WHERE c.path IN $seeds AND c <> n
       RETURN DISTINCT n.path AS path
       LIMIT 10`,
      { seeds }
    );
    neighbors = result.records.map(rec => rec.get('path'));
    console.log(`  ✓ Restored 2-hop neighborhood traversal successfully!`);
    console.log(`  - Traversal results: [${neighbors.join(', ')}] (count: ${neighbors.length})`);
  } catch (err) {
    console.error('❌ Neo4j traversal query failed:', err.message);
  } finally {
    await session.close();
    await driver.close();
  }

  // 7. Check density of retrieved context and neighborhood to trigger self-healing
  console.log('\n🔍 Running Self-Healing Quality Audits:');
  const RECS_JSON = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
  const selfHealRecs = [];

  // A. Low Context Density Check
  const densityThreshold = 8;
  if (decompressed.sourceRefs.length < densityThreshold) {
    console.log(`  ⚠️ LOW CONTEXT DENSITY: Hit ${decompressed.sourceRefs.length} refs (Expected ${densityThreshold})`);
    selfHealRecs.push({
      id: `self_heal_${Date.now()}_1`,
      type: 'retrieval:low-context-density',
      cluster: 'Self-Healing Retrieval',
      title: `Low context density retrieved for query: "${packetRow.query_preview}"`,
      why: `The runtime query assembled only ${decompressed.sourceRefs.length} codebase references (lower than the required threshold of ${densityThreshold}). ` +
           `This indicates a gap in either our semantic embedding coverage or search terms association.`,
      sourceRefs: decompressed.sourceRefs,
      action: `Analyze the query vocabulary and run semantic index backfills if codebase files are missing.`,
      next_command: 'npm run graphify:semantic',
      priority: 'medium',
      featureStatus: 'degraded',
    });
  } else {
    console.log(`  ✓ Context density OK (${decompressed.sourceRefs.length} refs matching)`);
  }

  // B. Missing Graph Neighborhood Check
  if (neighbors.length === 0) {
    console.log(`  ⚠️ MISSING NEIGHBORHOOD: 0 Neo4j import relationships traversed.`);
    selfHealRecs.push({
      id: `self_heal_${Date.now()}_2`,
      type: 'graph:missing-neighborhood',
      cluster: 'Self-Healing Retrieval',
      title: `Disconnected graph neighborhood for query seeds: [${seeds.slice(0, 3).join(', ')}]`,
      why: `Traversing Neo4j imports relationships starting from decompressed seeds returned 0 neighbors. ` +
           `This indicates key files are orphaned in the Neo4j dependency map, reducing hyperedge retrieval relevance.`,
      sourceRefs: decompressed.sourceRefs,
      action: `Run dependency extraction to merge relationships for orphaned codebase nodes.`,
      next_command: 'npm run graph:refresh',
      priority: 'high',
      featureStatus: 'degraded',
    });
  } else {
    console.log(`  ✓ Graph neighborhood OK (${neighbors.length} neighbors traversed)`);
  }

  // Write Self-Healing recommendations to file
  if (selfHealRecs.length > 0) {
    console.log(`\n⏳ Writing ${selfHealRecs.length} self-healing recommendations to OpenCode...`);
    const selfHealPath = path.resolve(ROOT, 'scripts/atlas/self-heal-recommendations.mjs');
    const { mergeSelfHealRecommendations } = await import(pathToFileURL(selfHealPath).href);
    await mergeSelfHealRecommendations(selfHealRecs);
  }

  await pool.end();
  redis.disconnect();

  console.log('\n🎉 RUNTIME TELEMETRY PACKET REPLAY SMOKE TEST PASSED');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
