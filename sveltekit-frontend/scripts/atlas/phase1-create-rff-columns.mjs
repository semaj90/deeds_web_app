#!/usr/bin/env node
/**
 * Phase 1 Setup: Create error_embedding and signature_embedding columns
 *
 * Before backfilling, we need to add the vector columns to codebase_chunk_index.
 *
 * Usage:
 *   node scripts/atlas/phase1-create-rff-columns.mjs --dry-run
 *   node scripts/atlas/phase1-create-rff-columns.mjs --apply
 */

import pkg from 'pg';
const { Pool } = pkg;

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || '123456',
  database: process.env.POSTGRES_DB || 'legal_ai_db'
});

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1 Setup: Create RFF Embedding Columns                  ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const SQL_STATEMENTS = [
  // Add error_embedding column if it doesn't exist
  `ALTER TABLE codebase_chunk_index
   ADD COLUMN IF NOT EXISTS error_embedding vector(384)`,

  // Add signature_embedding column if it doesn't exist (may already exist as halfvec, skip)
  `-- signature_embedding may already exist, check manually if needed`,

  // Drop index if it exists with wrong type
  `DROP INDEX IF EXISTS idx_codebase_chunk_index_signature_embedding_hnsw`,

  // Create HNSW index for error_embedding (only for vector columns)
  `CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_error_embedding_hnsw
   ON codebase_chunk_index USING hnsw (error_embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64)`
];

async function createColumns() {
  console.log('📊 Creating RFF Embedding Columns\n');

  const client = await pool.connect();

  try {
    for (const sql of SQL_STATEMENTS) {
      console.log(`  ⏳ ${sql.split('\n')[0].substring(0, 60)}...`);

      if (DRY_RUN) {
        console.log(`    [DRY-RUN] Would execute SQL\n`);
      } else {
        try {
          await client.query(sql);
          console.log(`    ✓ Done\n`);
        } catch (e) {
          if (e.code === '42701' || e.message.includes('already exists')) {
            console.log(`    ✓ Already exists\n`);
          } else {
            console.error(`    ✗ Error: ${e.message}\n`);
            throw e;
          }
        }
      }
    }

    // Verify columns exist
    const checkRes = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'codebase_chunk_index'
      AND column_name IN ('error_embedding', 'signature_embedding')
      ORDER BY column_name
    `);

    console.log('🔍 Verification\n');
    console.log(`  Columns created: ${checkRes.rows.length}\n`);
    checkRes.rows.forEach(row => {
      console.log(`    ${row.column_name}: ${row.data_type}`);
    });

    return checkRes.rows.length === 2;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('');
    const success = await createColumns();

    console.log('');
    if (DRY_RUN) {
      console.log('✓ Dry-run complete. Run with --apply to create columns.');
    } else if (success) {
      console.log('✓ Phase 1 setup COMPLETE — Ready for backfill');
      console.log('  Next: npm run atlas:phase1:backfill:rff:apply');
    } else {
      console.log('⚠ Setup had issues. Check logs above.');
    }

    console.log('');
    await pool.end();
  } catch (e) {
    console.error('Fatal error:', e.message);
    await pool.end();
    process.exit(1);
  }
}

main();