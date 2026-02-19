#!/usr/bin/env node

/**
 * Database Migration CLI Tool
 * Usage: npm run migrate [command] [options]
 */

import { DatabaseMigrator, generateInitialMigrations } from '../src/lib/database/migrations/migration-system.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env.development') });

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/legal_ai';
const migrator = new DatabaseMigrator(connectionString);

const printUsage = () => {
  console.log(`
🔧 Database Migration CLI Tool

Usage: npm run migrate [command] [options]

Commands:
  init              Initialize migration system and create base schema
  migrate           Run all pending migrations
  rollback          Rollback the last migration
  status            Show migration status
  create <name>     Create a new migration file
  validate          Validate migration integrity
  reset             ⚠️  Reset database (drops all tables)
  help              Show this help message

Examples:
  npm run migrate init
  npm run migrate create "add_user_preferences"
  npm run migrate migrate
  npm run migrate status
  npm run migrate rollback
  npm run migrate validate

Environment:
  DATABASE_URL: ${connectionString}
`);
};

const resetDatabase = async () => {
  console.log('⚠️  WARNING: This will drop all tables and data!');
  console.log('Type "yes" to confirm:');

  // Simple confirmation prompt
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('> ', async (answer) => {
      rl.close();

      if (answer.toLowerCase() === 'yes') {
        try {
          // Drop all tables
          await migrator.sql`
            DROP SCHEMA public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO postgres;
            GRANT ALL ON SCHEMA public TO public;
          `;
          console.log('✅ Database reset complete');
          resolve(true);
        } catch (error) {
          console.error('❌ Reset failed:', error);
          resolve(false);
        }
      } else {
        console.log('❌ Reset cancelled');
        resolve(false);
      }
    });
  });
};

const printMigrationStatus = async () => {
  const status = await migrator.getStatus();

  console.log('📊 Migration Status:');
  console.log(`   Applied: ${status.appliedMigrations}`);
  console.log(`   Pending: ${status.pendingMigrations}`);
  console.log(`   Last Migration: ${status.lastMigration || 'None'}`);
  console.log(`   System Health: ${status.systemHealthy ? '✅ Healthy' : '❌ Issues detected'}`);

  if (status.pendingMigrations > 0) {
    console.log(`\n💡 Run "npm run migrate migrate" to apply ${status.pendingMigrations} pending migrations`);
  }
};

const run = async () => {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'init':
        console.log('🚀 Initializing migration system...');
        await migrator.initialize();
        console.log('📝 Generating initial migration files...');
        await generateInitialMigrations(migrator);
        console.log('⬆️  Running initial migrations...');
        await migrator.migrate();
        console.log('✅ Migration system initialized successfully!');
        await printMigrationStatus();
        break;

      case 'migrate':
        console.log('🔄 Running migrations...');
        const results = await migrator.migrate();

        if (results.length === 0) {
          console.log('✅ No pending migrations');
        } else {
          const successful = results.filter(r => r.success && r.applied);
          const failed = results.filter(r => !r.success);
          const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

          console.log(`✅ Migration complete:`);
          console.log(`   Applied: ${successful.length}`);
          console.log(`   Failed: ${failed.length}`);
          console.log(`   Total time: ${totalTime}ms`);

          if (failed.length > 0) {
            console.log('\n❌ Failed migrations:');
            failed.forEach(result => {
              console.log(`   - ${result.version}: ${result.error}`);
            });
          }
        }
        break;

      case 'rollback':
        console.log('🔙 Rolling back last migration...');
        const rollbackResult = await migrator.rollback();

        if (rollbackResult.success && rollbackResult.applied) {
          console.log(`✅ Rollback completed: ${rollbackResult.version} (${rollbackResult.executionTime}ms)`);
        } else if (rollbackResult.success && !rollbackResult.applied) {
          console.log('ℹ️  No migrations to rollback');
        } else {
          console.error(`❌ Rollback failed: ${rollbackResult.error}`);
          process.exit(1);
        }
        break;

      case 'status':
        await printMigrationStatus();
        break;

      case 'create':
        const name = args[0];
        if (!name) {
          console.error('❌ Migration name required');
          console.log('Usage: npm run migrate create "migration_name"');
          process.exit(1);
        }

        const filename = await migrator.createMigration(name);
        console.log(`✅ Created migration: ${filename}`);
        console.log(`📝 Edit the file and then run "npm run migrate migrate"`);
        break;

      case 'validate':
        console.log('🔍 Validating migration integrity...');
        const validation = await migrator.validateIntegrity();

        console.log(`Validation: ${validation.valid ? '✅ Valid' : '❌ Invalid'}`);

        if (validation.issues.length > 0) {
          console.log('Issues found:');
          validation.issues.forEach(issue => console.log(`   - ${issue}`));
          process.exit(1);
        }
        break;

      case 'reset':
        const resetConfirmed = await resetDatabase();
        if (resetConfirmed) {
          console.log('🚀 Re-initializing after reset...');
          await migrator.initialize();
          await generateInitialMigrations(migrator);
          await migrator.migrate();
          console.log('✅ Database reset and re-initialized');
        }
        break;

      case 'help':
      case '--help':
      case '-h':
        printUsage();
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await migrator.close();
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}