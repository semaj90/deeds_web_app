#!/usr/bin/env node
/**
 * Live contract check for api_audit_log.
 *
 * Ensures the canonical contract matches the current writer/schema:
 *   - path exists
 *   - endpoint does not exist
 *   - request_body_size and error_message are present
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434', 10),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
  database: process.env.POSTGRES_DB || 'legal_ai_db',
});

async function main() {
  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'api_audit_log'
    `
  );

  const columns = new Set(rows.map((row) => String(row.column_name)));
  const required = ['path', 'request_body_size', 'error_message'];
  const forbidden = ['endpoint'];
  const missing = required.filter((col) => !columns.has(col));
  const unexpected = forbidden.filter((col) => columns.has(col));

  if (missing.length || unexpected.length) {
    console.error('[audit-api-audit-log-contract] FAIL');
    if (missing.length) console.error(`  Missing: ${missing.join(', ')}`);
    if (unexpected.length) console.error(`  Unexpected: ${unexpected.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('[audit-api-audit-log-contract] PASS');
  console.log(`  Columns: ${Array.from(columns).sort().join(', ')}`);
}

main()
  .catch((err) => {
    console.error('[audit-api-audit-log-contract] ERROR:', err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
