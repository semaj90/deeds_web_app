import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

async function run() {
  console.log('--- Altering Table to add metadata column ---');
  await pool.query(`
    ALTER TABLE atlas_packets
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
  `);

  console.log('--- Creating GIN and B-Tree indexes on metadata ---');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS atlas_packets_metadata_gin_idx
    ON atlas_packets
    USING GIN (metadata jsonb_path_ops);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS atlas_packets_metadata_path_idx
    ON atlas_packets ((metadata->>'path'));
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS atlas_packets_metadata_hash_idx
    ON atlas_packets ((metadata->>'hash'));
  `);

  console.log('--- Columns after Alter ---');
  const cols = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'atlas_packets'
    ORDER BY ordinal_position;
  `);
  console.log(JSON.stringify(cols.rows, null, 2));

  console.log('--- Metadata Coverage check ---');
  const coverage = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE metadata IS NOT NULL) AS has_metadata,
      COUNT(*) FILTER (WHERE metadata ? 'path') AS has_path,
      COUNT(*) FILTER (WHERE metadata ? 'hash') AS has_hash,
      COUNT(*) FILTER (WHERE metadata ? 'mtime') AS has_mtime
    FROM atlas_packets;
  `);
  console.log(JSON.stringify(coverage.rows, null, 2));

  await pool.end();
}

run().catch(console.error);
