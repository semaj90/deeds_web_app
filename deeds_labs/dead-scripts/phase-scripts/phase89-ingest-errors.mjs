#!/usr/bin/env node

/**
 * Phase 89: Comprehensive Error Ingestion
 *
 * Ingests errors from multiple sources:
 * - TypeScript compiler (tsc --noEmit)
 * - Svelte Check (svelte-check)
 * - ESLint (optional)
 *
 * Stores in PostgreSQL ts_errors table for graph linking
 *
 * Usage:
 *   node scripts/phase89-ingest-errors.mjs [--tsc] [--svelte] [--all]
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal',
    user: 'user',
    password: 'pass',
  },

  reports: {
    tsc: join(projectRoot, 'reports/tsc-errors.txt'),
    svelte: join(projectRoot, 'reports/svelte-check-errors.txt'),
  },
};

// ============================================================================
// Database Client
// ============================================================================

class ErrorDB {
  constructor(config) {
    this.pool = new pg.Pool(config);
    this.stats = {
      tsc_errors: 0,
      svelte_errors: 0,
      duplicates_skipped: 0,
      total_inserted: 0,
    };
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT version()');
      client.release();
      console.log('✅ Connected to PostgreSQL');
      return true;
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      return false;
    }
  }

  async ensureSchema() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ts_errors (
        id SERIAL PRIMARY KEY,
        file_path TEXT NOT NULL,
        error_code TEXT NOT NULL,
        error_message TEXT NOT NULL,
        line_number INTEGER,
        column_number INTEGER,
        severity TEXT DEFAULT 'error',
        source TEXT DEFAULT 'tsc',
        resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(file_path, line_number, column_number, error_code)
      );

      CREATE INDEX IF NOT EXISTS idx_ts_errors_file ON ts_errors(file_path);
      CREATE INDEX IF NOT EXISTS idx_ts_errors_code ON ts_errors(error_code);
      CREATE INDEX IF NOT EXISTS idx_ts_errors_resolved ON ts_errors(resolved);
    `;

    try {
      await this.pool.query(createTableSQL);
      console.log('✅ Schema verified/created');
    } catch (error) {
      console.error('❌ Schema creation failed:', error.message);
      throw error;
    }
  }

  async clearOldErrors() {
    // Delete in order to respect foreign key constraints
    await this.pool.query('DELETE FROM error_embeddings WHERE error_id IN (SELECT id FROM ts_errors WHERE resolved = FALSE)');
    await this.pool.query('DELETE FROM fix_attempts WHERE error_id IN (SELECT id FROM ts_errors WHERE resolved = FALSE)');
    const result = await this.pool.query('DELETE FROM ts_errors WHERE resolved = FALSE');
    console.log(`🗑️  Cleared ${result.rowCount} old unresolved errors (and related embeddings/fix attempts)`);
  }

  async insertError(error) {
    const query = `
      INSERT INTO ts_errors (file_path, error_code, error_message, line_number, column_number, severity, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (file_path, line_number, column_number, error_code) DO NOTHING
      RETURNING id
    `;

    try {
      const result = await this.pool.query(query, [
        error.file_path,
        error.error_code,
        error.error_message,
        error.line_number,
        error.column_number,
        error.severity,
        error.source,
      ]);

      if (result.rowCount > 0) {
        this.stats.total_inserted++;
        return result.rows[0].id;
      } else {
        this.stats.duplicates_skipped++;
        return null;
      }
    } catch (err) {
      console.error('Error inserting:', error.file_path, err.message);
      return null;
    }
  }

  async close() {
    await this.pool.end();
  }

  getStats() {
    return this.stats;
  }
}

// ============================================================================
// Error Parsers
// ============================================================================

function parseTscErrors(filePath) {
  console.log(`\n📄 Parsing TypeScript errors from ${filePath}...`);

  if (!existsSync(filePath)) {
    console.log('⚠️  File not found, running tsc...');
    try {
      execSync('npx tsc --noEmit --pretty false', {
        cwd: projectRoot,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (error) {
      // tsc exits with error code when there are errors, which is expected
      writeFileSync(filePath, error.stdout || '');
    }
  }

  const content = readFileSync(filePath, 'utf-8');
  // Handle both CRLF and LF line endings
  const lines = content.split(/\r?\n/);
  const errors = [];

  // Parse format: path/to/file.ts(123,45): error TS1234: Message here
  // Can be relative path or absolute path with drive letter
  // Note: We need to escape the parenthesis in the regex
  const errorRegex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.+)$/;

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    const match = line.match(errorRegex);
    if (match) {
      const [, filePath, lineNum, colNum, severity, code, message] = match;

      // Normalize path - remove drive letter if present, convert backslashes
      let normalizedPath = filePath;
      if (normalizedPath.match(/^[A-Z]:/i)) {
        // Has drive letter - make relative to project root
        normalizedPath = relative(projectRoot, filePath);
      }
      normalizedPath = normalizedPath.replace(/\\/g, '/');

      errors.push({
        file_path: normalizedPath,
        line_number: parseInt(lineNum, 10),
        column_number: parseInt(colNum, 10),
        error_code: code,
        error_message: message.trim(),
        severity: severity === 'warning' ? 'warning' : 'error',
        source: 'tsc',
      });
    } else {
      // Debug: print lines that don't match if they look like errors
      if (line.includes('error TS')) {
        console.log('Failed to match line:', JSON.stringify(line));
      }
    }
  }  console.log(`   Found ${errors.length} TypeScript errors`);
  return errors;
}function parseSvelteCheckErrors(filePath) {
  console.log(`\n📄 Parsing Svelte errors from ${filePath}...`);

  if (!existsSync(filePath)) {
    console.log('⚠️  File not found, running svelte-check...');
    try {
      const output = execSync('npx svelte-check --output human', {
        cwd: projectRoot,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      writeFileSync(filePath, output);
    } catch (error) {
      // svelte-check exits with error code when there are errors
      writeFileSync(filePath, error.stdout || '');
    }
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const errors = [];

  // Parse format: src/file.svelte:123:45 Error: Message here (ts-error-code)
  const errorRegex = /^(.+?):(\d+):(\d+)\s+(Error|Warning|Hint):\s*(.+?)(?:\s+\(([a-z0-9-]+)\))?$/i;

  for (const line of lines) {
    const match = line.match(errorRegex);
    if (match) {
      const [, filePath, lineNum, colNum, severity, message, code] = match;

      errors.push({
        file_path: relative(projectRoot, filePath).replace(/\\/g, '/'),
        line_number: parseInt(lineNum, 10),
        column_number: parseInt(colNum, 10),
        error_code: code || 'SVELTE',
        error_message: message.trim(),
        severity: severity.toLowerCase() === 'error' ? 'error' : 'warning',
        source: 'svelte-check',
      });
    }
  }

  console.log(`   Found ${errors.length} Svelte errors`);
  return errors;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    tsc: args.includes('--tsc') || args.includes('--all'),
    svelte: args.includes('--svelte') || args.includes('--all'),
    clear: args.includes('--clear'),
  };

  // Default to all if no flags
  if (!flags.tsc && !flags.svelte) {
    flags.tsc = true;
    flags.svelte = true;
  }

  console.log('🚀 Phase 89: Error Ingestion\n');
  console.log('📋 Configuration:');
  console.log(`   Database: postgresql://${CONFIG.postgres.user}@${CONFIG.postgres.host}:${CONFIG.postgres.port}/${CONFIG.postgres.database}`);
  console.log(`   TypeScript: ${flags.tsc ? 'YES' : 'NO'}`);
  console.log(`   Svelte: ${flags.svelte ? 'YES' : 'NO'}`);
  console.log(`   Clear old: ${flags.clear ? 'YES' : 'NO'}\n`);

  const db = new ErrorDB(CONFIG.postgres);

  if (!(await db.connect())) {
    console.error('\n❌ Failed to connect to database. Exiting.');
    process.exit(1);
  }

  try {
    await db.ensureSchema();

    if (flags.clear) {
      await db.clearOldErrors();
    }

    let allErrors = [];

    // Parse TypeScript errors
    if (flags.tsc) {
      const tscErrors = parseTscErrors(CONFIG.reports.tsc);
      allErrors.push(...tscErrors);
      db.stats.tsc_errors = tscErrors.length;
    }

    // Parse Svelte errors
    if (flags.svelte) {
      const svelteErrors = parseSvelteCheckErrors(CONFIG.reports.svelte);
      allErrors.push(...svelteErrors);
      db.stats.svelte_errors = svelteErrors.length;
    }

    // Insert all errors
    console.log(`\n💾 Inserting ${allErrors.length} errors into database...`);

    let inserted = 0;
    for (const error of allErrors) {
      const id = await db.insertError(error);
      if (id) {
        inserted++;
        if (inserted % 100 === 0) {
          process.stdout.write(`\r   Progress: ${inserted}/${allErrors.length} (${Math.round(inserted/allErrors.length*100)}%)`);
        }
      }
    }
    console.log(`\n   Completed!`);

    // Show statistics
    const stats = db.getStats();
    console.log('\n📊 Ingestion Statistics:');
    console.log(`   TypeScript errors: ${stats.tsc_errors}`);
    console.log(`   Svelte errors: ${stats.svelte_errors}`);
    console.log(`   Total errors found: ${allErrors.length}`);
    console.log(`   Inserted (new): ${stats.total_inserted}`);
    console.log(`   Skipped (duplicates): ${stats.duplicates_skipped}`);

    // Verify database
    const countResult = await db.pool.query('SELECT COUNT(*) FROM ts_errors WHERE resolved = FALSE');
    console.log(`\n✅ Database now has ${countResult.rows[0].count} unresolved errors`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
