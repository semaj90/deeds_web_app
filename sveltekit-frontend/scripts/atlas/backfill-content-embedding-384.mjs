#!/usr/bin/env node
/**
 * Gate 2: Backfill content_embedding_384 from Qdrant codebase_chunks_384_hybrid.
 *
 * Join key: Qdrant point UUID = codebase_chunk_index.id
 * Source:   Qdrant "content" named vector (384-dim, cosine, normalized)
 * Target:   codebase_chunk_index.content_embedding_384 (vector(384))
 *
 * Usage:
 *   node scripts/atlas/backfill-content-embedding-384.mjs --dry-run
 *   node scripts/atlas/backfill-content-embedding-384.mjs --apply
 *   node scripts/atlas/backfill-content-embedding-384.mjs --apply --resume
 *   node scripts/atlas/backfill-content-embedding-384.mjs --verify
 */

import pg from 'pg';
import { readFileSync } from 'fs';

const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const COLLECTION  = 'codebase_chunks_384_hybrid';
const PG_HOST     = process.env.PG_HOST     ?? '127.0.0.1';
const PG_PORT     = parseInt(process.env.PG_PORT ?? '5434');
const PG_USER     = process.env.PG_USER     ?? 'legal_admin';
const PG_PASS     = process.env.PG_PASSWORD ?? '123456';
const PG_DB       = process.env.PG_DATABASE ?? 'legal_ai_db';
const SCROLL_LIMIT = 250;   // Qdrant scroll page size (keep small — vectors are large)
const WRITE_BATCH  = 100;   // Postgres UPDATE batch size

const DRY_RUN  = process.argv.includes('--dry-run');
const APPLY    = process.argv.includes('--apply');
const RESUME   = process.argv.includes('--resume');
const VERIFY   = process.argv.includes('--verify');

if (!DRY_RUN && !APPLY && !VERIFY) {
  console.error('Pass --dry-run, --apply, or --verify');
  process.exit(1);
}

const pool = new pg.Pool({
  host: PG_HOST, port: PG_PORT,
  user: PG_USER, password: PG_PASS,
  database: PG_DB,
  max: 3,
});

// ── VERIFY mode ──────────────────────────────────────────────────────────────
if (VERIFY) {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        count(*)                                                    AS total_rows,
        count(*) FILTER (WHERE content_embedding_384 IS NOT NULL)  AS has_384,
        count(*) FILTER (WHERE content_embedding_384 IS NULL
                           AND content IS NOT NULL
                           AND length(trim(content)) > 0)          AS eligible_missing,
        count(*) FILTER (WHERE embedding_dimension IS NOT NULL
                           AND embedding_dimension != 384
                           AND content_embedding_384 IS NOT NULL)  AS wrong_dimension
      FROM codebase_chunk_index
    `);
    const r = res.rows[0];
    console.log('=== Gate 3: content_embedding_384 coverage ===');
    console.log(`total_rows       : ${r.total_rows}`);
    console.log(`has_384          : ${r.has_384}  (${((r.has_384 / r.total_rows) * 100).toFixed(1)}%)`);
    console.log(`eligible_missing : ${r.eligible_missing}`);
    console.log(`wrong_dimension  : ${r.wrong_dimension}`);
    console.log('');

    if (parseInt(r.eligible_missing) === 0) {
      console.log('Gate 3: PASS — all eligible rows have content_embedding_384');
    } else {
      console.log(`Gate 3: FAIL — ${r.eligible_missing} rows still missing content_embedding_384`);
      process.exitCode = 1;
    }

    // Sample 5 vectors and check they are 384-dim and finite
    const sample = await client.query(`
      SELECT id, array_length(content_embedding_384::real[], 1) AS dim
      FROM codebase_chunk_index
      WHERE content_embedding_384 IS NOT NULL
      LIMIT 5
    `);
    console.log('\nSample dimension check:');
    for (const row of sample.rows) {
      console.log(`  ${row.id}  dim=${row.dim}`);
    }
  } finally {
    client.release();
  }
  await pool.end();
  process.exit();
}

// ── Determine which rows need backfill ───────────────────────────────────────
const client = await pool.connect();

let eligibleCount, alreadyDone;
{
  const res = await client.query(`
    SELECT
      count(*) FILTER (WHERE content_embedding_384 IS NULL
                         AND content IS NOT NULL
                         AND length(trim(content)) > 0) AS need_backfill,
      count(*) FILTER (WHERE content_embedding_384 IS NOT NULL) AS already_done
    FROM codebase_chunk_index
  `);
  eligibleCount = parseInt(res.rows[0].need_backfill);
  alreadyDone   = parseInt(res.rows[0].already_done);
}

console.log('=== Gate 2: content_embedding_384 Backfill from Qdrant ===');
console.log(`Collection   : ${COLLECTION}`);
console.log(`Mode         : ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}${RESUME ? ' (resume)' : ''}`);
console.log(`Already done : ${alreadyDone.toLocaleString()}`);
console.log(`Need backfill: ${eligibleCount.toLocaleString()}`);
console.log('');

if (eligibleCount === 0) {
  console.log('Nothing to do — all eligible rows already have content_embedding_384.');
  client.release();
  await pool.end();
  process.exit(0);
}

// ── Scroll Qdrant and write to Postgres ──────────────────────────────────────
let offset       = null;
let totalFetched = 0;
let totalWritten = 0;
let totalSkipped = 0; // already done (when not using --resume filter)
const t0 = Date.now();

console.log('Scrolling Qdrant...');

outer: while (true) {
  const body = {
    limit: SCROLL_LIMIT,
    with_vector: ['content'],  // only fetch the content named-vector
    with_payload: false,
    ...(offset ? { offset } : {}),
  };

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Qdrant scroll failed: ${res.status} ${text.slice(0, 200)}`);
    process.exit(1);
  }

  const data = await res.json();
  const points = data.result?.points ?? [];
  offset       = data.result?.next_page_offset ?? null;

  if (points.length === 0) break;
  totalFetched += points.length;

  // Filter to points that have a content vector and whose PG row needs backfill
  // Build a map: uuid -> vector
  const pointMap = new Map();
  for (const p of points) {
    const vec = p.vector?.content ?? p.vector;
    if (!vec || vec.length !== 384) continue;
    pointMap.set(p.id, vec);
  }

  if (pointMap.size === 0) {
    if (!offset) break;
    continue;
  }

  // Check which of these IDs still need backfill
  const ids = [...pointMap.keys()];
  const pgRes = await client.query(`
    SELECT id::text
    FROM codebase_chunk_index
    WHERE id = ANY($1::uuid[])
      AND content_embedding_384 IS NULL
  `, [ids]);

  const needFill = new Set(pgRes.rows.map(r => r.id));
  totalSkipped += ids.length - needFill.size;

  if (needFill.size === 0) {
    if (!offset) break;
    continue;
  }

  // Build batch for UPDATE
  const batch = [];
  for (const id of needFill) {
    const vec = pointMap.get(id);
    if (!vec) continue;
    batch.push({ id, vec });
  }

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would write ${batch.length} vectors (sample id: ${batch[0]?.id})`);
    totalWritten += batch.length;
  } else {
    // Batched UPDATE using unnest
    const ids_arr     = batch.map(b => b.id);
    const vectors_arr = batch.map(b => `[${b.vec.join(',')}]`);

    await client.query(`
      UPDATE codebase_chunk_index AS cci
      SET
        content_embedding_384 = data.vec::vector(384),
        embedding_dimension   = 384,
        embedding_model       = 'embeddinggemma',
        embedding_version     = 'qdrant-backfill-v1',
        embedding_normalized  = true
      FROM (
        SELECT unnest($1::uuid[]) AS id, unnest($2::text[])::vector(384) AS vec
      ) AS data
      WHERE cci.id = data.id
        AND cci.content_embedding_384 IS NULL
    `, [ids_arr, vectors_arr]);

    totalWritten += batch.length;
  }

  if (totalFetched % 2500 === 0 || points.length < SCROLL_LIMIT) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const pct = ((totalWritten / eligibleCount) * 100).toFixed(1);
    console.log(`  Fetched ${totalFetched.toLocaleString()}  Written ${totalWritten.toLocaleString()}/${eligibleCount.toLocaleString()} (${pct}%)  Skipped ${totalSkipped}  ${elapsed}s`);
  }

  if (!offset) break;
}

client.release();
await pool.end();

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log('─────────────────────────────────────────');
console.log(`Gate 2 complete  (${DRY_RUN ? 'DRY-RUN' : 'APPLIED'})`);
console.log(`  Qdrant points fetched : ${totalFetched.toLocaleString()}`);
console.log(`  Rows written          : ${totalWritten.toLocaleString()}`);
console.log(`  Already done (skipped): ${totalSkipped.toLocaleString()}`);
console.log(`  Elapsed               : ${elapsed}s`);
console.log('─────────────────────────────────────────');
console.log('');
if (APPLY) {
  console.log('Next: run --verify to confirm gate 3 (coverage, dimension, finiteness)');
}
