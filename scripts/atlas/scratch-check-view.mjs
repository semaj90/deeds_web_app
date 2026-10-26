import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

async function main() {
  const rels = await pool.query(`
    SELECT n.nspname AS schema_name, c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('parent_atlas_documents', 'atlas_packets')
  `);
  console.log('RELATIONS:', JSON.stringify(rels.rows, null, 2));

  const def = await pool.query(`
    SELECT pg_get_viewdef('public.parent_atlas_documents'::regclass, true) AS viewdef
  `).catch(err => ({ rows: [{ error: err.message }] }));
  console.log('VIEWDEF:\n', def.rows[0]?.viewdef ?? def.rows[0]);

  const cols = await pool.query(`
    SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a
    WHERE a.attrelid = 'public.parent_atlas_documents'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
  `);
  console.log('VIEW COLUMNS (' + cols.rows.length + '):', cols.rows.map(c => `${c.attnum}. ${c.attname} (${c.type})`));

  const tablesWithSourceRefId = await pool.query(`
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE column_name = 'source_ref_id'
  `);
  console.log('TABLES WITH source_ref_id:', JSON.stringify(tablesWithSourceRefId.rows, null, 2));

  const atlasIdCols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'atlas_packets' AND (column_name LIKE '%id%' OR column_name LIKE '%ref%' OR column_name LIKE '%key%')
    ORDER BY ordinal_position
  `);
  console.log('ATLAS_PACKETS id/ref/key COLS:', JSON.stringify(atlasIdCols.rows, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
