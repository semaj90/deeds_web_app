// Test Postgres connection to port 5434
import pg from 'pg';

const pool = new pg.Pool({
  user: 'user',
  host: '127.0.0.1',
  database: 'legal',
  password: 'pass',
  port: 5434,
});

async function test() {
  console.log('Testing connection to 127.0.0.1:5434...');
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT version(), current_user, current_database(), inet_server_addr();');
    console.log('✅ Connected successfully!');
    console.log('Version:', res.rows[0].version.substring(0, 50));
    console.log('User:', res.rows[0].current_user);
    console.log('Database:', res.rows[0].current_database);
    console.log('Server IP:', res.rows[0].inet_server_addr);
    client.release();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  } finally {
    await pool.end();
  }
}

test();
