// Test the actual Drizzle ORM insert to see what SQL it generates with casing: 'snake_case'
// We can check the generated SQL by looking at the query parameter names

const { Pool } = require('pg');

// Intercept queries to see what Drizzle sends
const origQuery = Pool.prototype.query;
const interceptedQueries = [];

const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db' });

// Patch the pool's query to log SQL
const origPoolQuery = pool.query.bind(pool);
pool.query = function(...args) {
  if (typeof args[0] === 'string') {
    console.log('SQL:', args[0].substring(0, 200));
  } else if (args[0] && args[0].text) {
    console.log('SQL:', args[0].text.substring(0, 200));
  }
  return origPoolQuery(...args);
};

async function test() {
  // Simple: check if we can select hashed_password
  const result = await pool.query('SELECT id, email, hashed_password FROM users LIMIT 1');
  console.log('Direct SQL result:', result.rows[0]?.email, 'hash present:', !!result.rows[0]?.hashed_password);

  // Now try to insert with the column name that Drizzle would use
  // If casing: 'snake_case' is active, passwordHash -> password_hash (NOT hashed_password)
  try {
    await pool.query(`INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), 'casing-test@test.ai', '$2a$12$fake', 'Test', 'Casing', 'prosecutor', true, NOW(), NOW())`);
    console.log('password_hash insert: SUCCESS (should not happen!)');
  } catch (e) {
    console.log('password_hash insert: FAILED as expected -', e.message.substring(0, 100));
  }

  pool.end();
}
test().catch(e => { console.error(e); pool.end(); });