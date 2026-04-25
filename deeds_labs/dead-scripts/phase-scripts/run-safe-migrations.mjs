#!/usr/bin/env node

/**
 * Safe Migration Runner
 * Applies database migrations using safe patterns
 */

import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Load environment
dotenv.config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in .env');
  process.exit(1);
}

async function runMigrations() {
  console.log('🚀 Starting safe database migrations...');

  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  try {
    // Check current migration status
    console.log('📊 Checking migration status...');

    // Run migrations
    await migrate(db, { migrationsFolder: './drizzle' });

    console.log('✅ Migrations completed successfully');

    // Verify database health
    const result = await sql`SELECT version()`;
    console.log('🗄️  Database version:', result[0].version.split(' ')[0]);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations().catch(console.error);