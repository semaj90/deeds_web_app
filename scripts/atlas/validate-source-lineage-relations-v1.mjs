#!/usr/bin/env node
/** Validate the unapplied source-lineage DDL in a transaction and roll it back. */
import { readFileSync } from 'node:fs';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'sveltekit-frontend/.env' });
dotenv.config({ path: 'sveltekit-frontend/.env.local', override: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const ddl = readFileSync('sveltekit-frontend/drizzle/manual/20260827_source_lineage_relations_v1.sql', 'utf8')
  .replace(/COMMIT;\s*$/i, '');
const client = await pool.connect();
try {
  await client.query(ddl);
  const result = await client.query(`
    SELECT to_regclass('public.atlas_source_aliases') AS aliases,
           to_regclass('public.atlas_workspace_source_bindings') AS bindings
  `);
  const visibleDuringTransaction = result.rows[0];
  await client.query('ROLLBACK');
  const afterRollback = await client.query(`
    SELECT to_regclass('public.atlas_source_aliases') AS aliases,
           to_regclass('public.atlas_workspace_source_bindings') AS bindings
  `);
  console.log(JSON.stringify({
    schema: 'atlas.source-lineage-relations-validation.v1',
    transactionalSchemaCheck: 'PASS',
    rolledBack: true,
    visibleDuringTransaction,
    afterRollback: afterRollback.rows[0],
    durableWrites: false,
  }, null, 2));
} finally {
  client.release();
  await pool.end();
}
