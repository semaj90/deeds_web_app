#!/usr/bin/env node
/**
 * Phase 8: Create Schema Columns
 *
 * Creates the Phase 8 target columns on atlas_packets table:
 *   - page_rank_score (real) — Neo4j PageRank score
 *   - kmeans_cluster_id (integer) — K-Means cluster assignment
 *
 * These columns must exist before Phase 8 scripts write to them.
 *
 * Usage:
 *   node scripts/atlas/phase8-create-schema.mjs --dry-run
 *   node scripts/atlas/phase8-create-schema.mjs --apply
 */

import pg from 'pg';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

const SQL = [
  `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS page_rank_score real DEFAULT NULL;`,
  `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS kmeans_cluster_id integer DEFAULT NULL;`,
  `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS community_id integer DEFAULT NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_page_rank_score ON atlas_packets(page_rank_score DESC NULLS LAST);`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_kmeans_cluster_id ON atlas_packets(kmeans_cluster_id);`,
  `CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_id ON atlas_packets(community_id);`,
];

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log(`║  Phase 8: Create Schema (${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(50)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function createSchema() {
  try {
    for (const query of SQL) {
      console.log(`  ℹ️  ${query.slice(0, 70)}...`);

      if (APPLY) {
        await pool.query(query);
        console.log(`     ✅ Applied\n`);
      } else {
        console.log(`     📝 DRY-RUN (not applied)\n`);
      }
    }

    console.log(`\n✅ Phase 8 schema ${APPLY ? 'created' : 'ready (dry-run)'}\n`);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createSchema();
