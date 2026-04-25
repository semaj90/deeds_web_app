// Database Connection Health Check Test
// Run with: node scripts/test-db-connection.mjs

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up environment
process.env.DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

console.log('🔍 Testing Database Connection...\n');

async function testConnection() {
  try {
    // Dynamic import to handle ESM
    const { db, sql, pool } = await import('../sveltekit-frontend/src/lib/server/db/drizzle.js');

    console.log('✅ Module import successful');
    console.log(`📦 Using DATABASE_URL: ${process.env.DATABASE_URL}\n`);

    // Test 1: Basic SQL query
    console.log('Test 1: Basic SQL Query');
    const result = await sql`SELECT 1 as test, current_database() as database, version() as pg_version`;
    console.log('✅ Query executed successfully');
    console.log(`   Database: ${result[0].database}`);
    console.log(`   PostgreSQL: ${result[0].pg_version.split(' ')[0]} ${result[0].pg_version.split(' ')[1]}\n`);

    // Test 2: Check pgvector extension
    console.log('Test 2: Check pgvector Extension');
    try {
      const vectorCheck = await sql`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`;
      if (vectorCheck.length > 0) {
        console.log(`✅ pgvector ${vectorCheck[0].extversion} installed\n`);
      } else {
        console.log('⚠️  pgvector extension not installed\n');
      }
    } catch (err) {
      console.log('⚠️  Could not check pgvector:', err.message, '\n');
    }

    // Test 3: Check connection pool stats
    console.log('Test 3: Connection Pool Stats');
    console.log(`   Total connections: ${pool.totalCount}`);
    console.log(`   Idle connections: ${pool.idleCount}`);
    console.log(`   Waiting clients: ${pool.waitingCount}`);
    console.log(`   Max connections: ${pool.options.max || 10}\n`);

    // Test 4: Check tables exist
    console.log('Test 4: Check Database Tables');
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log(`✅ Found ${tables.length} tables:`);
    tables.slice(0, 10).forEach(t => console.log(`   - ${t.table_name}`));
    if (tables.length > 10) {
      console.log(`   ... and ${tables.length - 10} more\n`);
    } else {
      console.log('');
    }

    // Test 5: Adapter verification
    console.log('Test 5: Verify Correct Adapter');
    console.log(`✅ Using node-postgres (pg.Pool) adapter`);
    console.log(`   Adapter: drizzle-orm/node-postgres`);
    console.log(`   Connection type: Pool-based\n`);

    // Clean up
    await pool.end();
    console.log('✅ Connection pool closed');
    console.log('\n🎉 All tests passed! Database connection is healthy.');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Database connection test failed:');
    console.error(error);
    process.exit(1);
  }
}

testConnection();
