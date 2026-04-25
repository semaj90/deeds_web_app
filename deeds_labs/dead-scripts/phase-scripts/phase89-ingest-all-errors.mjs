#!/usr/bin/env node
/**
 * Phase 89: Comprehensive Error Ingestion
 * Ingests ALL errors from:
 * 1. TypeScript compiler (tsc --noEmit)
 * 2. Svelte Check (svelte-check)
 * 3. Existing ts_errors table
 *
 * Stores in legal_ai_db.ts_errors for Phase 89 error map analysis
 */

import { exec } from 'child_process';
import { readFileSync } from 'fs';
import pg from 'pg';
import { promisify } from 'util';

const execAsync = promisify(exec);
const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  }
};

let db;

async function main() {
  console.log('📊 Phase 89: Comprehensive Error Ingestion\n');

  // Connect to database
  db = new Pool(CONFIG.postgres);
  console.log('✅ Connected to Postgres');

  // Ensure ts_errors table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS ts_errors (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      file TEXT NOT NULL,
      line INTEGER,
      col INTEGER,
      code TEXT,
      message TEXT,
      severity TEXT DEFAULT 'error',
      fixed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(source, file, line, col, code)
    )
  `);
  console.log('✅ ts_errors table ready\n');

  let totalIngested = 0;

  // 1. Ingest TypeScript errors
  console.log('🔍 Reading TypeScript errors from reports/tsc-errors.txt...');

  const tscOutput = readFileSync('reports/tsc-errors.txt', 'utf-8');
  const tscErrors = parseTscErrors(tscOutput);
  console.log(`  Found ${tscErrors.length} TSC errors`);

  for (const error of tscErrors) {
    await db.query(`
      INSERT INTO ts_errors (source, file, line, col, code, message)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source, file, line, col, code) DO UPDATE SET
        message = $6,
        fixed = FALSE
    `, ['tsc', error.file, error.line, error.col, error.code, error.message]);
  }
  totalIngested += tscErrors.length;
  console.log(`  ✅ Ingested ${tscErrors.length} TSC errors\n`);

  // 2. Ingest Svelte Check errors
  console.log('🔍 Reading svelte-check errors from reports/svelte-check-errors.json...');

  const svelteOutput = readFileSync('reports/svelte-check-errors.json', 'utf-8');
  const svelteErrors = parseSvelteCheckErrors(svelteOutput);
  console.log(`  Found ${svelteErrors.length} svelte-check errors`);

  for (const error of svelteErrors) {
    await db.query(`
      INSERT INTO ts_errors (source, file, line, col, code, message)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source, file, line, col, code) DO UPDATE SET
        message = $6,
        fixed = FALSE
    `, ['svelte-check', error.file, error.line, error.col, error.code, error.message]);
  }
  totalIngested += svelteErrors.length;
  console.log(`  ✅ Ingested ${svelteErrors.length} svelte-check errors\n`);

  // 3. Statistics
  const stats = await db.query(`
    SELECT
      source,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE fixed = FALSE) as unfixed
    FROM ts_errors
    GROUP BY source
    ORDER BY total DESC
  `);

  console.log('📊 Error Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const row of stats.rows) {
    console.log(`  ${row.source.padEnd(15)} ${row.total.toLocaleString().padStart(8)} total | ${row.unfixed.toLocaleString().padStart(8)} unfixed`);
  }

  const totalErrors = await db.query('SELECT COUNT(*) as total FROM ts_errors');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  TOTAL          ${totalErrors.rows[0].total.toLocaleString().padStart(8)} errors`);

  await db.end();
  console.log('\n✅ Error ingestion complete!');
  console.log('\nNext: node scripts/phase89-error-map-builder.mjs');
}

function parseTscErrors(output) {
  const errors = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Format: src/lib/file.ts(123,45): error TS1234: Message
    // Also handles: .svelte-kit/types/file.ts(123,45): error TS1234: Message
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
    if (match) {
      const file = match[1].replace(/\\/g, '/').trim();

      errors.push({
        file: file,
        line: parseInt(match[2]),
        col: parseInt(match[3]),
        code: match[4],
        message: match[5].trim()
      });
    }
  }

  return errors;
}

function parseSvelteCheckErrors(output) {
  const errors = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Format: 1766948803482 ERROR "src\lib\file.ts" 1514:2 "Message"
    const match = line.match(/^\d+\s+ERROR\s+"([^"]+)"\s+(\d+):(\d+)\s+"(.+)"$/);
    if (match) {
      errors.push({
        file: match[1].replace(/\\/g, '/'),
        line: parseInt(match[2]),
        col: parseInt(match[3]),
        code: 'SVELTE',
        message: match[4]
      });
    }
  }

  return errors;
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
