#!/usr/bin/env node
/**
 * add-atlas-packets-columns.mjs
 *
 * Phase 3I migration: adds packet_key, source_kind, reward_prior, source_path
 * columns to atlas_packets table (idempotent — safe to re-run).
 *
 * Usage:
 *   node scripts/atlas/add-atlas-packets-columns.mjs
 *   node scripts/atlas/add-atlas-packets-columns.mjs --dry-run
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);

const DRY_RUN = process.argv.includes('--dry-run');

const MIGRATIONS = [
  {
    column: 'packet_key',
    sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS packet_key TEXT`,
    index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_packets_packet_key ON atlas_packets(packet_key) WHERE packet_key IS NOT NULL`,
    note: 'Canonical join key (canonicalPath + content hash)',
  },
  {
    column: 'source_kind',
    sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS source_kind TEXT`,
    note: "Source type: 'neschrom97', 'chr97', 'graphify', 'msgpack', etc.",
  },
  {
    column: 'reward_prior',
    sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS reward_prior DOUBLE PRECISION DEFAULT 0`,
    note: 'Historical reward score from agent trace outcomes',
  },
  {
    column: 'source_path',
    sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS source_path TEXT`,
    note: 'Full original source path before canonicalization',
  },
  {
    column: 'updated_at',
    sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`,
    note: 'Last backfill/update timestamp',
  },
  {
    column: 'tree_node_id',
    sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS tree_node_id UUID`,
    note: 'Tree topology bridge to atlas_tree_nodes',
  },
];

const EXTRA_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref ON atlas_packets(source_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id ON atlas_packets(feature_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_feature ON atlas_packets(source_ref, feature_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_qdrant_point_id ON atlas_packets(qdrant_point_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_id ON atlas_packets(community_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_tree_node_id ON atlas_packets(tree_node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_kind ON atlas_packets(source_kind)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_concept_ids ON atlas_packets USING GIN(concept_ids)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_gin_pathops ON atlas_packets USING GIN(metadata jsonb_path_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_gin_pathops ON atlas_packets USING GIN(payload jsonb_path_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_summary_fts ON atlas_packets USING GIN(to_tsvector('english', coalesce(summary, '')))`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_envelope_fts ON atlas_packets USING GIN(to_tsvector('english', coalesce(payload->>'title', '') || ' ' || coalesce(summary, '') || ' ' || coalesce(feature_label, '') || ' ' || coalesce(feature_id, '')))`,
];

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Check existing columns
    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_packets'
    `);
    const existing = new Set(colRes.rows.map((r) => r.column_name));

    console.log('\n📋 Atlas Packets Column Migration (Phase 3I)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let added = 0;
    let skipped = 0;

    for (const m of MIGRATIONS) {
      if (existing.has(m.column)) {
        console.log(`  ⏭  SKIP  ${m.column} (already exists)`);
        skipped++;
        continue;
      }

      console.log(`  ➕ ADD   ${m.column} — ${m.note}`);
      if (!DRY_RUN) {
        await pool.query(m.sql);
        if (m.index) {
          await pool.query(m.index);
        }
        added++;
      } else {
        console.log(`         [dry-run] would run: ${m.sql}`);
        added++;
      }
    }

    console.log('\n  🔍 Ensuring indexes...');
    for (const idx of EXTRA_INDEXES) {
      const name = idx.match(/INDEX IF NOT EXISTS (\S+)/)?.[1] ?? '?';
      if (!DRY_RUN) {
        await pool.query(idx);
        console.log(`     ✅ ${name}`);
      } else {
        console.log(`     [dry-run] ${name}`);
      }
    }

    console.log(`\n  Added: ${added} column(s)  Skipped: ${skipped} (already existed)`);

    if (DRY_RUN) {
      console.log('\n  [dry-run] No changes made. Remove --dry-run to apply.\n');
    } else {
      console.log('\n  ✅ Migration complete.\n');
      console.log('  Next: node scripts/atlas/backfill-atlas-source-refs.mjs\n');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
