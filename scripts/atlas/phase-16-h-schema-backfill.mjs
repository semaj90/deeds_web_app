#!/usr/bin/env node

/**
 * Phase 16-H.1: Schema Creation + Identity Spine Backfill
 *
 * Creates atlas_higher_hop_index table (the semantic bridge)
 * Backfills identity spine from atlas_packets (packet_key, source_ref, feature_id, etc.)
 * Marks all rows as 'pending' for topology bridges (H.2-H.8 will populate)
 *
 * Time: ~20 min
 * Blocker: None (foundational step)
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[phase-16-h-1] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Step 1: Create atlas_higher_hop_index table
 */
async function createTable(client) {
  log.progress('Creating atlas_higher_hop_index table...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS atlas_higher_hop_index (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Identity spine (copied from atlas_packets for JOIN speed)
      packet_key text NOT NULL UNIQUE,
      source_ref text NOT NULL,
      feature_id text,
      file_path text,

      -- Tree topology (link to atlas_tree_nodes)
      tree_node_id uuid,
      community_id bigint,

      -- SOM topology
      som_cluster int,
      som_x smallint,
      som_y smallint,

      -- Qdrant discovery
      qdrant_collection text,
      qdrant_point_id text,
      qdrant_score double precision,
      qdrant_payload_hash text,

      -- Redis hot key registry
      bifrost_key text,
      bifrost_score double precision,
      gpu_karpathy_key text,
      gpu_karpathy_rank int,
      redis_centroid_key text,

      -- Neo4j node bridge
      neo4j_node_id text,
      neo4j_labels jsonb,
      neo4j_pagerank float,
      neo4j_betweenness float,
      neo4j_eigenvector float,

      -- Glyph/visualization bridge
      glyph_record_id uuid,
      glyph_render_type text,

      -- Repair metadata
      evidence_mode text NOT NULL DEFAULT 'native',
      repair_status text NOT NULL DEFAULT 'pending',
      lineage_version int DEFAULT 1,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),

      CONSTRAINT fk_tree_node FOREIGN KEY (tree_node_id) REFERENCES atlas_tree_nodes(node_id) ON DELETE SET NULL,
      CONSTRAINT fk_glyph FOREIGN KEY (glyph_record_id) REFERENCES atlas_svg_glyphs(id) ON DELETE SET NULL
    );
  `;

  try {
    await client.query(createTableSQL);
    log.ok('Table created');
  } catch (err) {
    if (err.message.includes('already exists')) {
      log.ok('Table already exists');
    } else {
      throw err;
    }
  }
}

/**
 * Step 2: Create indexes
 */
async function createIndexes(client) {
  log.progress('Creating indexes...');

  const indexes = [
    // Identity scalar indexes
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_packet_key ON atlas_higher_hop_index(packet_key)`,
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_source_ref ON atlas_higher_hop_index(source_ref)`,
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_feature_id ON atlas_higher_hop_index(feature_id)`,

    // File path fuzzy search
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_file_path_trgm ON atlas_higher_hop_index USING gin (file_path gin_trgm_ops)`,

    // SOM cluster routing
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_som_cluster ON atlas_higher_hop_index(som_cluster)`,
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_som_grid ON atlas_higher_hop_index(som_x, som_y)`,

    // Qdrant discovery (reverse lookup)
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_qdrant_point ON atlas_higher_hop_index(qdrant_point_id)`,

    // Neo4j scoring
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_pagerank ON atlas_higher_hop_index(neo4j_pagerank DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_bifrost_score ON atlas_higher_hop_index(bifrost_score DESC)`,

    // Repair/metadata
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_metadata_gin ON atlas_higher_hop_index USING gin (metadata jsonb_path_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_repair_status ON atlas_higher_hop_index(repair_status)`,

    // Range/time scans
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_created_brin ON atlas_higher_hop_index USING brin (created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_higher_hop_lineage_brin ON atlas_higher_hop_index USING brin (lineage_version)`,
  ];

  let created = 0;
  for (const indexSql of indexes) {
    try {
      await client.query(indexSql);
      created++;
    } catch (err) {
      if (err.message.includes('already exists')) {
        // Ignore — index already created
      } else {
        log.error(`Index creation failed: ${err.message}`);
      }
    }
  }

  log.ok(`Created/verified ${created} indexes`);
}

/**
 * Step 3: Backfill identity spine from atlas_codebase_packets
 */
async function backfillIdentitySpine(client) {
  log.progress('Backfilling identity spine from atlas_codebase_packets...');

  const backfillSQL = `
    INSERT INTO atlas_higher_hop_index (
      packet_key, source_ref, feature_id, file_path, community_id
    )
    SELECT
      p.packet_key,
      p.source_ref,
      p.feature_id,
      p.file_path,
      p.community_id
    FROM atlas_codebase_packets p
    ON CONFLICT (packet_key) DO NOTHING;
  `;

  const result = await client.query(backfillSQL);
  const inserted = result.rowCount;

  log.ok(`Backfilled ${inserted} identity spine rows`);
  return inserted;
}

/**
 * Step 4: Link tree_node_id from atlas_tree_nodes (where packet_key matches)
 */
async function linkTreeNodes(client) {
  log.progress('Linking tree_node_id...');

  const linkSQL = `
    UPDATE atlas_higher_hop_index h
    SET tree_node_id = t.node_id
    FROM atlas_tree_nodes t
    WHERE h.packet_key = t.packet_key AND h.tree_node_id IS NULL;
  `;

  const result = await client.query(linkSQL);
  const updated = result.rowCount;

  log.ok(`Linked ${updated} tree_node_id references`);
  return updated;
}

/**
 * Step 5: Verify backfill
 */
async function verifyBackfill(client) {
  log.progress('Verifying backfill...');

  const auditSQL = `
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as with_packet_key,
      COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as with_source_ref,
      COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as with_feature_id,
      COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) as with_file_path,
      COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as with_tree_node,
      COUNT(CASE WHEN repair_status = 'pending' THEN 1 END) as pending_status
    FROM atlas_higher_hop_index;
  `;

  const result = await client.query(auditSQL);
  const audit = result.rows[0];

  log.ok(`Audit Results:`);
  log.ok(`  Total rows: ${audit.total}`);
  log.ok(`  packet_key: ${audit.with_packet_key} (${(100 * audit.with_packet_key / audit.total).toFixed(1)}%)`);
  log.ok(`  source_ref: ${audit.with_source_ref} (${(100 * audit.with_source_ref / audit.total).toFixed(1)}%)`);
  log.ok(`  feature_id: ${audit.with_feature_id} (${(100 * audit.with_feature_id / audit.total).toFixed(1)}%)`);
  log.ok(`  file_path: ${audit.with_file_path} (${(100 * audit.with_file_path / audit.total).toFixed(1)}%)`);
  log.ok(`  tree_node_id: ${audit.with_tree_node} (${(100 * audit.with_tree_node / audit.total).toFixed(1)}%)`);
  log.ok(`  repair_status='pending': ${audit.pending_status}`);

  // Gate checks
  if (audit.with_packet_key < audit.total) {
    log.error(`GATE FAIL: packet_key coverage < 100% (${audit.with_packet_key}/${audit.total})`);
    process.exit(1);
  }

  if (audit.with_source_ref < audit.total * 0.95) {
    log.error(`GATE FAIL: source_ref coverage < 95%`);
    process.exit(1);
  }

  log.ok('✅ All gates passed');
  return audit;
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16-H.1: Schema + Identity Spine Backfill ==========');
    log.info('');

    const client = await pool.connect();

    try {
      // Step 1: Create table
      await createTable(client);
      log.info('');

      // Step 2: Create indexes
      await createIndexes(client);
      log.info('');

      // Step 3: Backfill identity spine
      const backfillCount = await backfillIdentitySpine(client);
      log.info('');

      // Step 4: Link tree nodes
      const treeLinked = await linkTreeNodes(client);
      log.info('');

      // Step 5: Verify
      const audit = await verifyBackfill(client);
      log.info('');

      // Summary
      log.ok('========== Phase 16-H.1 COMPLETE ==========');
      log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      log.info(`Rows backfilled: ${backfillCount}`);
      log.info(`Tree nodes linked: ${treeLinked}`);
      log.info('');
      log.info('Next step: Run phase-16-h-file-path-repair.mjs');

    } finally {
      await client.release();
    }

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
