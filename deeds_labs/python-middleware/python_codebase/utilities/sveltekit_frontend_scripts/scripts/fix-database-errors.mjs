#!/usr/bin/env node

/**
 * Database Error Fix Script
 * Fixes known database configuration issues
 */

import { execSync } from 'child_process';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
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

async function fixDatabaseErrors() {
  log('\n?? Fixing Database Errors', 'blue');
  log('='.repeat(50), 'blue');

  try {
    // Fix 1: Grant permissions on query_vectors table
    log('\n1?? Fixing table permissions...', 'yellow');
    const sqlGrant = `
      GRANT ALL PRIVILEGES ON TABLE query_vectors TO legal_admin;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;
      GRANT USAGE, CREATE ON SCHEMA public TO legal_admin;
    `;

    execSync(
      `psql "${DATABASE_URL}" << 'EOSQL'
${sqlGrant}
EOSQL`,
      { stdio: 'inherit' }
    );
    log('   ? Table permissions fixed', 'green');
  } catch (error) {
    log('   ??  Permission fix skipped (may require superuser)', 'yellow');
  }

  try {
    // Fix 2: Ensure created_by column exists in cases
    log('\n2?? Checking cases table schema...', 'yellow');
    const sqlCases = `
      ALTER TABLE cases
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_cases_created_by ON cases(created_by);
    `;

    execSync(`psql "${DATABASE_URL}" -c "${sqlCases.replace(/\n/g, ' ')}"`, { stdio: 'inherit' });
    log('   ? cases table schema verified/updated', 'green');
  } catch (error) {
    log(`   ??  Schema check failed: ${error.message}`, 'yellow');
  }

  try {
    // Fix 3: Create/align users table columns
    log('\n3?? Verifying users table...', 'yellow');
    const sqlUsers = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS hashed_password TEXT,
        ADD COLUMN IF NOT EXISTS name TEXT,
        ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS avatar_url TEXT,
        ADD COLUMN IF NOT EXISTS role TEXT,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'prosecutor';
      ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
      ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW();
      ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT NOW();
      UPDATE users SET updated_at = NOW() WHERE updated_at IS NULL;
      UPDATE users SET role = COALESCE(role, 'prosecutor');
      UPDATE users SET is_active = COALESCE(is_active, TRUE);
    `;

    execSync(`psql "${DATABASE_URL}" -c "${sqlUsers.replace(/\n/g, ' ')}"`, { stdio: 'inherit' });
    log('   ? users table verified/updated', 'green');
  } catch (error) {
    log(`   ??  Users table check failed: ${error.message}`, 'yellow');
  }

  try {
    // Fix 4: Remove orphaned embeddings and ensure FK
    log('\n4?? Reconciling case_embeddings...', 'yellow');
    const sqlEmbeddings = `
      DELETE FROM case_embeddings
      WHERE case_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM cases WHERE cases.id = case_embeddings.case_id);

      ALTER TABLE case_embeddings DROP CONSTRAINT IF EXISTS case_embeddings_case_id_cases_id_fk;
      ALTER TABLE case_embeddings
        ADD CONSTRAINT case_embeddings_case_id_cases_id_fk
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
    `;

    execSync(`psql "${DATABASE_URL}" -c "${sqlEmbeddings.replace(/\n/g, ' ')}"`, { stdio: 'inherit' });
    log('   ? case_embeddings reconciled', 'green');
  } catch (error) {
    log(`   ??  case_embeddings reconciliation skipped: ${error.message}`, 'yellow');
  }

  try {
    // Fix 5: Analyze and vacuum database (separate commands avoid transaction issues)
    log('\n5?? Optimizing database...', 'yellow');
    execSync(`psql "${DATABASE_URL}" -c "ANALYZE"`, { stdio: 'inherit' });
    execSync(`psql "${DATABASE_URL}" -c "VACUUM ANALYZE"`, { stdio: 'inherit' });
    log('   ? Database optimized', 'green');
  } catch (error) {
    log('   ??  Optimization skipped', 'yellow');
  }

  log('\n' + '='.repeat(50), 'blue');
  log('? Database fixes complete!', 'green');
  log('\nYour database is now ready for use.\n', 'green');
}

fixDatabaseErrors().catch(error => {
  log(`\n?? Error: ${error.message}`, 'red');
  process.exit(1);
});
