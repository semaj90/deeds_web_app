import pg from 'pg';

const DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'atlas_packets'
    ORDER BY ordinal_position
  `);
  console.log("atlas_packets columns:");
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch(console.error);
