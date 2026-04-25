#!/usr/bin/env node
/**
 * Phase 79: Database Setup & Verification
 *
 * Verifies database schema is correct before running direct patch generation
 * Creates necessary tables and columns
 */

import path from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sql = postgres(process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  header: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  check: (name, status) => {
    if (status) {
      console.log(`${colors.green}✓${colors.reset} ${name}`);
    } else {
      console.log(`${colors.red}✗${colors.reset} ${name}`);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: CREATE TABLES IF NOT EXISTS
// ═══════════════════════════════════════════════════════════════════════════

async function createTables() {
  log.header('STEP 1: Create/Verify Tables');

  try {
    // Create error_suggestions table
    await sql`
      CREATE TABLE IF NOT EXISTS error_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        error_code TEXT NOT NULL,
        suggestion_text TEXT,
        suggestion_type TEXT DEFAULT 'phase78',
        confidence_score FLOAT DEFAULT 0,
        validation_score FLOAT DEFAULT 0,
        status TEXT DEFAULT 'pending',
        risk_level TEXT DEFAULT 'medium',
        applied BOOLEAN DEFAULT false,
        applied_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB,

        CONSTRAINT unique_error_suggestion UNIQUE (error_code),
        CONSTRAINT valid_status CHECK (status IN ('pending', 'applied', 'rejected', 'failed')),
        CONSTRAINT valid_risk CHECK (risk_level IN ('low', 'medium', 'high')),
        CONSTRAINT valid_type CHECK (suggestion_type IN ('phase78', 'direct_generation', 'manual'))
      )
    `;
    log.success('error_suggestions table created/verified');

    // Create knowledge_base table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chunk_type TEXT,
        content TEXT,
        metadata JSONB,
        similarity_score FLOAT DEFAULT 0.5,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    log.success('knowledge_base table created/verified');

    // Create error tracking table
    await sql`
      CREATE TABLE IF NOT EXISTS error_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        error_code TEXT NOT NULL,
        total_occurrences INT DEFAULT 0,
        fixed_count INT DEFAULT 0,
        blocked_count INT DEFAULT 0,
        confidence_avg FLOAT DEFAULT 0,
        last_attempt TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        CONSTRAINT unique_error_metric UNIQUE (error_code)
      )
    `;
    log.success('error_metrics table created/verified');

  } catch (error) {
    log.error(`Table creation failed: ${error.message}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: VERIFY COLUMNS
// ═══════════════════════════════════════════════════════════════════════════

async function verifyColumns() {
  log.header('STEP 2: Verify Required Columns');

  try {
    // Check error_suggestions columns
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'error_suggestions'
      ORDER BY ordinal_position
    `;

    const requiredColumns = [
      'id', 'error_code', 'suggestion_text', 'suggestion_type',
      'confidence_score', 'validation_score', 'status', 'risk_level',
      'applied', 'created_at', 'metadata'
    ];

    const foundColumns = columns.map(c => c.column_name);

    for (const col of requiredColumns) {
      log.check(col, foundColumns.includes(col));
    }

    // Check knowledge_base columns
    const kbColumns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'knowledge_base'
    `;

    const kbRequired = ['chunk_id', 'chunk_type', 'content', 'metadata', 'similarity_score'];
    const kbFound = kbColumns.map(c => c.column_name);

    log.info('\nknowledge_base columns:');
    for (const col of kbRequired) {
      log.check(col, kbFound.includes(col));
    }

  } catch (error) {
    log.error(`Column verification failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: ADD MISSING COLUMNS
// ═══════════════════════════════════════════════════════════════════════════

async function addMissingColumns() {
  log.header('STEP 3: Add Missing Columns');

  const columnsToAdd = [
    {
      name: 'applied_at',
      sql: 'ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP'
    },
    {
      name: 'validation_score',
      sql: 'ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS validation_score FLOAT DEFAULT 0'
    },
    {
      name: 'updated_at',
      sql: 'ALTER TABLE error_suggestions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()'
    }
  ];

  for (const col of columnsToAdd) {
    try {
      await sql.unsafe(col.sql);
      log.success(`Added column: ${col.name}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        log.info(`Column already exists: ${col.name}`);
      } else {
        log.warn(`Failed to add ${col.name}: ${error.message}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: CREATE INDEXES
// ═══════════════════════════════════════════════════════════════════════════

async function createIndexes() {
  log.header('STEP 4: Create Indexes');

  const indexes = [
    {
      name: 'idx_error_suggestions_status',
      sql: 'CREATE INDEX IF NOT EXISTS idx_error_suggestions_status ON error_suggestions(status)'
    },
    {
      name: 'idx_error_suggestions_confidence',
      sql: 'CREATE INDEX IF NOT EXISTS idx_error_suggestions_confidence ON error_suggestions(confidence_score DESC)'
    },
    {
      name: 'idx_error_suggestions_type',
      sql: 'CREATE INDEX IF NOT EXISTS idx_error_suggestions_type ON error_suggestions(suggestion_type)'
    },
    {
      name: 'idx_knowledge_base_type',
      sql: 'CREATE INDEX IF NOT EXISTS idx_knowledge_base_type ON knowledge_base(chunk_type)'
    },
    {
      name: 'idx_knowledge_base_similarity',
      sql: 'CREATE INDEX IF NOT EXISTS idx_knowledge_base_similarity ON knowledge_base(similarity_score DESC)'
    }
  ];

  for (const idx of indexes) {
    try {
      await sql.unsafe(idx.sql);
      log.success(`Created index: ${idx.name}`);
    } catch (error) {
      log.warn(`Index creation skipped: ${idx.name}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: VERIFY DATA
// ═══════════════════════════════════════════════════════════════════════════

async function verifyData() {
  log.header('STEP 5: Verify Data Status');

  try {
    // Count records in each table
    const errorSuggestions = await sql`SELECT COUNT(*) as count FROM error_suggestions`;
    const knowledgeBase = await sql`SELECT COUNT(*) as count FROM knowledge_base`;
    const compileErrors = await sql`SELECT COUNT(*) as count FROM compile_errors`;

    log.info(`Database contents:`);
    console.log(`  • error_suggestions: ${errorSuggestions[0].count} records`);
    console.log(`  • knowledge_base: ${knowledgeBase[0].count} records`);
    console.log(`  • compile_errors: ${compileErrors[0].count} records`);

    // Check for bad Phase 78 suggestions
    const badSuggestions = await sql`
      SELECT COUNT(*) as count
      FROM error_suggestions
      WHERE (suggestion_text LIKE 'The error%'
          OR suggestion_text LIKE 'This file%'
          OR suggestion_text LIKE 'The following%')
        AND suggestion_type = 'phase78'
    `;

    if (badSuggestions[0].count > 0) {
      log.warn(`Found ${badSuggestions[0].count} potentially bad Phase 78 suggestions`);
      log.info(`These will be skipped during direct patch generation`);
    } else {
      log.success('No bad Phase 78 suggestions detected');
    }

    // Status breakdown
    const statusBreakdown = await sql`
      SELECT status, COUNT(*) as count
      FROM error_suggestions
      GROUP BY status
    `;

    if (statusBreakdown.length > 0) {
      log.info('\nSuggestion status breakdown:');
      for (const row of statusBreakdown) {
        console.log(`  • ${row.status}: ${row.count} records`);
      }
    }

  } catch (error) {
    log.warn(`Data verification incomplete: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: CLEANUP (Optional)
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupBadSuggestions(confirmDelete = false) {
  log.header('STEP 6: Cleanup Bad Phase 78 Suggestions (Optional)');

  try {
    // Find bad suggestions
    const badSuggestions = await sql`
      SELECT error_code, suggestion_text
      FROM error_suggestions
      WHERE (suggestion_text LIKE 'The error%'
          OR suggestion_text LIKE 'This file%'
          OR suggestion_text LIKE 'This type%')
        AND suggestion_type = 'phase78'
      LIMIT 5
    `;

    if (badSuggestions.length > 0) {
      log.warn(`Found ${badSuggestions.length} bad suggestions (sample):`);
      for (const s of badSuggestions.slice(0, 3)) {
        console.log(`  • ${s.error_code}: "${s.suggestion_text.substring(0, 60)}..."`);
      }

      if (confirmDelete) {
        log.info('\nDeleting bad suggestions...');
        const result = await sql`
          DELETE FROM error_suggestions
          WHERE (suggestion_text LIKE 'The error%'
              OR suggestion_text LIKE 'This file%'
              OR suggestion_text LIKE 'This type%')
            AND suggestion_type = 'phase78'
        `;
        log.success(`Deleted ${result.count} bad suggestions`);
      } else {
        log.info('\nRun with --cleanup-bad to delete these suggestions');
      }
    } else {
      log.success('No bad suggestions found');
    }
  } catch (error) {
    log.warn(`Cleanup failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  log.header('Phase 79: Database Setup & Verification');

  console.log(`${colors.blue}Checking database connection...${colors.reset}`);

  try {
    await sql`SELECT 1 as check`;
    log.success('Database connection successful');
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    console.log(`\n${colors.yellow}Make sure PostgreSQL is running:${colors.reset}`);
    console.log(`  • Check: Get-Service PostgreSQL96`);
    console.log(`  • Start: Start-Service PostgreSQL96`);
    process.exit(1);
  }

  try {
    // Run all setup steps
    await createTables();
    await verifyColumns();
    await addMissingColumns();
    await createIndexes();
    await verifyData();

    // Cleanup if requested
    const args = process.argv.slice(2);
    if (args.includes('--cleanup-bad')) {
      await cleanupBadSuggestions(true);
    } else {
      await cleanupBadSuggestions(false);
    }

    log.header('Setup Complete ✓');
    log.success('Database is ready for Phase 79 direct patch generation');
    log.info('\nNext step: Run direct patch generation');
    console.log(`  ${colors.cyan}node scripts/phase79-direct-patch-generation.mjs${colors.reset}`);

  } catch (error) {
    log.error(`Setup failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { addMissingColumns, createIndexes, createTables, verifyColumns };

