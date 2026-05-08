#!/usr/bin/env node
/**
 * mirror-qdrant-clusters-to-postgres.mjs
 *
 * Reads cluster_key from Qdrant codebase_chunks_768 payloads (set by
 * backfill-qdrant-cluster-keys.mjs) and mirrors the (cluster_key, stable_key,
 * file_path) triples into Postgres qdrant_cluster_members so MCP tools and
 * code-intel-service can resolve cluster → members in O(1).
 *
 * Idempotent — uses ON CONFLICT DO UPDATE on the (cluster_key, stable_key)
 * composite primary key.
 *
 * Usage:
 *   node scripts/mirror-qdrant-clusters-to-postgres.mjs
 *   node scripts/mirror-qdrant-clusters-to-postgres.mjs --dry-run
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const BATCH = 200;

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

let scrolled = 0;
let inserted = 0;
let skipped = 0;
let nextOffset = undefined;

console.log(`Mirror Qdrant ${COLLECTION}.cluster_key → Postgres qdrant_cluster_members ${DRY_RUN ? '[DRY]' : ''}`);

// Loop until the Qdrant scroll exhausts (sets nextOffset = undefined inside).
// eslint-disable-next-line no-constant-condition
while (true) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit: BATCH,
      offset: nextOffset,
      with_payload: ['cluster_key', 'stable_key', 'file_path', 'relative_path'],
      with_vector: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}`);
  const { result } = await res.json();
  const points = result?.points ?? [];
  if (!points.length) break;

  // Collect rows that have a cluster_key
  const rows = [];
  for (const p of points) {
    const payload = p.payload ?? {};
    const clusterKey = payload.cluster_key;
    const stableKey = payload.stable_key ?? String(p.id);
    const filePath = payload.file_path ?? payload.relative_path ?? null;
    if (!clusterKey) { skipped++; continue; }
    rows.push({ clusterKey, stableKey, qdrantPointId: String(p.id), filePath });
  }

  if (rows.length && !DRY_RUN) {
    // Batch upsert via UNNEST for speed (avoid per-row prepared statement overhead)
    const cks = rows.map((r) => r.clusterKey);
    const sks = rows.map((r) => r.stableKey);
    const qids = rows.map((r) => r.qdrantPointId);
    const fps = rows.map((r) => r.filePath);
    await client.query(
      `INSERT INTO qdrant_cluster_members (cluster_key, stable_key, qdrant_point_id, file_path)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
       ON CONFLICT (cluster_key, stable_key) DO UPDATE SET
         qdrant_point_id = EXCLUDED.qdrant_point_id,
         file_path = EXCLUDED.file_path`,
      [cks, sks, qids, fps],
    );
  }
  inserted += rows.length;
  scrolled += points.length;

  if (scrolled % 2000 < BATCH) console.log(`  scrolled=${scrolled} inserted=${inserted} skipped=${skipped}${DRY_RUN ? ' [DRY]' : ''}`);

  nextOffset = result?.next_page_offset;
  if (!nextOffset) break;
}

await client.end();
console.log(`\nDone. Scrolled ${scrolled}, inserted/upserted ${inserted}, skipped ${skipped}${DRY_RUN ? ' [DRY-RUN — no writes]' : ''}.`);
