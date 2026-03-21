const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db' });

async function check() {
  const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`);
  console.log('users table columns:');
  cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // Check if any test user exists and has a password hash
  const users = await pool.query(`SELECT id, email, hashed_password, password_hash FROM users LIMIT 3`);
  console.log('\nSample users:');
  users.rows.forEach(r => console.log(`  ${r.email}: hash=${r.hashed_password ? 'hashed_password YES' : 'hashed_password NULL'}, password_hash=${r.password_hash ? 'password_hash YES' : 'password_hash NULL'}`));

  pool.end();
}
check().catch(e => { console.error(e.message); pool.end(); });