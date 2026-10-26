const pg = require("pg");
const pool = new pg.Pool({ connectionString: "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" });

async function main() {
  const cols = await pool.query(
    "SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'codebase_chunk_index' ORDER BY ordinal_position"
  );
  console.log("COLUMNS:");
  for (const c of cols.rows) {
    console.log(`  - ${c.column_name}: ${c.udt_name}`);
  }

  const sample = await pool.query(
    "SELECT id, chunk_id, relative_path, source_ref, domain, language, som_bmu_row, som_bmu_col, kmeans_cluster, (content_embedding_768 IS NOT NULL) AS has_768 FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL LIMIT 2"
  );
  console.log("SAMPLE ROWS:", JSON.stringify(sample.rows, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
