const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

// Simulate what Drizzle does: try to select with various column names
async function check() {
  // Check what happens with hashed_password
  try {
    const r = await pool.query(`SELECT id, email, hashed_password FROM users WHERE email = 'admin@yorha.dev' LIMIT 1`);
    console.log('hashed_password column:', r.rows[0] ? 'EXISTS, has value=' + (!!r.rows[0].hashed_password) : 'user not found');
  } catch (e) {
    console.error('hashed_password query error:', e.message);
  }

  // Check if password_hash column exists
  try {
    const r = await pool.query(`SELECT password_hash FROM users LIMIT 1`);
    console.log('password_hash column: EXISTS');
  } catch (e) {
    console.error('password_hash column: DOES NOT EXIST -', e.message);
  }

  // Try an insert similar to what registration does
  try {
    const r = await pool.query(`
      INSERT INTO users (id, email, hashed_password, first_name, last_name, role, is_active, has_completed_onboarding, onboarding_step, created_at, updated_at)
      VALUES (gen_random_uuid(), 'drizzle-test@test.ai', '$2a$12$fakehash', 'Test', 'Drizzle', 'prosecutor', true, false, 0, NOW(), NOW())
      RETURNING *
    `);
    console.log('Manual insert OK:', r.rows[0].id);
    await pool.query(`DELETE FROM users WHERE email = 'drizzle-test@test.ai'`);
    console.log('Cleaned up test user');
  } catch (e) {
    console.error('Manual insert FAILED:', e.message);
  }

  pool.end();
}
check().catch(e => { console.error(e); pool.end(); });