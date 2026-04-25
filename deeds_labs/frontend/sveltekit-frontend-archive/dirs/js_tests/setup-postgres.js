import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './src/lib/server/db/unified-schema.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/prosecutor_db';

async function setupDatabase() {
  console.log('🔧 Setting up PostgreSQL database...');
  console.log('Database URL:', databaseUrl);

  try {
    // Create connection pool
    const pool = new Pool({
      connectionString: databaseUrl,
    });

    const db = drizzle(pool, { schema });

    console.log('✅ Connected to PostgreSQL');

    // Test the connection
    const client = await pool.connect();
    console.log('✅ Database connection established');

    // Create a test user
    try {
      const hashedPassword = await bcrypt.hash('password123', 10);

      const result = await db
        .insert(schema.users)
        .values({
          email: 'admin@prosecutor.com',
          hashedPassword,
          name: 'System Administrator',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
        })
        .returning();

      console.log('✅ Created admin user:', result[0].email);
    } catch (error) {
      console.log('ℹ️ Admin user may already exist:', error.message);
    }

    // Test query
    const users = await db.select().from(schema.users).limit(5);
    console.log('✅ Found', users.length, 'users in database');

    client.release();
    await pool.end();

    console.log('🎉 Database setup complete!');
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.error('Full error:', error);
  }
}

setupDatabase();
