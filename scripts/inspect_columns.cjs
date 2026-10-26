const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function main() {
  const res = await pool.query(`
    SELECT column_name, data_type, udt_name, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'codebase_chunk_index'
      AND column_name IN (
        'workspace_revision', 'source_revision', 'representation_revision',
        'lineage_binding_checksum', 'content_embedding_768', 'content_embedding'
      );
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
