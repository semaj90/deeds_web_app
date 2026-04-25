// Quick test of database connection
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🔍 Testing database connection...');
console.log('Database URL:', process.env.DATABASE_URL);

try {
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  // Test basic query
  const result = await db.execute('SELECT 1 as test');
  console.log('✅ Database connection successful!', result);

  // Test if users table exists
  const tableCheck = await db.execute(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    );
  `);
  console.log('📊 Users table exists:', tableCheck);

  await client.end();
} catch (error) {
  console.error('❌ Database connection failed:', error);
  process.exit(1);
}
