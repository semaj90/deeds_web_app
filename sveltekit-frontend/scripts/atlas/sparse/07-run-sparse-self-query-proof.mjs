#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
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

  console.log(JSON.stringify({
    artifact_id: 'atlas-sparse-self-query-v1',
    status: 'RUNTIME_PROVEN',
    qdrant_base_url: qdrantBaseUrl(),
    collection,
    query_text: queryText,
    sample_count: rows.length,
    sparse_terms: sparse.indices.length,
    response: response?.result ?? response,
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
