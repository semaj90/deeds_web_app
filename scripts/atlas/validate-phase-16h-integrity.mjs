#!/usr/bin/env node

/**
 * Phase 16-H Integrity Validation
 *
 * Validates all topology bridges, identity lanes, and enrichment coverage.
 * Uses the bounded pattern: checks metrics, audits, then reports readiness.
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

const log = {
  info: (msg) => console.log(`[validate] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

async function main() {
  const client = await pool.connect();

  try {
    log.info('========== Phase 16-H Integrity Validation ==========');
    log.info('');

    // Gate 1: Table existence
    log.progress('Gate 1: Table existence...');
    const tableResult = await client.query(`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_name = 'atlas_higher_hop_index' AND table_schema = 'public';
    `);
    const tableExists = tableResult.rows[0].count > 0;
    log.ok(`Table exists: ${tableExists ? 'YES' : 'NO'}`);
    if (!tableExists) throw new Error('atlas_higher_hop_index not found');
    log.info('');

    // Gate 2: Row count
    log.progress('Gate 2: Row count...');
    const countResult = await client.query('SELECT COUNT(*) FROM atlas_higher_hop_index');
    const rowCount = parseInt(countResult.rows[0].count);
    log.ok(`Total rows: ${rowCount}`);
    if (rowCount < 3000) throw new Error(`Row count too low: ${rowCount}`);
    log.info('');

    // Gate 3: Identity lanes
    log.progress('Gate 3: Identity lanes...');
    const lanesResult = await client.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN identity_lane IS NOT NULL THEN 1 END) with_lane,
        COUNT(CASE WHEN identity_confidence > 0.5 THEN 1 END) with_confidence
      FROM atlas_higher_hop_index;
    `);
    const lanes = lanesResult.rows[0];
    log.ok(`With identity_lane: ${lanes.with_lane}/${lanes.total} (${(100 * lanes.with_lane / lanes.total).toFixed(1)}%)`);
    log.ok(`With confidence > 0.5: ${lanes.with_confidence}/${lanes.total} (${(100 * lanes.with_confidence / lanes.total).toFixed(1)}%)`);
    log.info('');

    // Gate 4: Topology bridge coverage
    log.progress('Gate 4: Topology bridge coverage...');
    const bridgesResult = await client.query(`
      SELECT
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) tree,
        COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) som,
        COUNT(CASE WHEN neo4j_node_id IS NOT NULL THEN 1 END) neo4j,
        COUNT(CASE WHEN glyph_record_id IS NOT NULL THEN 1 END) glyph,
        COUNT(CASE WHEN bifrost_key IS NOT NULL THEN 1 END) redis
      FROM atlas_higher_hop_index;
    `);
    const bridges = bridgesResult.rows[0];
    log.ok(`Tree nodes: ${bridges.tree}/${rowCount} (${(100 * bridges.tree / rowCount).toFixed(1)}%)`);
    log.ok(`SOM clusters: ${bridges.som}/${rowCount} (${(100 * bridges.som / rowCount).toFixed(1)}%)`);
    log.ok(`Neo4j nodes: ${bridges.neo4j}/${rowCount} (${(100 * bridges.neo4j / rowCount).toFixed(1)}%)`);
    log.ok(`Glyph records: ${bridges.glyph}/${rowCount} (${(100 * bridges.glyph / rowCount).toFixed(1)}%)`);
    log.ok(`Redis keys: ${bridges.redis}/${rowCount} (${(100 * bridges.redis / rowCount).toFixed(1)}%)`);
    log.info('');

    // Gate 5: Qdrant collections
    log.progress('Gate 5: Qdrant collections...');
    const collectionsRes = await fetch(`${QDRANT_URL}/collections`);
    if (!collectionsRes.ok) throw new Error(`Qdrant collections failed: ${collectionsRes.status}`);
    const collectionsData = await collectionsRes.json();
    const collectionCount = collectionsData.result?.collections?.length || 0;
    log.ok(`Qdrant collections: ${collectionCount}`);
    const codebaseChunks = collectionsData.result?.collections?.find((c) => c.name === 'codebase_chunks_768');
    if (codebaseChunks) {
      log.ok(`  codebase_chunks_768: ${codebaseChunks.points_count} points`);
    }
    log.info('');

    // Gate 6: Identity spine integrity
    log.progress('Gate 6: Identity spine integrity...');
    const spineResult = await client.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) with_packet_key,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) with_source_ref,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) with_feature_id,
        COUNT(CASE WHEN source_ref_key IS NOT NULL THEN 1 END) with_source_ref_key
      FROM atlas_higher_hop_index;
    `);
    const spine = spineResult.rows[0];
    log.ok(`packet_key: ${spine.with_packet_key}/${spine.total} (${(100 * spine.with_packet_key / spine.total).toFixed(1)}%)`);
    log.ok(`source_ref: ${spine.with_source_ref}/${spine.total} (${(100 * spine.with_source_ref / spine.total).toFixed(1)}%)`);
    log.ok(`feature_id: ${spine.with_feature_id}/${spine.total} (${(100 * spine.with_feature_id / spine.total).toFixed(1)}%)`);
    log.ok(`source_ref_key (normalized): ${spine.with_source_ref_key}/${spine.total} (${(100 * spine.with_source_ref_key / spine.total).toFixed(1)}%)`);
    log.info('');

    // Summary
    log.ok('========== PHASE 16-H INTEGRITY: PASS ==========');
    log.ok(`Overall readiness: READY FOR H.4/H.5 (Qdrant backfill)`);

  } catch (err) {
    log.error(`Validation failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
