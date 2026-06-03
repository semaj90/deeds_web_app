/**
 * create-qdrant-payload-indexes.mjs — Phase 102 T2
 *
 * Creates keyword payload indexes on codebase_chunks_768 so agents can
 * filter by feature_id / cluster_id / task_id without doing a full scan.
 *
 * Idempotent — safe to re-run; Qdrant returns 200 if index already exists.
 *
 * Usage:
 *   node scripts/atlas/create-qdrant-payload-indexes.mjs
 *   node scripts/atlas/create-qdrant-payload-indexes.mjs --dry-run
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── env injection ─────────────────────────────────────────────────────────────
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: resolve(__dirname, '../../sveltekit-frontend/.env') });
  dotenv.config({ path: resolve(__dirname, '../../.env') });
} catch { /* dotenv optional */ }

const DRY_RUN = process.argv.includes('--dry-run');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';

// Collections + fields to index
const INDEX_PLAN = [
  {
    collection: 'codebase_chunks_768',
    fields: [
      { field_name: 'feature_id',  field_schema: 'keyword' },
      { field_name: 'cluster_id',  field_schema: 'keyword' },
      { field_name: 'task_id',     field_schema: 'keyword' },
      { field_name: 'source_ref',  field_schema: 'keyword' },
      { field_name: 'stable_key',  field_schema: 'keyword' },
      { field_name: 'som_cluster', field_schema: 'keyword' },
    ],
  },
  {
    collection: 'task_semantic_packets',
    fields: [
      { field_name: 'feature_id',         field_schema: 'keyword' },
      { field_name: 'cluster_id',         field_schema: 'keyword' },
      { field_name: 'workspace_task_id',  field_schema: 'integer' },
      { field_name: 'alias_id',           field_schema: 'keyword' },
    ],
  },
];

async function collectionExists(collection) {
  const res = await fetch(`${QDRANT_URL}/collections/${collection}`, {
    signal: AbortSignal.timeout(5_000),
  });
  return res.ok;
}

async function createIndex(collection, field_name, field_schema) {
  const url = `${QDRANT_URL}/collections/${collection}/index`;
  const body = JSON.stringify({ field_name, field_schema });

  if (DRY_RUN) {
    console.log(`  [DRY] PUT ${url}  body=${body}`);
    return { ok: true, status: 200 };
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

async function verifyIndexes(collection) {
  const res = await fetch(`${QDRANT_URL}/collections/${collection}`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return {};
  const data = await res.json();
  return data.result?.payload_schema ?? data.result?.config?.payload_schema ?? {};
}

async function main() {
  console.log(`[T2] Qdrant Payload Index Creator — Phase 102`);
  console.log(`[T2] QDRANT_URL=${QDRANT_URL}  DRY_RUN=${DRY_RUN}`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const { collection, fields } of INDEX_PLAN) {
    console.log(`\n[T2] Collection: ${collection}`);

    const exists = await collectionExists(collection);
    if (!exists) {
      console.warn(`  [SKIP] Collection '${collection}' does not exist in Qdrant — skipping`);
      continue;
    }

    for (const { field_name, field_schema } of fields) {
      process.stdout.write(`  → ${field_name} (${field_schema}) ... `);
      try {
        const result = await createIndex(collection, field_name, field_schema);
        if (result.ok || result.status === 200) {
          console.log('OK');
          totalCreated++;
        } else {
          console.log(`WARN status=${result.status} body=${result.body?.slice(0, 100)}`);
        }
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }
    }

    if (!DRY_RUN) {
      const schema = await verifyIndexes(collection);
      const presentFields = Object.keys(schema);
      const missing = fields.filter(f => !presentFields.includes(f.field_name)).map(f => f.field_name);
      if (missing.length === 0) {
        console.log(`  ✓ All ${fields.length} indexes verified in payload_schema`);
      } else {
        console.warn(`  ⚠ Missing from payload_schema: ${missing.join(', ')}`);
        totalSkipped += missing.length;
      }
    }
  }

  console.log(`\n[T2] Done — created=${totalCreated}  issues=${totalSkipped}`);

  if (!DRY_RUN) {
    console.log('\n[T2] Gate check:');
    console.log(`  curl -sf "${QDRANT_URL}/collections/codebase_chunks_768" | jq '.result.config.payload_schema | keys'`);
  }
}

main().catch(err => {
  console.error('[T2] FATAL:', err);
  process.exit(1);
});
