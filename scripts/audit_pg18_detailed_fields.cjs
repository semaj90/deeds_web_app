const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function check() {
  const counts = await pool.query(`
    SELECT
      count(*) FILTER (WHERE workspace_revision IS NOT NULL) AS has_workspace_rev,
      count(*) FILTER (WHERE source_revision IS NOT NULL) AS has_source_rev,
      count(*) FILTER (WHERE representation_revision IS NOT NULL) AS has_rep_rev,
      count(*) FILTER (WHERE lineage_binding_checksum IS NOT NULL) AS has_checksum,
      count(*) FILTER (WHERE file_content_hash IS NOT NULL) AS has_file_content_hash,
      count(*) FILTER (WHERE content_hash IS NOT NULL) AS has_content_hash,
      count(*) FILTER (WHERE symbol IS NOT NULL) AS has_symbol,
      count(*) FILTER (WHERE source_ref IS NOT NULL) AS has_source_ref,
      count(*) FILTER (WHERE domain IS NOT NULL) AS has_domain
    FROM public.codebase_chunk_index;
  `);
  console.log('REVISION STATS:', JSON.stringify(counts.rows[0], null, 2));
  await pool.end();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
