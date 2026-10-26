const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function check() {
  const conn = await pool.query('SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), version()');
  console.log('CONN INFO:', JSON.stringify(conn.rows[0], null, 2));

  const sample = await pool.query(`
    SELECT
        id,
        relative_path,
        symbol,
        kind,
        workspace_revision,
        source_revision,
        representation_revision,
        lineage_binding_checksum,
        content_embedding_768 IS NOT NULL AS has_768
    FROM public.codebase_chunk_index
    WHERE content_embedding_768 IS NOT NULL
    LIMIT 3;
  `);
  console.log('SAMPLE REAL ROWS:', JSON.stringify(sample.rows, null, 2));

  const lineage = await pool.query(`
    SELECT
        count(*) AS rows_total,
        count(*) FILTER (
            WHERE workspace_revision IS NOT NULL
              AND source_revision IS NOT NULL
              AND representation_revision IS NOT NULL
              AND lineage_binding_checksum IS NOT NULL
        ) AS lineage_fields_present
    FROM public.codebase_chunk_index;
  `);
  console.log('LINEAGE AUDIT:', JSON.stringify(lineage.rows[0], null, 2));

  await pool.end();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
