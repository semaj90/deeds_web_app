#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { buildVocabularyFromSamples } from './lib/vocabulary-registry.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 500);

async function main() {
  const columnsResult = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'codebase_chunk_index'
    ORDER BY ordinal_position
  `);
  const availableColumns = new Set(columnsResult.rows.map((row) => row.column_name));
  const selectColumns = ['id', 'relative_path', 'content_hash', 'content', 'summary', 'language', 'extension', 'symbol', 'kind', 'updated_at']
    .filter((column) => availableColumns.has(column));

  const { rows } = await pool.query(
    `
    SELECT ${selectColumns.join(', ')}
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
    ORDER BY id
    LIMIT $1
    `,
    [LIMIT],
  );

  const samples = rows.map((row) => `${row.relative_path ?? ''}\n${row.content ?? row.summary ?? ''}`);
  const registry = buildVocabularyFromSamples(samples, 'lexical_v1');

  console.log(JSON.stringify({
    artifact_id: 'atlas-sparse-vocabulary-v1',
    status: 'RUNTIME_PROOF_PENDING',
    repo_root: REPO_ROOT,
    sample_count: rows.length,
    vocabulary_revision: registry.vocabulary_revision,
    corpus_document_count: registry.corpus_document_count,
    token_count: registry.entries.length,
    sample_entries: registry.entries.slice(0, 50),
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
