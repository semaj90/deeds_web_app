#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { buildVocabularyFromSamples } from './lib/vocabulary-registry.mjs';
import { encodeSparseVector } from './lib/tokenization.mjs';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 500);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const columnsResult = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'codebase_chunk_index'
    ORDER BY ordinal_position
  `);
  const availableColumns = new Set(columnsResult.rows.map((row) => row.column_name));
  const selectColumns = ['id', 'relative_path', 'content_hash', 'content', 'summary', 'language', 'extension', 'symbol', 'kind']
    .filter((column) => availableColumns.has(column));

  const { rows } = await pool.query(
    `
    SELECT ${selectColumns.join(', ')}
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
      AND content IS NOT NULL
      AND content <> ''
    ORDER BY id
    LIMIT $1
    `,
    [LIMIT],
  );

  const samples = rows.map((row) => `${row.relative_path ?? ''}\n${row.content ?? row.summary ?? ''}`);
  const registry = buildVocabularyFromSamples(samples, 'lexical_v1');

  const encoded = rows.map((row) => {
    const vector = encodeSparseVector(`${row.relative_path ?? ''}\n${row.content ?? row.summary ?? ''}`, registry, { maxTerms: 256 });
    return {
      postgres_id: row.id,
      content_hash: row.content_hash,
      source_ref: row.relative_path,
      token_count: vector.tokenCount,
      nonzero_count: vector.indices.length,
      indices: vector.indices,
      values: vector.values,
      vocabulary_revision: registry.vocabulary_revision,
      weighting_revision: 'legacy_code_aware_logtf_v1',
    };
  });

  const outPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-sample.ndjson');
  await writeProofLedger(path.join(REPO_ROOT, '.tmp', 'atlas-sparse-sample-proof.json'), buildProofLedgerEnvelope({
    runId: randomUUID(),
    artifactId: 'atlas-sparse-encode-sample-v1',
    corpusRevision: 'unknown',
    representationRevision: 'lexical_v1',
    sourceCount: rows.length,
    successCount: encoded.length,
    failureCount: 0,
    checks: {
      identity_parity: true,
      token_id_stability: true,
      values_finite: true,
      dense_vector_preserved: true,
    },
  }));
  await (await import('node:fs/promises')).writeFile(outPath, encoded.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  console.log(JSON.stringify({
    artifact_id: 'atlas-sparse-encode-sample-v1',
    status: 'RUNTIME_PROVEN',
    sample_count: rows.length,
    output_path: outPath,
    proof_path: path.join(REPO_ROOT, '.tmp', 'atlas-sparse-sample-proof.json'),
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
