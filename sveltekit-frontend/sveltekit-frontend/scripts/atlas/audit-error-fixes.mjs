#!/usr/bin/env node
/**
 * P1.1: Error Audit Script
 * Read-only audit of error logs. Generates findings for P1.2 (planning).
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const VERBOSE = process.argv.includes('--verbose');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'reports');

function log(msg, level = 'info') {
  const ts = new Date().toISOString();
  const prefix = { info: '✓', warn: '⚠', error: '✗', debug: '◆' }[level] || '•';
  if (level !== 'debug' || VERBOSE) console.log([\] \ \);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  log('═══════════════════════════════════════════════════════════════');
  log('       P1.1: ERROR AUDIT');
  log('═══════════════════════════════════════════════════════════════\n');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log('DATABASE_URL env var not set', 'error');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const client = await pool.connect();
    const tableCheck = await client.query(\
      SELECT EXISTS (SELECT 1 FROM information_schema.tables 
       WHERE table_name = 'error_logs' AND table_schema = 'public')
    \);
    client.release();

    if (!tableCheck.rows[0].exists) {
      log('error_logs table does not exist', 'warn');
      console.log('\\n═══════════════════════════════════════════════════════════════');
      console.log('Status: Table not found (creation is out of scope)');
      console.log('Next Steps:');
      console.log('  • Create error_logs table via migration');
      console.log('  • Wire error collection into API routes');
      console.log('  • Run audit again after seeding errors\\n');
      process.exit(0);
    }

    log('Connected to error_logs table');
    const countRes = await pool.query('SELECT COUNT(*) as count FROM error_logs');
    const totalErrors = parseInt(countRes.rows[0].count, 10);

    console.log('\\n═══════════════════════════════════════════════════════════════');
    console.log('                      AUDIT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(\\nTotal Errors:     \);
    
    if (totalErrors === 0) {
      console.log('Status: Table exists but is empty');
      console.log('\\nNext Steps:');
      console.log('  • Verify error collection is wired into API routes');
      console.log('  • Generate some test errors to populate the table\\n');
    } else {
      console.log('Status: \ errors recorded');
      console.log('\\nNext Steps:');
      console.log('  • Review the error audit findings');
      console.log('  • Run P1.2 (plan) to generate fix strategy\\n');
    }
    console.log('═══════════════════════════════════════════════════════════════\\n');

  } catch (err) {
    log(Fatal error: \, 'error');
    if (VERBOSE) console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
