import { config } from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
config();

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

async function testDatabase() {
  console.log('🔍 Testing database connection...');
  console.log('📍 Database URL:', DATABASE_URL);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connection successful');

    // Test persons_of_interest table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'persons_of_interest'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('✅ persons_of_interest table exists');

      // Get count of records
      const countResult = await client.query('SELECT COUNT(*) FROM persons_of_interest');
      const count = parseInt(countResult.rows[0].count);
      console.log(`📊 Found ${count} persons of interest records`);

      if (count > 0) {
        // Get sample records
        const sampleResult = await client.query(`
          SELECT id, name, threat_level, status, case_id
          FROM persons_of_interest
          LIMIT 3
        `);

        console.log('📋 Sample records:');
        sampleResult.rows.forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.name} (${row.threat_level} threat, ${row.status})`);
        });

        console.log('\n✅ DATABASE TEST PASSED - API should be able to fetch data');
      } else {
        console.log('⚠️  No records found in persons_of_interest table');
      }
    } else {
      console.log('❌ persons_of_interest table does not exist');
    }

    client.release();
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ Database test failed:', error.message);

    // Additional error details
    if (error.code) {
      console.error('📋 Error code:', error.code);
    }

    await pool.end();
    return false;
  }
}

testDatabase().catch(console.error);
