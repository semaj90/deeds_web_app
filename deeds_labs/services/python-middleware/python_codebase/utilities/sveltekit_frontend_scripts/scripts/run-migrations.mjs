#!/usr/bin/env node
/**
 * Database Migration Runner
 * Uses admin (postgres) connection for migrations and extensions
 */

import {
  adminDb,
  adminPool,
  ensureExtensions,
  connectionInfo,
} from '../src/lib/server/db/connections.ts';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

console.log('🔧 Running database migrations with admin privileges');
console.log('Admin connection:', connectionInfo.admin);
console.log('Environment:', connectionInfo.environment);

async function runMigrations() {
  try {
    // Step 1: Ensure extensions are installed
    console.log('\n📦 Ensuring PostgreSQL extensions...');
    await ensureExtensions();

    // Step 2: Run Drizzle migrations
    console.log('\n📋 Running Drizzle migrations...');
    const isWin = process.platform === 'win32';
    const npmCmd = isWin ? 'npm.cmd' : 'npm';
    const drizzleProcess = spawn(npmCmd, ['run', 'db:push'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.MIGRATION_DATABASE_URL || process.env.ADMIN_DATABASE_URL,
      },
    });

    await new Promise((resolve, reject) => {
      drizzleProcess.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Drizzle migration failed with code ${code}`));
        }
      });
    });

    // Step 3: Grant permissions to legal_admin
    console.log('\n🔐 Granting permissions to legal_admin...');
    const client = await adminPool.connect();

    try {
      await client.query(`
        GRANT USAGE ON SCHEMA public TO legal_admin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO legal_admin;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
        GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO legal_admin;
        
        -- Grant permissions on future objects
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO legal_admin;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO legal_admin;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO legal_admin;
      `);

      console.log('✅ Permissions granted to legal_admin');
    } finally {
      client.release();
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Your app can now safely use legal_admin for all operations');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await adminPool.end();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case '--status':
    console.log('📊 Migration status check not implemented yet');
    break;
  case '--rollback':
    console.log('🔄 Rollback not implemented yet');
    break;
  default:
    await runMigrations();
}
