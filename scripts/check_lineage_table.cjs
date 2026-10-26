const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function main() {
  const res = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'atlas_packet_chunk_lineage'
    ORDER BY ordinal_position;
  `);
  console.log("COLUMNS atlas_packet_chunk_lineage:", res.rows);
  const count = await pool.query(`SELECT count(*) FROM atlas_packet_chunk_lineage`);
  console.log("COUNT:", count.rows[0]);
  await pool.end();
}

main().catch(console.error);
