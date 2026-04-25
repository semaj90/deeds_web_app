import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
dotenv.config();

console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Test PostgreSQL connection
async function testConnection() {
  try {
    console.log('Testing PostgreSQL connection...');

    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/prosecutor_db',
    });

    const client = await pool.connect();
    console.log('✅ PostgreSQL connection successful');

    // Test query
    const result = await client.query('SELECT version()');
    console.log('PostgreSQL version:', result.rows[0].version);

    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);

    // Fallback: show what environment variables are set
    console.log('Environment variables:');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    console.log('NODE_ENV:', process.env.NODE_ENV);
  }
}

testConnection();
