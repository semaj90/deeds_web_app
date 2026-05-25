import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://legal_ai_user:legal_ai_pass@127.0.0.1:5434/legal_ai_db'
});

async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'documents_atlas_entries' 
    ORDER BY ordinal_position;
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

run().catch(console.error);
