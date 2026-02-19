#!/usr/bin/env node

/**
 * Database Initialization Script
 * Applies all PostgreSQL migrations to initialize the legal AI database
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runMigration(sqlPath) {
  try {
    const sql = readFileSync(sqlPath, 'utf-8');

    // Use psql to execute the migration
    const command = `psql "${DATABASE_URL}" -f "${sqlPath}"`;

    log(`  Executing: ${sqlPath}...`, 'yellow');
    execSync(command, { stdio: 'inherit' });
    log(`  ✅ Completed: ${sqlPath}`, 'green');

    return true;
  } catch (error) {
    log(`  ❌ Failed: ${sqlPath}`, 'red');
    log(`    Error: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🚀 Legal AI Database Initialization', 'blue');
  log('='.repeat(50), 'blue');

  log(`\nDatabase URL: ${DATABASE_URL}\n`, 'yellow');

  // Order of migrations (most critical first)
  const migrationPaths = [
    // Core pgvector setup
    'src/lib/server/db/migrations/ensure-pgvector.sql',
    'src/lib/server/db/migrations/001_init_pgvector.sql',

    // Enhanced schema
    'src/lib/server/db/migrations/002_enhanced_schema_with_qdrant.sql',
    'src/lib/server/db/migrations/003_deploy_enhanced_legal_schema.sql',

    // API and core tables
    'src/lib/server/db/migrations/004_add_missing_api_tables.sql',
    'src/lib/server/db/migrations/005_setup_legal_ai_tables.sql',

    // Vector optimization
    'src/lib/server/db/migrations/006_optimize_vector_indexing.sql',
    'src/lib/server/db/migrations/008_standardize-vector-dimensions-to-384.sql',
    'src/lib/server/db/migrations/010_standardize_vectors_384.sql',

    // Additional tables
    'src/lib/server/db/migrations/010_add_uploads_table.sql',
    'src/lib/server/db/migrations/011_create_case_memories_and_pgvector.sql',

    // Drizzle migrations
    'drizzle/migrations/20251026_create_cases_table.sql',
    'drizzle/migrations/20251101_add_processed_at_documents.sql',
  ];

  let successful = 0;
  let failed = 0;

  log('\n📋 Starting migrations...\n', 'blue');

  for (const migrationPath of migrationPaths) {
    const fullPath = resolve(migrationPath);

    try {
      // Check if file exists
      readFileSync(fullPath);

      const success = await runMigration(fullPath);
      if (success) {
        successful++;
      } else {
        failed++;
      }
    } catch (error) {
      // File doesn't exist, skip
      log(`  ⏭️  Skipped (not found): ${migrationPath}`, 'yellow');
    }
  }

  log('\n' + '='.repeat(50), 'blue');
  log(`\n📊 Migration Summary:`, 'blue');
  log(`   ✅ Successful: ${successful}`, 'green');
  if (failed > 0) {
    log(`   ❌ Failed: ${failed}`, 'red');
  }

  if (failed === 0) {
    log('\n✨ Database initialization complete!', 'green');
    log('   Your PostgreSQL database is ready with pgvector support.', 'green');
  } else {
    log('\n⚠️  Some migrations failed. Please review the errors above.', 'yellow');
    process.exit(1);
  }
}

main().catch(error => {
  log(`\n💥 Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
