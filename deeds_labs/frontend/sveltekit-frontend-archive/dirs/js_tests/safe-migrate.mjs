#!/usr/bin/env node

// Safe database migration script
// Only attempts migration if PostgreSQL is available

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function safeMigrate() {
  console.log('🔍 Checking database connectivity...');

  try {
    // Test if PostgreSQL is accepting connections
    await execAsync('pg_isready -h localhost -p 5432 -t 5');
    console.log('✅ PostgreSQL is available');

    // Run migrations
    console.log('🔄 Running database migrations...');
    const { stdout, stderr } = await execAsync('npx drizzle-kit migrate');

    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes('Migration')) console.error(stderr);

    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.log('⚠️  Database not available or migration failed');
    console.log('📋 This is expected if:');
    console.log('  - PostgreSQL is not installed or running');
    console.log('  - Database credentials are incorrect');
    console.log('  - Database does not exist yet');
    console.log('\n🎯 To set up the database:');
    console.log('  1. Install PostgreSQL');
    console.log('  2. Create database: createdb prosecutor_db');
    console.log('  3. Update DATABASE_URL in .env');
    console.log('  4. Run: npm run db:migrate');
    console.log('\n🚀 The app can still run with limited functionality');
  }
}

safeMigrate();
