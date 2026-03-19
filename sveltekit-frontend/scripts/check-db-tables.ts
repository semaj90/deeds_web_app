import pkg from 'pg';
const { Pool } = pkg;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const p = new Pool({ connectionString: DB_URL });

const check = await p.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'jurisdictions','library_documents','library_document_versions',
      'legal_nodes','legal_chunks','legal_definitions',
      'state_constitution_sources'
    )
  ORDER BY table_name
`);
console.log('Existing library tables:', check.rows.map((r: any) => r.table_name));

// Also count rows if tables exist
for (const row of check.rows) {
  const cnt = await p.query(`SELECT COUNT(*) FROM ${row.table_name}`);
  console.log(`  ${row.table_name}: ${cnt.rows[0].count} rows`);
}

await p.end();
