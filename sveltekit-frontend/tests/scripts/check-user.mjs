
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db'
});

async function check() {
  try {
    const res = await pool.query("SELECT * FROM users WHERE id = '00000000-0000-0000-0000-000000000001'");
    console.log('User found:', res.rowCount > 0);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

check();
