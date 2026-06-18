#!/usr/bin/env node
/**
 * scripts/atlas/export-neo4j-topology-evidence.mjs
 *
 * Fetches raw relationships (edges) from Neo4j and exports them to the Postgres lookup table:
 *   atlas_topology_evidence
 *
 * Usage:
 *   node scripts/atlas/export-neo4j-topology-evidence.mjs [--dry-run] [--apply] [--limit=N]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { loadRepoEnv, resolveRedisUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

const runtimeEnv = loadRepoEnv(process.env);
const DATABASE_URL = runtimeEnv.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = runtimeEnv.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = runtimeEnv.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = runtimeEnv.NEO4J_PASSWORD || runtimeEnv.NEO4J_PASS || 'neo4j123';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Export Neo4j Topology Evidence                                ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (default)'}                                            ║`);
  console.log('╚════════════════════════════════════════════════════════════════╗\n');

  console.log('🔌 Connecting to services...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const neo4jSession = neo4jDriver.session();

  let exportedCount = 0;
  let errorCount = 0;
  const edges = [];

  try {
    console.log('🔍 Fetching relationships from Neo4j...');
    const result = await neo4jSession.run(`
      MATCH (s)-[r]->(t)
      RETURN COALESCE(s.packet_key, s.id, s.source_ref, s.filePath, s.name, s.featureId, s.featureKey) AS source,
             COALESCE(t.packet_key, t.id, t.source_ref, t.filePath, t.name, t.featureId, t.featureKey) AS target,
             type(r) AS rel_type,
             r.weight AS weight,
             properties(r) AS properties
      LIMIT $limit
    `, { limit: neo4j.int(LIMIT === Infinity ? 100000 : LIMIT) });

    console.log(`✅ Loaded ${result.records.length} relationships from Neo4j.`);

    for (const record of result.records) {
      const source = record.get('source');
      const target = record.get('target');
      const relType = record.get('rel_type');
      const weight = record.get('weight') !== null ? Number(record.get('weight')) : 1.0;
      const props = record.get('properties') || {};

      if (!source || !target || !relType) continue;

      edges.push({ source, target, relType, weight, props });
    }

    if (DRY_RUN) {
      console.log('\nSample relationships (first 3):');
      edges.slice(0, 3).forEach((e, idx) => {
        console.log(`  [${idx}] ${e.source} -[${e.relType}]-> ${e.target} (weight: ${e.weight})`);
      });
      console.log('\n(dry-run — no database writes; run with --apply to commit)');
    } else {
      console.log(`\n💾 Inserting relationships into Postgres...`);
      const pgClient = await pool.connect();
      try {
        await pgClient.query('BEGIN');
        
        for (const edge of edges) {
          try {
            await pgClient.query(`
              INSERT INTO atlas_topology_evidence (source_key, target_key, rel_type, weight, properties)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (source_key, target_key, rel_type)
              DO UPDATE SET
                weight = EXCLUDED.weight,
                properties = EXCLUDED.properties
            `, [edge.source, edge.target, edge.relType, edge.weight, JSON.stringify(edge.props)]);
            exportedCount++;
          } catch (err) {
            errorCount++;
          }
        }
        
        await pgClient.query('COMMIT');
        console.log(`✅ Exported ${exportedCount} relationships (errors: ${errorCount}).`);
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
    relationships_found: edges.length,
    relationships_exported: exportedCount,
    errors: errorCount,
  };
  writeFileSync(path.join(reportDir, 'export-neo4j-topology-evidence.json'), JSON.stringify(report, null, 2));
  console.log(`📊 Report written to: docs/reports/export-neo4j-topology-evidence.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
