#!/usr/bin/env node
/**
 * scripts/atlas/export-neo4j-gds-scores.mjs
 *
 * Runs Neo4j GDS centrality and community detection, and exports scores to the Postgres lookup table:
 *   atlas_topology_scores
 *
 * Usage:
 *   node scripts/atlas/export-neo4j-gds-scores.mjs [--dry-run] [--apply]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { loadRepoEnv } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const runtimeEnv = loadRepoEnv(process.env);
const DATABASE_URL = runtimeEnv.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = runtimeEnv.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = runtimeEnv.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = runtimeEnv.NEO4J_PASSWORD || runtimeEnv.NEO4J_PASS || 'neo4j123';

function toFloat(val) {
  if (val === null || val === undefined) return 0.0;
  if (typeof val === 'object' && typeof val.toNumber === 'function') return val.toNumber();
  return Number(val);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Export Neo4j GDS Scores                                       ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (default)'}                                            ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('🔌 Connecting to services...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const neo4jSession = neo4jDriver.session();

  const scores = new Map(); // id -> { pagerank, community_id, degree }
  let neo4jReachable = false;
  let exportedCount = 0;
  let errorCount = 0;

  try {
    console.log('🔍 Checking GDS projection...');
    await neo4jSession.run("CALL gds.graph.drop('topoGraph', false)").catch(() => {});
    
    await neo4jSession.run(`
      CALL gds.graph.project(
        'topoGraph',
        'Packet',
        { SIMILAR_TO: { orientation: 'UNDIRECTED' } }
      )
    `);
    
    neo4jReachable = true;
    console.log('✅ Projected GDS graph: topoGraph');

    // 1. PageRank
    console.log('📈 Streaming PageRank scores...');
    const prRes = await neo4jSession.run(`
      CALL gds.pageRank.stream('topoGraph')
      YIELD nodeId, score
      WITH gds.util.asNode(nodeId) AS node, score
      RETURN COALESCE(node.packet_key, node.id, node.source_ref, node.filePath, node.name, node.featureId, node.featureKey) AS id,
             score AS pagerank
    `);
    prRes.records.forEach(r => {
      const id = r.get('id');
      const pr = toFloat(r.get('pagerank'));
      if (id) {
        if (!scores.has(id)) scores.set(id, { pagerank: 0.0, community_id: null, degree: 0 });
        scores.get(id).pagerank = pr;
      }
    });

    // 2. Louvain
    console.log('👥 Streaming Louvain community partitions...');
    const lvRes = await neo4jSession.run(`
      CALL gds.louvain.stream('topoGraph')
      YIELD nodeId, communityId
      WITH gds.util.asNode(nodeId) AS node, communityId
      RETURN COALESCE(node.packet_key, node.id, node.source_ref, node.filePath, node.name, node.featureId, node.featureKey) AS id,
             communityId AS community_id
    `);
    lvRes.records.forEach(r => {
      const id = r.get('id');
      const comm = r.get('community_id') !== null ? toFloat(r.get('community_id')) : null;
      if (id) {
        if (!scores.has(id)) scores.set(id, { pagerank: 0.0, community_id: null, degree: 0 });
        scores.get(id).community_id = comm;
      }
    });

    // 3. Degree
    console.log('🔗 Streaming Degree Centrality...');
    const degRes = await neo4jSession.run(`
      CALL gds.degree.stream('topoGraph')
      YIELD nodeId, score
      WITH gds.util.asNode(nodeId) AS node, score
      RETURN COALESCE(node.packet_key, node.id, node.source_ref, node.filePath, node.name, node.featureId, node.featureKey) AS id,
             score AS degree
    `);
    degRes.records.forEach(r => {
      const id = r.get('id');
      const deg = toFloat(r.get('degree'));
      if (id) {
        if (!scores.has(id)) scores.set(id, { pagerank: 0.0, community_id: null, degree: 0 });
        scores.get(id).degree = Math.round(deg);
      }
    });

    console.log(`✅ Computed GDS scores for ${scores.size} keys.`);

    if (DRY_RUN) {
      console.log('\nSample scores (first 3):');
      let count = 0;
      for (const [id, s] of scores.entries()) {
        if (count++ >= 3) break;
        console.log(`  ${id} -> PageRank: ${s.pagerank.toFixed(4)}, Community: ${s.community_id}, Degree: ${s.degree}`);
      }
      console.log('\n(dry-run — no database writes; run with --apply to commit)');
    } else {
      console.log(`\n💾 Exporting GDS scores into Postgres...`);
      const pgClient = await pool.connect();
      try {
        await pgClient.query('BEGIN');
        
        for (const [id, s] of scores.entries()) {
          try {
            await pgClient.query(`
              INSERT INTO atlas_topology_scores (packet_key, pagerank, degree, community_id)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (packet_key)
              DO UPDATE SET
                pagerank = EXCLUDED.pagerank,
                degree = EXCLUDED.degree,
                community_id = EXCLUDED.community_id,
                updated_at = CURRENT_TIMESTAMP
            `, [id, s.pagerank, s.degree, s.community_id]);
            exportedCount++;
          } catch (err) {
            errorCount++;
          }
        }
        
        await pgClient.query('COMMIT');
        console.log(`✅ Exported ${exportedCount} scores (errors: ${errorCount}).`);
      } catch (err) {
        await pgClient.query('ROLLBACK');
        console.error('❌ Transaction rolled back due to error:', err.message);
      } finally {
        pgClient.release();
      }
    }

  } catch (err) {
    console.error('❌ Execution failed:', err.message);
  } finally {
    await neo4jSession.close();
    await neo4jDriver.close();
    await pool.end();
  }

  // Generate report
  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    gds_reachable: neo4jReachable,
    total_computed: scores.size,
    scores_exported: exportedCount,
    errors: errorCount,
  };
  writeFileSync(path.join(reportDir, 'export-neo4j-gds-scores.json'), JSON.stringify(report, null, 2));
  console.log(`📊 Report written to: docs/reports/export-neo4j-gds-scores.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
