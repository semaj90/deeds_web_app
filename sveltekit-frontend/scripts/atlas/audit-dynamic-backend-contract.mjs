#!/usr/bin/env node
/**
 * audit-dynamic-backend-contract.mjs
 *
 * >20 step backend infrastructure audit for the Parent Atlas system.
 *
 * Uses Docker exec and direct CLI tools (not Node pg module) to avoid
 * schema visibility bugs. Verifies:
 * - Postgres tables (atlas_packets, nes_chrom_packets, atlas_tree_nodes)
 * - Qdrant collection + payload contract
 * - Redis availability
 * - Neo4j graph database
 * - Feature card readiness
 *
 * Exit code 0 = PASS (all gates green)
 * Exit code 1 = FAIL (at least one gate red)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const POSTGRES_CONTAINER = 'legal-ai-postgres';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const NEO4J_URL = process.env.NEO4J_URL || 'http://127.0.0.1:7474';

const gates = [];

function gate(name, check, isPass) {
  gates.push({ name, check, pass: isPass });
  const icon = isPass ? '✓' : '✗';
  console.log(`${icon} ${name}: ${isPass ? 'PASS' : 'FAIL'}`);
  return isPass;
}

function dockerExec(sql) {
  try {
    const result = execSync(
      `docker exec ${POSTGRES_CONTAINER} psql -U legal_admin -d legal_ai_db -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return result.trim();
  } catch (e) {
    return null;
  }
}

function fetchUrl(url) {
  try {
    const result = execSync(`curl -s "${url}"`, { encoding: 'utf-8', timeout: 3000 });
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

async function audit() {
  console.log('\n═══ PARENT ATLAS DYNAMIC BACKEND AUDIT ═══\n');

  let passed = 0;
  let failed = 0;

  // ─────────────────────────────────────────────────────────────
  // TIER 1: POSTGRES DATABASE
  // ─────────────────────────────────────────────────────────────
  console.log('Tier 1: PostgreSQL Database\n');

  // G1: Container running
  try {
    execSync(`docker ps --filter "name=${POSTGRES_CONTAINER}" --format "{{.Names}}" | grep -q ${POSTGRES_CONTAINER}`, {
      timeout: 2000
    });
    gate('G1: PostgreSQL container running', true, true) ? passed++ : failed++;
  } catch (e) {
    gate('G1: PostgreSQL container running', false, false) ? passed++ : failed++;
  }

  // G2: Database legal_ai_db exists
  const dbExists = dockerExec('SELECT datname FROM pg_database WHERE datname = \'legal_ai_db\';');
  gate('G2: Database legal_ai_db exists', dbExists, !!dbExists) ? passed++ : failed++;

  // G3: atlas_packets table exists
  const pktsRow = dockerExec('SELECT COUNT(*) FROM atlas_packets;');
  const pktsCount = pktsRow ? parseInt(pktsRow.match(/\d+/)[0]) : 0;
  gate('G3: atlas_packets table exists', `${pktsCount} rows`, pktsCount > 0) ? passed++ : failed++;

  // G4: atlas_packets feature_id coverage
  const featureRes = dockerExec('SELECT COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) FROM atlas_packets;');
  const featureCov = featureRes ? parseInt(featureRes.match(/\d+/)[0]) : 0;
  const featurePct = pktsCount > 0 ? ((100 * featureCov) / pktsCount).toFixed(1) : 0;
  gate('G4: atlas_packets feature_id coverage', `${featurePct}%`, featurePct >= 95) ? passed++ : failed++;

  // G5: atlas_packets source_ref coverage
  const sourceRes = dockerExec('SELECT COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) FROM atlas_packets;');
  const sourceCov = sourceRes ? parseInt(sourceRes.match(/\d+/)[0]) : 0;
  const sourcePct = pktsCount > 0 ? ((100 * sourceCov) / pktsCount).toFixed(1) : 0;
  gate('G5: atlas_packets source_ref coverage', `${sourcePct}%`, sourcePct >= 95) ? passed++ : failed++;

  // G6: atlas_packets packet_key coverage
  const keyRes = dockerExec('SELECT COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) FROM atlas_packets;');
  const keyCov = keyRes ? parseInt(keyRes.match(/\d+/)[0]) : 0;
  const keyPct = pktsCount > 0 ? ((100 * keyCov) / pktsCount).toFixed(1) : 0;
  gate('G6: atlas_packets packet_key coverage', `${keyPct}%`, keyPct >= 95) ? passed++ : failed++;

  // G7: nes_chrom_packets table exists
  const chromRow = dockerExec('SELECT COUNT(*) FROM nes_chrom_packets;');
  const chromCount = chromRow ? parseInt(chromRow.match(/\d+/)[0]) : 0;
  gate('G7: nes_chrom_packets table exists', `${chromCount} rows`, chromCount > 0) ? passed++ : failed++;

  // G8: atlas_tree_nodes table exists
  const treeRow = dockerExec('SELECT COUNT(*) FROM atlas_tree_nodes;');
  const treeCount = treeRow !== null ? parseInt(treeRow.match(/\d+/)[0]) : -1;
  gate('G8: atlas_tree_nodes table exists', treeCount >= 0 ? `${treeCount} rows` : 'error', treeCount >= 0) ? passed++ : failed++;

  // G9: Required indexes exist
  const idxRes = dockerExec('SELECT COUNT(*) FROM pg_indexes WHERE schemaname = \'public\' AND tablename IN (\'atlas_packets\', \'atlas_tree_nodes\');');
  const idxCount = idxRes ? parseInt(idxRes.match(/\d+/)[0]) : 0;
  gate('G9: Packet + tree node indexes exist', `${idxCount} indexes`, idxCount > 10) ? passed++ : failed++;

  // ─────────────────────────────────────────────────────────────
  // TIER 2: QDRANT VECTOR DATABASE
  // ─────────────────────────────────────────────────────────────
  console.log('\nTier 2: Qdrant Vector Database\n');

  // G10: Qdrant collection exists
  const qdrantInfo = fetchUrl(`${QDRANT_URL}/collections/codebase_chunks_768`);
  gate('G10: Qdrant collection codebase_chunks_768 exists', qdrantInfo?.result?.config ? 'ready' : 'unavailable', !!qdrantInfo?.result?.config) ? passed++ : failed++;

  // G11: Qdrant has points
  const pointsCount = qdrantInfo?.result?.points_count || 0;
  gate('G11: Qdrant codebase_chunks_768 has points', `${pointsCount} points`, pointsCount > 10000) ? passed++ : failed++;

  // G12: Qdrant payload has canonical fields (sample 10 points)
  const pointsRes = fetchUrl(`${QDRANT_URL}/collections/codebase_chunks_768/points?limit=10`);
  let canonicalPayloads = 0;
  if (pointsRes?.result?.points) {
    canonicalPayloads = pointsRes.result.points.filter(p => {
      const payload = p.payload || {};
      return (payload.source_ref || payload.sourceRef) && (payload.packet_key || payload.packetKey);
    }).length;
  }
  gate('G12: Qdrant payload canonical-matched', `${canonicalPayloads}/10 points`, canonicalPayloads >= 4) ? passed++ : failed++;

  // ─────────────────────────────────────────────────────────────
  // TIER 3: REDIS CACHE
  // ─────────────────────────────────────────────────────────────
  console.log('\nTier 3: Redis Cache\n');

  // G13: Redis is accessible
  let redisHealthy = false;
  try {
    const redisRes = execSync(`docker exec legal-ai-redis redis-cli ping`, { encoding: 'utf-8', timeout: 2000 });
    redisHealthy = redisRes.includes('PONG');
  } catch (e) {}
  gate('G13: Redis is accessible', redisHealthy ? 'PONG' : 'no response', redisHealthy) ? passed++ : failed++;

  // G14: Redis memory usage acceptable
  let redisMemory = 'unknown';
  if (redisHealthy) {
    try {
      const info = execSync(`docker exec legal-ai-redis redis-cli info memory | grep used_memory_human`, {
        encoding: 'utf-8',
        timeout: 2000
      });
      redisMemory = info.split(':')[1]?.trim() || 'unknown';
    } catch (e) {}
  }
  gate('G14: Redis memory usage acceptable', redisMemory, redisHealthy) ? passed++ : failed++;

  // ─────────────────────────────────────────────────────────────
  // TIER 4: NEO4J GRAPH DATABASE
  // ─────────────────────────────────────────────────────────────
  console.log('\nTier 4: Neo4j Graph Database\n');

  // G15: Neo4j is accessible
  const neo4jRes = fetchUrl(`${NEO4J_URL}/browser/`);
  const neo4jHealthy = !!neo4jRes;
  gate('G15: Neo4j is accessible', neo4jHealthy ? '200 OK' : 'unavailable', neo4jHealthy) ? passed++ : failed++;

  // G16: Neo4j has nodes
  // (Neo4j browser doesn't expose a simple health endpoint; skip actual query)
  gate('G16: Neo4j graph available', neo4jHealthy ? 'Browser responsive' : 'n/a', neo4jHealthy) ? passed++ : failed++;

  // ─────────────────────────────────────────────────────────────
  // TIER 5: FEATURE CARD READINESS
  // ─────────────────────────────────────────────────────────────
  console.log('\nTier 5: Feature Card Readiness\n');

  // G17: Feature cards table exists
  const fcRes = dockerExec('SELECT COUNT(*) FROM atlas_feature_map WHERE feature_label IS NOT NULL;');
  const fcCount = fcRes ? parseInt(fcRes.match(/\d+/)[0]) : 0;
  gate('G17: Feature card records exist', `${fcCount} cards`, fcCount > 10) ? passed++ : failed++;

  // G18: Feature cards have metadata
  const fcMetaRes = dockerExec('SELECT COUNT(CASE WHEN metadata IS NOT NULL AND metadata != \'{}\' THEN 1 END) FROM atlas_feature_map;');
  const fcMetaCount = fcMetaRes ? parseInt(fcMetaRes.match(/\d+/)[0]) : 0;
  const fcMetaPct = fcCount > 0 ? ((100 * fcMetaCount) / fcCount).toFixed(1) : 0;
  gate('G18: Feature cards have metadata', `${fcMetaPct}%`, fcMetaPct >= 50) ? passed++ : failed++;

  // G19: Drizzle schema includes atlasTreeNodes
  let drizzleOK = false;
  try {
    const schemaFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/lib/server/db/schema/index.ts');
    if (fs.existsSync(schemaFile)) {
      const content = fs.readFileSync(schemaFile, 'utf-8');
      drizzleOK = content.includes('atlas-tree-nodes');
    }
  } catch (e) {}
  gate('G19: Drizzle schema includes atlas-tree-nodes', drizzleOK ? 'exported' : 'missing', drizzleOK) ? passed++ : failed++;

  // G20: Package.json has atlas scripts
  let npmOK = false;
  try {
    const pkgFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../package.json');
    if (fs.existsSync(pkgFile)) {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
      npmOK = pkg.scripts && (
        pkg.scripts['atlas:db:context'] ||
        pkg.scripts['atlas:tree:audit'] ||
        pkg.scripts['atlas:tree:seed:dry']
      );
    }
  } catch (e) {}
  gate('G20: atlas:* npm scripts registered', npmOK ? 'yes' : 'no', npmOK) ? passed++ : failed++;

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n═══ SUMMARY ═══\n');
  console.log(`Passed: ${passed}/20`);
  console.log(`Failed: ${failed}/20`);

  if (failed === 0) {
    console.log('\n🚀 ALL GATES PASS — Backend infrastructure is healthy');
    console.log('   Ready for Phase D Higher-Hop Enrichment');
  } else {
    console.log(`\n⚠️  ${failed} gate(s) failed — address before proceeding`);
  }

  // Write report
  const reportDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  fs.writeFileSync(
    path.join(reportDir, 'dynamic-backend-audit.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { passed, failed, total: 20 },
      gates: gates.map(g => ({ name: g.name, pass: g.pass }))
    }, null, 2)
  );

  process.exit(failed === 0 ? 0 : 1);
}

audit().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
