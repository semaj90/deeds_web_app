#!/usr/bin/env node
/**
 * embed-packet-summaries-eg2-onnx-v1.mjs
 *
 * Projects existing atlas_packets.summary text onto matching codebase_chunk_index
 * rows (summary_text + summary_embedding) using :8094 EmbeddingGemma 2 ONNX.
 *
 * Usage:
 *   node scripts/atlas/embed-packet-summaries-eg2-onnx-v1.mjs [--dry-run] [--limit=500] [--batch-size=50]
 *   node scripts/atlas/embed-packet-summaries-eg2-onnx-v1.mjs --apply --limit=500 --batch-size=50
 */

import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LOOP = args.includes('--loop');
const LIMIT = Math.max(1, parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? (LOOP ? '5000' : '500'), 10) || 500);
const BATCH_SIZE = Math.max(1, Math.min(32, parseInt(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? '8', 10) || 8));
const EG2_ONNX_URL = (process.env.GEMMA2_ONNX_URL ?? 'http://127.0.0.1:8094').replace(/\/+$/, '');
const MAX_LOCAL_DEDUPE = 5000;
const inProcessVecCache = new Map();

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

function validateVector768(vec) {
  if (!Array.isArray(vec) || vec.length !== 768) return false;
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = Number(vec[i]);
    if (!Number.isFinite(v)) return false;
    normSq += v * v;
  }
  return normSq > 0;
}

async function embedBatch8094(texts) {
  const keys = texts.map((t) => createHash('sha256').update(t, 'utf8').digest('hex'));
  const missingTexts = [];
  const missingKeys = [];
  const missingKeySet = new Set();

  for (let i = 0; i < texts.length; i++) {
    const key = keys[i];
    if (!inProcessVecCache.has(key) && !missingKeySet.has(key)) {
      missingKeySet.add(key);
      missingTexts.push(texts[i]);
      missingKeys.push(key);
    }
  }

  if (missingTexts.length > 0) {
    const res = await fetch(`${EG2_ONNX_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: missingTexts, dims: [768] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`EG2_ONNX_HTTP_${res.status}`);
    }
    const data = await res.json();
    const vectors = data?.embeddings?.['768'];
    if (!Array.isArray(vectors) || vectors.length !== missingTexts.length) {
      throw new Error(`EG2_ONNX_COUNT_MISMATCH expected=${missingTexts.length} got=${Array.isArray(vectors) ? vectors.length : 'null'}`);
    }
    for (let i = 0; i < vectors.length; i++) {
      if (!validateVector768(vectors[i])) {
        throw new Error(`EG2_ONNX_INVALID_VECTOR index=${i}`);
      }
      if (inProcessVecCache.size >= MAX_LOCAL_DEDUPE) {
        inProcessVecCache.clear();
      }
      inProcessVecCache.set(missingKeys[i], vectors[i]);
    }
  }

  return keys.map((k) => inProcessVecCache.get(k));
}

async function main() {
  const selectSql = `
    SELECT DISTINCT ON (c.relative_path, c.id)
      c.id::text AS chunk_id,
      c.relative_path,
      a.summary AS packet_summary
    FROM codebase_chunk_index c
    JOIN atlas_packets a ON a.source_ref = c.relative_path
    WHERE a.summary IS NOT NULL
      AND a.summary <> ''
      AND c.summary_embedding IS NULL
    ORDER BY c.relative_path ASC, c.id ASC
    LIMIT $1
  `;
  if (!APPLY) {
    const { rows } = await pool.query(selectSql, [LIMIT]);
    console.log(JSON.stringify({
      mode: 'dry-run',
      eligibleRows: rows.length,
      limit: LIMIT,
      batchSize: BATCH_SIZE,
      endpoint: `${EG2_ONNX_URL}/embed`,
      sample: rows.slice(0, 3).map((r) => ({ chunk_id: r.chunk_id, relative_path: r.relative_path })),
    }, null, 2));
    return;
  }

  let updated = 0;
  let rounds = 0;
  const startedAt = Date.now();
  while (true) {
    const { rows } = await pool.query(selectSql, [LIMIT]);
    if (rows.length === 0) break;
    rounds += 1;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const texts = batch.map((r) => r.packet_summary);
      const vectors = await embedBatch8094(texts);

      const ids = batch.map((r) => r.chunk_id);
      const summaries = texts;
      const vecLiterals = vectors.map((v) => `[${v.join(',')}]`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE codebase_chunk_index c
           SET summary_text = u.summary_text,
               summary_embedding = u.summary_embedding::halfvec(768)
           FROM unnest($1::uuid[], $2::text[], $3::text[]) AS u(id, summary_text, summary_embedding)
           WHERE c.id = u.id`,
          [ids, summaries, vecLiterals],
        );
        await client.query('COMMIT');
        updated += batch.length;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    console.error(`[embed-summaries] round=${rounds} totalUpdated=${updated} elapsedMs=${Date.now() - startedAt}`);
    if (!LOOP) break;
  }

  console.log(JSON.stringify({
    mode: 'apply',
    loop: LOOP,
    rounds,
    updated,
    elapsedMs: Date.now() - startedAt,
    endpoint: `${EG2_ONNX_URL}/embed`,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error('[embed-packet-summaries-eg2-onnx-v1] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
