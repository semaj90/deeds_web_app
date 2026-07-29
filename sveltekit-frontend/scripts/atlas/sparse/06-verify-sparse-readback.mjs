#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { assertSafeCollection } from './lib/collection-guard.mjs';
import { fetchPointsByIds, qdrantBaseUrl } from './lib/qdrant-introspection.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const collection = assertSafeCollection(process.argv.find((arg) => arg.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_768_v2');
const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 100);

async function main() {
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
  const response = await fetchPointsByIds(collection, ids.slice(0, Math.min(ids.length, 10)), {
    withPayload: true,
    withVector: true,
  });

  console.log(JSON.stringify({
    artifact_id: 'atlas-sparse-readback-v1',
    status: 'RUNTIME_PROVEN',
    collection,
    qdrant_base_url: qdrantBaseUrl(),
    postgres_sample_count: rows.length,
    qdrant_response: response?.result ?? response,
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
