#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TABLE = 'codebase_chunk_index';
const CANDIDATE_TEXT_COLUMNS = ['content', 'chunk_text', 'body', 'text'];

async function main() {
  const columnResult = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
     ORDER BY ordinal_position`,
    [TABLE],
  );
  const columns = columnResult.rows.map((row) => row.column_name);
  const textColumn = CANDIDATE_TEXT_COLUMNS.find((column) => columns.includes(column)) ?? null;
  if (!textColumn) {
    throw new Error(`No source text column found on ${TABLE}`);
  }

  const report = await pool.query(`
    SELECT
      COUNT(*) AS eligible_rows,
      COUNT(*) FILTER (WHERE ${textColumn} IS NOT NULL AND ${textColumn} <> '') AS rows_with_text,
      COUNT(*) FILTER (WHERE content_hash IS NOT NULL) AS rows_with_content_hash,
      COUNT(*) FILTER (WHERE content_embedding IS NOT NULL) AS rows_with_dense_embedding,
      COUNT(*) FILTER (WHERE COALESCE(${textColumn}, '') = '') AS empty_text_rows,
      COUNT(*) FILTER (WHERE content_hash IS NULL) AS missing_content_hash
    FROM ${TABLE}
  `);

  const payload = {
    artifact_id: 'atlas-sparse-source-audit-v1',
    status: 'RUNTIME_PROOF_PENDING',
    table: TABLE,
    text_column: textColumn,
    columns,
    summary: report.rows[0],
    repo_root: REPO_ROOT,
  };

  console.log(JSON.stringify(payload, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
