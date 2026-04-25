// Simple database connection test
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const client = postgres(process.env.DATABASE_URL);

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...');
    const result = await client`SELECT 1 as test`;
    console.log('✅ Database connection successful:', result);

    // Test if tables exist
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log(
      '📋 Existing tables:',
      tables.map((t) => t.table_name)
    );
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  } finally {
    await client.end();
  }
}

testConnection();
