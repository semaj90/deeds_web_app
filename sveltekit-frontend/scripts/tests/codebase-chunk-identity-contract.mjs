#!/usr/bin/env node
/**
 * Live identity contract for codebase_chunk_index.
 *
 * Verifies:
 *   - id is UUID (canonical row identity)
 *   - qdrant_id is text/varchar (semantic mirror identity)
 *   - joins should use qdrant_id, not id
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
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'codebase_chunk_index'
        AND column_name IN ('id', 'qdrant_id', 'relative_path')
      ORDER BY column_name
    `
  );

  const byName = new Map(rows.map((row) => [row.column_name, row]));
  const failures = [];

  const idCol = byName.get('id');
  if (!idCol || idCol.data_type !== 'uuid') {
    failures.push(`id should be uuid, got ${idCol ? `${idCol.data_type}/${idCol.udt_name}` : 'missing'}`);
  }

  const qdrantCol = byName.get('qdrant_id');
  if (!qdrantCol || qdrantCol.data_type !== 'character varying') {
    failures.push(`qdrant_id should be varchar, got ${qdrantCol ? `${qdrantCol.data_type}/${qdrantCol.udt_name}` : 'missing'}`);
  }

  const sample = await pool.query(
    `
      SELECT qdrant_id, relative_path
      FROM codebase_chunk_index
      WHERE qdrant_id IS NOT NULL
        AND qdrant_id <> ''
      LIMIT 5
    `
  );

  if (sample.rows.length === 0) {
    failures.push('no qdrant_id rows available to validate join contract');
  }

  if (failures.length > 0) {
    console.error('[codebase-chunk-identity-contract] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('[codebase-chunk-identity-contract] PASS');
  console.log(`  Sample qdrant_id: ${sample.rows[0].qdrant_id}`);
}

main()
  .catch((err) => {
    console.error('[codebase-chunk-identity-contract] ERROR:', err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
