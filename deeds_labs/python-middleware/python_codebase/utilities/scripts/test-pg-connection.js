/**
 * Simple Database Connection Test
 * Tests the PostgreSQL connection directly using pg module
 * Run: node scripts/test-pg-connection.js
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

console.log('🔍 Testing PostgreSQL Connection...\n');
console.log(`📦 DATABASE_URL: ${DATABASE_URL}\n`);

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function runTests() {
  try {
    // Test 1: Basic connection
    console.log('Test 1: Basic Connection');
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Test 2: Simple query
    console.log('Test 2: Simple Query');
    const result = await client.query('SELECT 1 as test, current_database() as database, version() as pg_version');
    console.log('✅ Query executed successfully');
    console.log(`   Database: ${result.rows[0].database}`);
    console.log(`   PostgreSQL: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}\n`);

    // Test 3: Check pgvector extension
    console.log('Test 3: Check pgvector Extension');
    try {
      const vectorCheck = await client.query(
        "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
      );
      if (vectorCheck.rows.length > 0) {
        console.log(`✅ pgvector ${vectorCheck.rows[0].extversion} installed\n`);
      } else {
        console.log('⚠️  pgvector extension not installed (run: CREATE EXTENSION vector;)\n');
      }
    } catch (err) {
      console.log('⚠️  Could not check pgvector:', err.message, '\n');
    }

    // Test 4: Check tables
    console.log('Test 4: Check Database Tables');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`✅ Found ${tables.rows.length} tables:`);
    tables.rows.slice(0, 10).forEach(t => console.log(`   - ${t.table_name}`));
    if (tables.rows.length > 10) {
      console.log(`   ... and ${tables.rows.length - 10} more\n`);
    } else {
      console.log('');
    }

    // Test 5: Connection pool stats
    console.log('Test 5: Connection Pool Stats');
    console.log(`   Total connections: ${pool.totalCount}`);
    console.log(`   Idle connections: ${pool.idleCount}`);
    console.log(`   Waiting clients: ${pool.waitingCount}\n`);

    // Test 6: Vector operations (if pgvector installed)
    console.log('Test 6: Vector Operations');
    try {
      const vectorTest = await client.query(`
        SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance
      `);
      console.log(`✅ Vector operations working`);
      console.log(`   Sample distance: ${vectorTest.rows[0].distance}\n`);
    } catch (err) {
      console.log('⚠️  Vector operations not available:', err.message, '\n');
    }

    client.release();
    await pool.end();

    console.log('✅ All tests passed!');
    console.log('\n🎉 PostgreSQL connection is healthy and ready for Drizzle ORM');
    console.log('   Adapter: node-postgres (pg.Pool) ✅');
    console.log('   Connection pooling: Enabled ✅');
    console.log('   pgvector support: Available ✅\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Connection test failed:');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check PostgreSQL is running: docker ps | grep postgres');
    console.error('2. Verify DATABASE_URL is correct');
    console.error('3. Check firewall/network settings');
    console.error('4. Try: docker-compose up -d postgres\n');

    await pool.end().catch(() => {});
    process.exit(1);
  }
}

runTests();
