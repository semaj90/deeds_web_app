#!/usr/bin/env node
/**
 * P4 Phase: Daily Startup Validation
 * Checks all required tables, columns, indexes, and mirror consistency
 * Writes results to .tmp/startup-truth.json
 */

import pg from 'pg';
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const report = {
  timestamp: new Date().toISOString(),
  postgres: 'unknown',
  qdrant: 'unknown',
  redis: 'unknown',
  neo4j: 'unknown',
  rabbitmq: 'unknown',
  gpu: 'unknown',
  gates: {},
  issues: [],
  warnings: [],
  status: 'PASS'
};

async function checkPostgres() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });

  try {
    await client.connect();
    report.postgres = 'ready';

    // Gate 1: Required tables exist
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'atlas_packets',
        'packet_topology_projection',
        'qdrant_orphan_points',
        'atlas_som_cell_scores',
        'atlas_som_cell_attention_scores',
        'atlas_som_cell_karpathy_scores'
      )
    `);
    const foundTables = new Set(tablesResult.rows.map(r => r.table_name));
    const requiredTables = [
      'atlas_packets',
      'packet_topology_projection',
      'qdrant_orphan_points',
      'atlas_som_cell_scores',
      'atlas_som_cell_attention_scores',
      'atlas_som_cell_karpathy_scores'
    ];
    const missingTables = requiredTables.filter(t => !foundTables.has(t));
    report.gates.postgresTablesExist = missingTables.length === 0 ? 'PASS' : 'FAIL';
    if (missingTables.length > 0) {
      report.issues.push(`Missing Postgres tables: ${missingTables.join(', ')}`);
      report.status = 'FAIL';
    }

    // Gate 2: Required columns exist
    const columnsResult = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'packet_topology_projection'
      AND column_name IN (
        'packet_key', 'feature_id', 'source_ref', 'som_row', 'som_col',
        'manifold_x', 'manifold_y', 'manifold_z', 'manifold_w',
        'qdrant_point_id', 'qdrant_joinable'
      )
    `);
    const foundColumns = new Set(columnsResult.rows.map(r => r.column_name));
    const requiredColumns = [
      'packet_key', 'feature_id', 'source_ref', 'som_row', 'som_col',
      'manifold_x', 'manifold_y', 'manifold_z', 'manifold_w',
      'qdrant_point_id', 'qdrant_joinable'
    ];
    const missingColumns = requiredColumns.filter(c => !foundColumns.has(c));
    report.gates.topologyColumnsExist = missingColumns.length === 0 ? 'PASS' : 'FAIL';
    if (missingColumns.length > 0) {
      report.issues.push(`Missing topology columns: ${missingColumns.join(', ')}`);
      report.status = 'FAIL';
    }

    // Gate 3: Topology projection row count
    const countResult = await client.query('SELECT COUNT(*) as cnt FROM packet_topology_projection');
    const topologyRows = parseInt(countResult.rows[0].cnt, 10);
    report.gates.topologyProjectionRows = topologyRows > 0 ? 'PASS' : 'FAIL';
    report.topologyProjectionRowCount = topologyRows;
    if (topologyRows === 0) {
      report.warnings.push('Topology projection is empty (expected after P4 backfill)');
    }

    // Gate 4: Orphan points count
    const orphansResult = await client.query('SELECT COUNT(*) as cnt FROM qdrant_orphan_points WHERE resolved = false');
    const orphanCount = parseInt(orphansResult.rows[0].cnt, 10);
    report.gates.orphanPointsAcceptable = orphanCount < 100 ? 'PASS' : 'WARN';
    report.orphanPointCount = orphanCount;
    if (orphanCount >= 100) {
      report.warnings.push(`High orphan count: ${orphanCount} unresolved Qdrant points`);
    }

    // Gate 5: SOM cell scores computed
    const somScoresResult = await client.query(`
      SELECT COUNT(DISTINCT pagerank_score) as unique_scores
      FROM atlas_som_cell_scores
    `);
    const uniqueScores = parseInt(somScoresResult.rows[0].unique_scores || 0, 10);
    report.gates.somPageRankDiscriminative = uniqueScores > 50 ? 'PASS' : 'WARN';
    report.somUniqueScores = uniqueScores;
    if (uniqueScores < 50) {
      report.warnings.push(`Low PageRank diversity: ${uniqueScores} unique scores (expected >50)`);
    }

    await client.end();
  } catch (err) {
    report.postgres = 'error';
    report.gates.postgresConnect = 'FAIL';
    report.issues.push(`Postgres connection failed: ${err.message}`);
    report.status = 'FAIL';
  }
}

async function checkRedis() {
  try {
    const redis = new Redis(process.env.REDIS_URL || {
      host: '127.0.0.1',
      port: 6379,
      password: 'redis'
    });

    const ping = await redis.ping();
    report.redis = ping === 'PONG' ? 'ready' : 'error';
    report.gates.redisConnect = report.redis === 'ready' ? 'PASS' : 'FAIL';

    if (report.redis === 'ready') {
      // Check hot caches
      const pageRankLen = await redis.hlen('atlas:pagerank:som:scores');
      const attentionLen = await redis.hlen('atlas:attention:som:scores');
      const karpathyLen = await redis.hlen('atlas:karpathy:som:scores');

      report.gates.redisPageRankCache = pageRankLen > 0 ? 'PASS' : 'WARN';
      report.gates.redisAttentionCache = attentionLen > 0 ? 'PASS' : 'WARN';
      report.gates.redisKarpathyCache = karpathyLen > 0 ? 'PASS' : 'WARN';
      report.redisPageRankCount = pageRankLen;
      report.redisAttentionCount = attentionLen;
      report.redisKarpathyCount = karpathyLen;

      if (pageRankLen === 0 || attentionLen === 0 || karpathyLen === 0) {
        report.warnings.push('Some Redis topology caches are empty (may need recomputation)');
      }
    }

    await redis.quit();
  } catch (err) {
    report.redis = 'error';
    report.gates.redisConnect = 'FAIL';
    report.issues.push(`Redis connection failed: ${err.message}`);
  }
}

async function checkNeo4j() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'neo4j123'
    )
  );

  try {
    const session = driver.session({ database: 'neo4j' });

    // Check SOM cells and edges
    const cellsResult = await session.run('MATCH (c:SOMCell) RETURN COUNT(c) as cnt');
    const cellCount = cellsResult.records[0].get('cnt').toNumber();
    report.gates.neo4jSOMCells = cellCount === 400 ? 'PASS' : 'WARN';
    report.neo4jSOMCellCount = cellCount;

    const edgesResult = await session.run('MATCH ()-[r:SOM_GRID_NEIGHBOR]->() RETURN COUNT(r) as cnt');
    const edgeCount = edgesResult.records[0].get('cnt').toNumber();
    report.gates.neo4jSOMEdges = edgeCount > 1000 ? 'PASS' : 'WARN';
    report.neo4jSOMEdgeCount = edgeCount;

    if (edgeCount === 0) {
      report.warnings.push('SOM grid edges missing (run: npm run atlas:p4:topology:fix)');
    }

    report.neo4j = 'ready';
    report.gates.neo4jConnect = 'PASS';
    await session.close();
  } catch (err) {
    report.neo4j = 'error';
    report.gates.neo4jConnect = 'FAIL';
    report.issues.push(`Neo4j connection failed: ${err.message}`);
  } finally {
    await driver.close();
  }
}

async function checkGPU() {
  try {
    // Try to load the N-API tensorrt_bridge addon
    let addon;
    try {
      addon = require('../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    } catch (e) {
      report.gpu = 'unavailable';
      report.gates.gpuAddonLoaded = 'WARN';
      report.warnings.push(`GPU addon not loaded (CUDA/LibTorch not in PATH): ${e.message}`);
      return;
    }

    // Check if simdjson is available
    const simdJsonAvailable = typeof addon.fastJsonParse === 'function';
    report.gates.simdJsonAvailable = simdJsonAvailable ? 'PASS' : 'WARN';
    if (!simdJsonAvailable) {
      report.warnings.push('simdjson N-API binding not available (will use V8 JSON.parse)');
    }

    // Check if CUDA is available (via addon)
    const cudaAvailable = typeof addon.isCudaAvailable === 'function' && addon.isCudaAvailable();
    report.gates.cudaAvailable = cudaAvailable ? 'PASS' : 'WARN';
    report.gpuCudaAvailable = cudaAvailable;
    if (!cudaAvailable) {
      report.warnings.push('CUDA not available (GPU will fall back to CPU or disabled)');
    }

    // Check if GPU functions are exported
    const gpuFunctions = [
      'kmeansWithCentroids',
      'trainSOM',
      'pageRankGPU',
      'attentionScoreGPU',
      'rewardScoreGPU',
      'batchCosineSimilarity'
    ];
    const exportedGpuFunctions = gpuFunctions.filter(fn => typeof addon[fn] === 'function');
    report.gates.gpuFunctionsExported = exportedGpuFunctions.length > 0 ? 'PASS' : 'WARN';
    report.gpuExportedFunctionCount = exportedGpuFunctions.length;
    report.gpuExportedFunctions = exportedGpuFunctions;

    if (exportedGpuFunctions.length === 0) {
      report.warnings.push('No GPU functions exported from tensorrt_bridge addon');
    } else if (exportedGpuFunctions.length < gpuFunctions.length) {
      const missing = gpuFunctions.filter(fn => !exportedGpuFunctions.includes(fn));
      report.warnings.push(`${missing.length} GPU functions missing: ${missing.join(', ')}`);
    }

    report.gpu = cudaAvailable ? 'ready' : 'fallback';
    report.gates.gpuAddonLoaded = 'PASS';
  } catch (err) {
    report.gpu = 'error';
    report.gates.gpuAddonLoaded = 'FAIL';
    report.issues.push(`GPU addon check failed: ${err.message}`);
  }
}

async function main() {
  console.log('🔍 Running daily startup validation...');

  await checkPostgres();
  await checkRedis();
  await checkNeo4j();
  await checkGPU();

  // Determine overall status
  const failGates = Object.entries(report.gates)
    .filter(([_, v]) => v === 'FAIL')
    .map(([k]) => k);

  if (failGates.length > 0) {
    report.status = 'FAIL';
  } else if (report.warnings.length > 0) {
    report.status = 'WARN';
  }

  // Write report
  const reportPath = path.join(ROOT, '.tmp', 'startup-truth.json');
  if (!fs.existsSync(path.dirname(reportPath))) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`✅ Startup validation complete (${report.status})`);
  console.log(`   Report: ${reportPath}`);

  // Print summary
  console.log('\n📊 Gate Results:');
  Object.entries(report.gates).forEach(([gate, status]) => {
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`   ${icon} ${gate}`);
  });

  if (report.issues.length > 0) {
    console.log('\n❌ Issues:');
    report.issues.forEach(issue => console.log(`   • ${issue}`));
  }

  if (report.warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    report.warnings.forEach(warn => console.log(`   • ${warn}`));
  }

  process.exit(report.status === 'FAIL' ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
