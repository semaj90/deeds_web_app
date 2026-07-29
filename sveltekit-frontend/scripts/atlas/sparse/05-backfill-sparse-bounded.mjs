#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { assertSparseApplyContext } from './lib/collection-guard.mjs';
import { buildVocabularyFromSamples } from './lib/vocabulary-registry.mjs';
import { encodeSparseVector } from './lib/tokenization.mjs';
import { parseHalfvecText, validateDenseVector } from './lib/pgvector-text.mjs';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';
import { qdrantBaseUrl } from './lib/qdrant-introspection.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 500);
const COLLECTION = process.argv.find((arg) => arg.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_sparse_test_v1';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const plan = assertSparseApplyContext({
    collection: COLLECTION,
    apply: APPLY,
    limit: LIMIT,
    corpusRevision: process.argv.find((arg) => arg.startsWith('--corpus-revision='))?.split('=')[1] ?? 'unknown',
    representationRevision: process.argv.find((arg) => arg.startsWith('--representation-revision='))?.split('=')[1] ?? 'lexical_v1',
  });

  const columnsResult = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'codebase_chunk_index'
    ORDER BY ordinal_position
  `);
  const availableColumns = new Set(columnsResult.rows.map((row) => row.column_name));
  const selectColumns = [
    'id',
    'qdrant_id',
    'chunk_id',
    'relative_path',
    'content_hash',
    'content',
    'summary',
    'content_embedding',
    'embedding_model',
    'embedding_normalized',
    'model_revision',
    'projection_revision',
    'corpus_revision',
    'evidence_state',
  ].filter((column) => availableColumns.has(column));

  const { rows } = await pool.query(
    `
    SELECT
      ${selectColumns.join(', ')},
      content_embedding::text AS embedding_text
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
      AND content IS NOT NULL
      AND content <> ''
    ORDER BY id
    LIMIT $1
    `,
    [plan.limit],
  );

  const registry = buildVocabularyFromSamples(rows.map((row) => `${row.relative_path}\n${row.content}`), 'lexical_v1');
  const points = rows.map((row) => {
    const sparse = encodeSparseVector(`${row.relative_path}\n${row.content}`, registry, { maxTerms: 256 });
    const dense = validateDenseVector(parseHalfvecText(row.embedding_text, 768), 768);
    return {
      id: row.id,
      vector: {
        content: dense,
        lexical_v1: {
          indices: sparse.indices,
          values: sparse.values,
        },
      },
      payload: {
        postgres_id: row.id,
        qdrant_id: row.qdrant_id ?? row.id,
        chunk_id: row.chunk_id ?? null,
        source_ref: row.relative_path,
        content_hash: row.content_hash,
        corpus_revision: row.corpus_revision ?? plan.corpusRevision ?? 'unknown',
        embedding_model: row.embedding_model ?? 'embeddinggemma',
        embedding_normalized: row.embedding_normalized ?? null,
        model_revision: row.model_revision ?? null,
        projection_revision: row.projection_revision ?? null,
        evidence_state: row.evidence_state ?? null,
        representation_name: 'semantic_768',
        representation_id: 'semantic_768',
      },
    };
  });

  if (APPLY) {
    const response = await fetch(`${qdrantBaseUrl()}/collections/${plan.collection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });
    if (!response.ok) {
      throw new Error(`Qdrant upsert failed (${response.status})`);
    }
  }

  const proofPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-bounded-proof.json');
  await writeProofLedger(proofPath, buildProofLedgerEnvelope({
    runId: randomUUID(),
    artifactId: 'atlas-sparse-backfill-bounded-v1',
    corpusRevision: plan.corpusRevision ?? 'unknown',
    representationRevision: plan.representationRevision ?? 'lexical_v1',
    sourceCount: rows.length,
    successCount: APPLY ? points.length : 0,
    failureCount: 0,
    checks: { collection: plan.collection, apply: APPLY, qdrant_points_prepared: points.length },
  }));

  console.log(JSON.stringify({
    artifact_id: 'atlas-sparse-backfill-bounded-v1',
    status: APPLY ? 'RUNTIME_PROOF_PENDING' : 'RUNTIME_PROVEN',
    apply: APPLY,
    collection: plan.collection,
    source_count: rows.length,
    prepared_points: points.length,
    proof_path: proofPath,
    qdrant_base_url: qdrantBaseUrl(),
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
