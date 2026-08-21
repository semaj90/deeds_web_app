#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { assertSafeCollection } from './lib/collection-guard.mjs';
import { buildVocabularyFromSamples } from './lib/vocabulary-registry.mjs';
import { encodeSparseVector } from './lib/tokenization.mjs';
import { queryCollection, qdrantBaseUrl } from './lib/qdrant-introspection.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const collection = assertSafeCollection(process.argv.find((arg) => arg.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_sparse_test_v1');
const queryText = process.argv.slice(2).find((arg) => arg.startsWith('--query='))?.split('=')[1] ?? 'retrieveAllCandidates';

async function main() {
  const { rows } = await pool.query(
    `
    SELECT id, relative_path, content_hash, content
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
      AND content IS NOT NULL
    ORDER BY id
    LIMIT 256
    `,
  );

  const registry = buildVocabularyFromSamples(rows.map((row) => `${row.relative_path}\n${row.content}`), 'lexical_v1');
  const sparse = encodeSparseVector(queryText, registry, { maxTerms: 256 });
  const response = await queryCollection(collection, {
    query: {
      indices: sparse.indices,
      values: sparse.values,
    },
    using: 'lexical_v1',
    with_payload: true,
    limit: 10,
  });

  const points = response?.result?.points ?? [];
  const summary = points.map((point) => ({
    id: point.id,
    score: point.score ?? null,
    source_ref: point.payload?.source_ref ?? null,
    content_hash: point.payload?.content_hash ?? null,
    representation_id: point.payload?.representation_id ?? null,
  }));
  const payload = {
    artifact_id: 'atlas-sparse-self-query-v1',
    status: 'QUERY_EXECUTED_QUALITY_NOT_PROVEN',
    qdrant_base_url: qdrantBaseUrl(),
    collection,
    query_text: queryText,
    sample_count: rows.length,
    sparse_terms: sparse.indices.length,
    result_count: summary.length,
    results: summary,
    quality: {
      recall_at_k: null,
      mrr: null,
      ground_truth: 'NOT_SUPPLIED',
    },
    writes: { postgres: false, qdrant: false, valkey: false },
  };
  const proofPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-self-query-proof.json');
  await mkdir(path.dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ ...payload, proof_path: proofPath }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
