#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { assertSafeCollection } from './lib/collection-guard.mjs';
import { fetchPointsByIds, getCollectionInfo, qdrantBaseUrl } from './lib/qdrant-introspection.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const collection = assertSafeCollection(process.argv.find((arg) => arg.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_sparse_test_v1');
const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 100);

async function main() {
  let collectionInfo;
  try {
    collectionInfo = await getCollectionInfo(collection);
  } catch (error) {
    const payload = {
      artifact_id: 'atlas-sparse-readback-v1',
      status: 'NOT_PROVEN_COLLECTION_NOT_FOUND',
      collection,
      qdrant_base_url: qdrantBaseUrl(),
      writes: { postgres: false, qdrant: false, valkey: false },
      diagnostics: [(error instanceof Error ? error.message : String(error))],
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const config = collectionInfo?.result?.config ?? collectionInfo?.config ?? {};
  const vectors = config.params?.vectors ?? config.vectors ?? {};
  const sparseVectors = config.params?.sparse_vectors ?? config.sparse_vectors ?? {};
  const denseContractPass = vectors?.content?.size === 768 && vectors?.content?.distance === 'Cosine';
  const sparseContractPass = Object.prototype.hasOwnProperty.call(sparseVectors, 'lexical_v1');

  const { rows } = await pool.query(
    `
    SELECT id, relative_path, content_hash, content
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
    ORDER BY id
    LIMIT $1
    `,
    [limit],
  );

  const ids = rows.map((row) => row.id);
  const response = denseContractPass && sparseContractPass
    ? await fetchPointsByIds(collection, ids.slice(0, Math.min(ids.length, 10)), {
      withPayload: true,
      withVector: true,
    })
    : null;
  const points = response?.result ?? response ?? [];
  const pointRows = Array.isArray(points) ? points : [];
  const densePointCount = pointRows.filter((point) => {
    const vector = point?.vector?.content;
    return Array.isArray(vector) && vector.length === 768;
  }).length;
  const sparsePointCount = pointRows.filter((point) => {
    const vector = point?.vector?.lexical_v1;
    return Array.isArray(vector?.indices) && Array.isArray(vector?.values) &&
      vector.indices.length === vector.values.length && vector.indices.length > 0;
  }).length;

  const payload = {
    artifact_id: 'atlas-sparse-readback-v1',
    status: denseContractPass && sparseContractPass && sparsePointCount > 0
      ? 'RUNTIME_PROVEN'
      : denseContractPass && sparseContractPass
        ? 'SCHEMA_PROVEN_SPARSE_POINTS_NOT_PROVEN'
        : 'SCHEMA_MISMATCH',
    collection,
    qdrant_base_url: qdrantBaseUrl(),
    postgres_sample_count: rows.length,
    qdrant_point_sample_count: pointRows.length,
    dense_point_sample_count: densePointCount,
    sparse_point_sample_count: sparsePointCount,
    dense_contract: { expected: 'content:768/Cosine', pass: denseContractPass },
    sparse_contract: { expected: 'lexical_v1', pass: sparseContractPass },
    writes: { postgres: false, qdrant: false, valkey: false },
  };
  const proofPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-readback-proof.json');
  await mkdir(path.dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...payload, proof_path: proofPath }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
