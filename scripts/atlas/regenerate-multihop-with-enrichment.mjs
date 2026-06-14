#!/usr/bin/env node
/**
 * Regenerate Multihop Codebase Map with Phase D+E Enrichment
 * Schema-adaptive: introspects atlas_packets at runtime
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const GRAPH_DIR = resolve(ROOT, 'docs/graph');
const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function getColumnsList() {
  const res = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'atlas_packets'
  `);
  return new Set(res.rows.map(r => r.column_name));
}

async function regenerateMultihop() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log('║  Regenerate Multihop Codebase Map + Phase D+E Enrichment      ║');
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const dryRun = process.argv.includes('--dry-run');
  logger.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  try {
    logger.log('Step 1: Introspecting atlas_packets schema...');
    const columns = await getColumnsList();
    logger.ok(`Found ${columns.size} columns\n`);

    const selectColumns = (...names) => names.filter(n => columns.has(n)).join(', ');

    logger.log('Step 2: Loading packets from Postgres...');
    const selectClause = [
      selectColumns('packet_key', 'source_ref', 'feature_id', 'feature_label', 'file_path'),
      selectColumns('community_id', 'community_confidence'),
      selectColumns('qdrant_point_id', 'qdrant_tags'),
      selectColumns('som_row', 'som_col', 'som_cluster'),
      selectColumns('karpathy_score', 'authority_score'),
      selectColumns('encoded_latent'),
      selectColumns('metadata', 'payload'),
      selectColumns('tree_node_id'),
      selectColumns('summary', 'created_at', 'updated_at')
    ].filter(s => s).join(', ');

    const packetsRes = await pool.query(`SELECT ${selectClause} FROM atlas_packets LIMIT 5000`);
    const packets = packetsRes.rows;
    logger.ok(`Loaded ${packets.length} packets\n`);

    logger.log('Step 3: Transforming into multihop nodes...');
    const nodes = [];
    let withMissingFields = 0;

    for (const row of packets) {
      const stableKey = row.packet_key || Math.random().toString(36).slice(2, 18);
      let metadata = {};
      if (columns.has('metadata') && row.metadata) {
        try { metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata; } catch (e) {}
      }
      let payload = {};
      if (columns.has('payload') && row.payload) {
        try { payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload; } catch (e) {}
      }

      const ginMetadata = metadata || payload || {};

      const node = {
        nodeId: `packet:${stableKey}`,
        stableKey,
        kind: 'packet',
        packetKey: row.packet_key || null,
        sourceRef: row.source_ref || null,
        featureId: row.feature_id || null,
        featureLabel: row.feature_label || null,
        filePath: row.file_path || null,
        communityId: columns.has('community_id') ? row.community_id : null,
        communityConfidence: columns.has('community_confidence') ? row.community_confidence : null,
        qdrantPointId: columns.has('qdrant_point_id') ? row.qdrant_point_id : null,
        qdrantTags: columns.has('qdrant_tags') ? row.qdrant_tags : null,
        somRow: columns.has('som_row') ? row.som_row : null,
        somCol: columns.has('som_col') ? row.som_col : null,
        somCluster: columns.has('som_cluster') ? row.som_cluster : null,
        karpathyScore: columns.has('karpathy_score') ? row.karpathy_score : null,
        authorityScore: columns.has('authority_score') ? row.authority_score : null,
        encodedLatent: columns.has('encoded_latent') ? row.encoded_latent : null,
        ginMetadata,
        treeNodeId: columns.has('tree_node_id') ? row.tree_node_id : null,
        summary: row.summary || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      };

      const missing = ['packetKey', 'sourceRef', 'featureId', 'communityId', 'qdrantPointId', 'somCluster', 'karpathyScore'].filter(f => node[f] === null);
      if (missing.length > 0) withMissingFields++;

      nodes.push(node);
    }

    logger.ok(`Transformed ${nodes.length} nodes (${withMissingFields} with missing fields)\n`);

    logger.log('Step 4: Writing outputs...');
    if (!dryRun) {
      mkdirSync(GRAPH_DIR, { recursive: true });
      mkdirSync(REPORTS_DIR, { recursive: true });

      const multihopMap = {
        version: 'enriched-2026-06-14',
        generated: new Date().toISOString(),
        source: { canonical: 'postgres:atlas_packets', enrichment: ['qdrant', 'redis', 'neo4j'] },
        nodes,
        stats: {
          totalNodes: nodes.length,
          enrichmentCoverage: {
            packetKey: nodes.filter(n => n.packetKey).length,
            featureId: nodes.filter(n => n.featureId).length,
            communityId: nodes.filter(n => n.communityId).length,
            qdrantPointId: nodes.filter(n => n.qdrantPointId).length,
            somCluster: nodes.filter(n => n.somCluster).length,
            karpathyScore: nodes.filter(n => n.karpathyScore).length,
          }
        }
      };

      writeFileSync(resolve(GRAPH_DIR, 'codebase-map.enriched.json'), JSON.stringify(multihopMap, null, 2));
      logger.ok(`Wrote: codebase-map.enriched.json`);

      const report = { timestamp: new Date().toISOString(), totalNodes: nodes.length, withMissing: withMissingFields };
      writeFileSync(resolve(REPORTS_DIR, 'codebase-map.enriched.report.json'), JSON.stringify(report, null, 2));
      logger.ok(`Wrote: codebase-map.enriched.report.json\n`);
    }

    logger.log('✅ Multihop regeneration complete\n');

  } catch (err) {
    logger.error(`Failed: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

regenerateMultihop();
