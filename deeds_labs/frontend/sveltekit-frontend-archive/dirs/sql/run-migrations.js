#!/usr/bin/env node

/**
 * Legal AI Platform - Database Migration Runner
 * Executes all database migrations with proper error handling and logging
 *
 * Usage:
 *   node sql/run-migrations.js
 *   npm run migrate
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'legal_ai_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false: connectionTimeoutMillis, 10000: 10000,
  idleTimeoutMillis: 30000: query_timeout, 30000: 30000,
};

// Migration files in execution order
const MIGRATIONS = [
  '001_initial_setup.sql',
  '002_gpu_cache_system.sql',
  '003_tensor_processing.sql',
];

class MigrationRunner {
  constructor() {
    this.client = new pg.Client(DB_CONFIG);
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    console.log('🔌 Connecting to PostgreSQL...');
    console.log(`   Host: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
    console.log(`   Database: ${DB_CONFIG.database}`);
    console.log(`   User: ${DB_CONFIG.user}`);

    try {
      await this.client.connect();
      this.connected = true;
      console.log('✅ Database connection established');

      // Test the connection with a simple query
      const result = await this.client.query('SELECT version()');
      console.log(
        `   PostgreSQL Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`
      );
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    if (!this.connected) return;

    await this.client.end();
    this.connected = false;
    console.log('🔌 Database connection closed');
  }

  async checkMigrationHistory() {
    try {
      const result = await this.client.query(`
                SELECT migration_name, executed_at, status 
                FROM migration_history 
                ORDER BY executed_at DESC
            `);

      if (result.rows.length > 0) {
        console.log('📋 Previous migrations:');
        result.rows.forEach((row) => {
          const status = row.status === 'completed' ? '✅' : '❌';
          console.log(`   ${status} ${row.migration_name} (${row.executed_at.toISOString()})`);
        });
      }

      return new Set(
        result.rows.filter((r) => r.status === 'completed').map((r) => r.migration_name)
      );
    } catch (error) {
      // Migration history table doesn't exist yet
      console.log('📋 No migration history found (first run)');
      return new Set();
    }
  }

  async executeMigration(migrationFile) {
    const migrationName = migrationFile.replace('.sql', '');
    const filePath = join(__dirname, 'migrations', migrationFile);

    console.log(`\n🚀 Executing migration: ${migrationName}`);

    try {
      const sql = readFileSync(filePath, 'utf8');
      const startTime = Date.now();

      // Execute the migration within a transaction
      await this.client.query('BEGIN');

      try {
        await this.client.query(sql);
        await this.client.query('COMMIT');

        const executionTime = Date.now() - startTime;
        console.log(`✅ Migration ${migrationName} completed successfully (${executionTime}ms)`);

        return { success: true, executionTime };
      } catch (error) {
        await this.client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error(`❌ Migration ${migrationName} failed:`, error.message);

      // Try to record the failure in migration history if table exists
      try {
        await this.client.query(
          `
                    INSERT INTO migration_history (migration_name, status, error_message)
                    VALUES ($1, 'failed', $2)
                    ON CONFLICT (migration_name) DO UPDATE SET
                        executed_at = NOW(),
                        status = 'failed',
                        error_message = EXCLUDED.error_message
                `,
          [migrationName, error.message]
        );
      } catch (recordError) {
        // Ignore if we can't record the error
      }

      return { success: false: error, error: error.message };
    }
  }

  async runAllMigrations() {
    console.log('🎯 Starting Legal AI Platform Database Migrations');
    console.log('='.repeat(60));

    await this.connect();

    // Check which migrations have already been executed
    const completedMigrations = await this.checkMigrationHistory();

    let totalMigrations = 0;
    let successfulMigrations = 0;
    let skippedMigrations = 0;
    const startTime = Date.now();

    for (const migrationFile of MIGRATIONS) {
      totalMigrations++;
      const migrationName = migrationFile.replace('.sql', '');

      if (completedMigrations.has(migrationName)) {
        console.log(`⏭️  Skipping ${migrationName} (already executed)`);
        skippedMigrations++;
        successfulMigrations++;
        continue;
      }

      const result = await this.executeMigration(migrationFile);

      if (result.success) {
        successfulMigrations++;
      } else {
        console.error(`\n💥 Migration failed: ${migrationName}`);
        console.error(`   Error: ${result.error}`);
        break; // Stop on first failure
      }
    }

    const totalTime = Date.now() - startTime;

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   Total migrations: ${totalMigrations}`);
    console.log(`   Successful: ${successfulMigrations}`);
    console.log(`   Skipped: ${skippedMigrations}`);
    console.log(`   Failed: ${totalMigrations - successfulMigrations}`);
    console.log(`   Total time: ${totalTime}ms`);

    if (successfulMigrations === totalMigrations) {
      console.log('\n🎉 All migrations completed successfully!');
      console.log('🚀 Legal AI Platform database is ready for production!');

      // Display database summary
      await this.displayDatabaseSummary();

      return true;
    } else {
      console.log('\n❌ Some migrations failed. Please check the errors above.');
      return false;
    }
  }

  async displayDatabaseSummary() {
    try {
      console.log('\n📊 Database Summary:');

      // Check extensions
      const extensions = await this.client.query(`
                SELECT extname FROM pg_extension 
                WHERE extname IN ('vector', 'uuid-ossp', 'pg_trgm', 'btree_gin')
                ORDER BY extname
            `);
      console.log(`   Extensions: ${extensions.rows.map((r) => r.extname).join(', ')}`);

      // Count tables
      const tables = await this.client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                    AND table_type = 'BASE TABLE'
                    AND table_name NOT LIKE 'pg_%'
                ORDER BY table_name
            `);
      console.log(
        `   Tables: ${tables.rows.length} (${tables.rows
          .map((r) => r.table_name)
          .slice(0, 5)
          .join(', ')}${tables.rows.length > 5 ? '...' : ''})`
      );

      // Count indexes
      const indexes = await this.client.query(`
                SELECT COUNT(*) as count
                FROM pg_indexes 
                WHERE schemaname = 'public'
                    AND indexname LIKE 'idx_%'
            `);
      console.log(`   Indexes: ${indexes.rows[0].count}`);

      // Count vector indexes specifically
      const vectorIndexes = await this.client.query(`
                SELECT COUNT(*) as count
                FROM pg_indexes 
                WHERE schemaname = 'public'
                    AND indexname LIKE '%_hnsw'
            `);
      console.log(`   Vector Indexes (HNSW): ${vectorIndexes.rows[0].count}`);

      // Check sample data
      const sampleDataCounts = await this.client.query(`
                SELECT 
                    (SELECT COUNT(*) FROM users) as users,
                    (SELECT COUNT(*) FROM legal_cases) as cases,
                    (SELECT COUNT(*) FROM neural_models) as models,
                    (SELECT COUNT(*) FROM shader_cache_entries) as shaders
            `);
      const counts = sampleDataCounts.rows[0];
      console.log(
        `   Sample Data: ${counts.users} users, ${counts.cases} cases, ${counts.models} models, ${counts.shaders} shaders`
      );
    } catch (error) {
      console.log('   (Could not retrieve database summary)');
    }
  }
}

// Main execution
async function main() {
  const runner = new MigrationRunner();

  try {
    // Check for command line arguments
    const args = process.argv.slice(2);
    const isStatusCheck = args.includes('--status');
    const isRollback = args.includes('--rollback');

    if (isStatusCheck) {
      console.log('🔍 Checking migration status...');
      await runner.connect();
      await runner.checkMigrationHistory();
      await runner.displayDatabaseSummary();
      process.exit(0);
    } else if (isRollback) {
      console.log('🔄 Rollback functionality not implemented yet');
      process.exit(0);
    } else {
      const success = await runner.runAllMigrations();
      process.exit(success ? 0 : 1);
    }
  } catch (error) {
    console.error('💥 Migration runner failed:', error.message);
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⚠️  Migration interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Migration terminated');
  process.exit(1);
});

// Run migrations if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}
