
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db'
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log('Tables:', res.rows.map(r => r.table_name));

    const cases = await pool.query("SELECT * FROM information_schema.tables WHERE table_name = 'cases'");
    console.log('Cases table exists:', cases.rowCount > 0);

    if (cases.rowCount > 0) {
        const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cases'");
        console.log('Cases columns:', cols.rows);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

check();
