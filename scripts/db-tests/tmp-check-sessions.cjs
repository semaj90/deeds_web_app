const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function check() {
  const cols = await pool.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'sessions' ORDER BY ordinal_position`);
  console.log('sessions table columns:', JSON.stringify(cols.rows, null, 2));

  // Also check if there are any sessions in the table
  const count = await pool.query('SELECT count(*) FROM sessions');
  console.log('Session count:', count.rows[0].count);

  // Try inserting a test session manually to see what happens
  try {
    const result = await pool.query(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('test-session-check', '00000000-0000-0000-0000-000000000001', NOW() + INTERVAL '1 day') RETURNING *`);
    console.log('Manual session insert OK:', JSON.stringify(result.rows[0]));
    // Clean up
    await pool.query(`DELETE FROM sessions WHERE id = 'test-session-check'`);
  } catch (e) {
    console.error('Manual session insert failed:', e.message);
  }

  pool.end();
}
check().catch(e => { console.error(e); pool.end(); });