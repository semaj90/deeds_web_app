#!/usr/bin/env node
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirm = args.includes('--confirm-atlas-packets-lineage-columns-v1');
if (apply && !confirm) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const columns = await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='atlas_packets' AND column_name = ANY($1::text[])`, [[
    'workspace_revision_key', 'lineage_binding_checksum', 'lineage_producer_revision']]);
  const present = new Set(columns.rows.map((r) => r.column_name));
  const missing = ['workspace_revision_key', 'lineage_binding_checksum', 'lineage_producer_revision'].filter((x) => !present.has(x));
  if (apply && missing.length) {
    await client.query(`ALTER TABLE atlas_packets
      ADD COLUMN IF NOT EXISTS workspace_revision_key text,
      ADD COLUMN IF NOT EXISTS lineage_binding_checksum text,
      ADD COLUMN IF NOT EXISTS lineage_producer_revision text`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_atlas_packets_workspace_revision_key_source
      ON atlas_packets (workspace_revision_key, source_ref)
      WHERE workspace_revision_key IS NOT NULL AND source_ref IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_atlas_packets_lineage_binding_checksum
      ON atlas_packets (lineage_binding_checksum)
      WHERE lineage_binding_checksum IS NOT NULL`);
  }
  const after = await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='atlas_packets' AND column_name = ANY($1::text[])`, [[
    'workspace_revision_key', 'lineage_binding_checksum', 'lineage_producer_revision']]);
  const indexes = await client.query(`SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='atlas_packets' AND indexname = ANY($1::text[])`, [[
    'idx_atlas_packets_workspace_revision_key_source', 'idx_atlas_packets_lineage_binding_checksum']]);
  if (apply) await client.query('COMMIT');
  else await client.query('ROLLBACK');
  console.log(JSON.stringify({ status: missing.length ? (apply ? 'SCHEMA_APPLY_READBACK_PROVEN' : 'SCHEMA_ALIGNMENT_REQUIRED') : 'SCHEMA_ALREADY_ALIGNED', columns: after.rows.map((r) => r.column_name), indexes: indexes.rows.map((r) => r.indexname), writesPerformed: apply && missing.length }, null, 2));
} finally { client.release(); await pool.end(); }
