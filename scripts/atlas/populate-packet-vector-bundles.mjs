#!/usr/bin/env node
/**
 * Populate packet_vector_bundles from existing embeddings
 *
 * Sources (in priority order):
 *   content_vector  ← codebase_chunk_index.content_embedding (384-dim)
 *   summary_vector  ← embed atlas_packets.summary via Ollama (384-dim)
 *   keyword_vector  ← embed ontology.keywords joined text via Ollama (384-dim)
 *
 * For summary_vector and keyword_vector we call Ollama embeddinggemma in
 * batches of 20 to stay within rate limits.
 *
 * Usage:
 *   node scripts/atlas/populate-packet-vector-bundles.mjs --dry-run
 *   node scripts/atlas/populate-packet-vector-bundles.mjs --apply
 *   node scripts/atlas/populate-packet-vector-bundles.mjs --apply --content-only
 *   node scripts/atlas/populate-packet-vector-bundles.mjs --apply --limit 5000
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const APPLY        = process.argv.includes('--apply');
const DRY_RUN      = !APPLY;
const CONTENT_ONLY = process.argv.includes('--content-only');
const LIMIT_IDX    = process.argv.indexOf('--limit');
const LIMIT        = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1]) : 999999;
const EMBED_BATCH  = 20;

const _ollamaRaw   = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL   = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
const EMBED_MODEL  = process.env.EMBED_MODEL || 'embeddinggemma:latest';

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Populate packet_vector_bundles                                  ║');
console.log(`║  Mode: ${(APPLY ? 'APPLY' : 'DRY-RUN').padEnd(57)}║`);
console.log(`║  Passes: ${CONTENT_ONLY ? 'content only' : 'content + summary + keywords'}`.padEnd(68) + '║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

async function embedBatch(texts) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = await res.json();
  return data.embeddings ?? data.embedding ?? [];
}

const TARGET_DIM = 384;

function vecToLiteral(arr) {
  const a = Array.from(arr);
  const slice = a.length > TARGET_DIM ? a.slice(0, TARGET_DIM) : a;
  return '[' + slice.join(',') + ']';
}

async function main() {
  // --- Pass 1: content_vector from codebase_chunk_index ---
  console.log('  Pass 1: content_vector ← codebase_chunk_index.content_embedding\n');

  const contentRows = await pgPool.query(`
    SELECT DISTINCT ON (ap.packet_key)
           ap.packet_key, ap.source_ref,
           (ci.content_embedding::float4[])[1:384]::vector(384)::text AS emb
    FROM atlas_packets ap
    JOIN codebase_chunk_index ci ON ci.source_ref = ap.source_ref
    WHERE ci.content_embedding IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM packet_vector_bundles pvb
        WHERE pvb.packet_key = ap.packet_key
          AND pvb.content_vector IS NOT NULL
      )
    ORDER BY ap.packet_key
    LIMIT $1
  `, [LIMIT]);

  console.log(`  Found ${contentRows.rows.length} packets needing content_vector\n`);

  if (DRY_RUN) {
    console.log(`  DRY-RUN: Would upsert ${contentRows.rows.length} content vectors`);
  } else {
    let done = 0;
    const BATCH = 200;
    for (let i = 0; i < contentRows.rows.length; i += BATCH) {
      const chunk = contentRows.rows.slice(i, i + BATCH);
      const values = [], placeholders = [];
      let pi = 1;
      for (const r of chunk) {
        placeholders.push(`($${pi},$${pi+1}::vector)`);
        values.push(r.packet_key, r.emb);
        pi += 2;
      }
      await pgPool.query(
        `INSERT INTO packet_vector_bundles (packet_key, content_vector)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (packet_key) DO UPDATE
           SET content_vector = EXCLUDED.content_vector,
               enriched_at    = NOW()`,
        values
      );
      done += chunk.length;
      if (i % 2000 === 0 && i > 0) process.stdout.write(`  content_vector: ${done}...\r`);
    }
    console.log(`  ✅ content_vector: ${done} rows upserted\n`);
  }

  if (CONTENT_ONLY) { await pgPool.end(); return; }

  // --- Pass 2: summary_vector from atlas_packets.summary ---
  console.log('  Pass 2: summary_vector ← embed atlas_packets.summary\n');

  const summaryRows = await pgPool.query(`
    SELECT ap.packet_key, ap.summary
    FROM atlas_packets ap
    WHERE ap.summary IS NOT NULL AND LENGTH(ap.summary) > 30
      AND NOT EXISTS (
        SELECT 1 FROM packet_vector_bundles pvb
        WHERE pvb.packet_key = ap.packet_key
          AND pvb.summary_vector IS NOT NULL
      )
    LIMIT $1
  `, [Math.min(LIMIT, 10000)]);

  console.log(`  Found ${summaryRows.rows.length} packets needing summary_vector\n`);

  if (DRY_RUN) {
    console.log(`  DRY-RUN: Would embed+upsert ${summaryRows.rows.length} summary vectors`);
  } else {
    let done = 0;
    for (let i = 0; i < summaryRows.rows.length; i += EMBED_BATCH) {
      const chunk = summaryRows.rows.slice(i, i + EMBED_BATCH);
      const texts = chunk.map(r => r.summary.slice(0, 512));
      let embeddings;
      try { embeddings = await embedBatch(texts); }
      catch { continue; }
      const values = [], placeholders = [];
      let pi = 1;
      for (let j = 0; j < chunk.length; j++) {
        if (!embeddings[j]) continue;
        placeholders.push(`($${pi},$${pi+1}::vector)`);
        values.push(chunk[j].packet_key, vecToLiteral(embeddings[j]));
        pi += 2;
      }
      if (placeholders.length > 0) {
        await pgPool.query(
          `INSERT INTO packet_vector_bundles (packet_key, summary_vector)
           VALUES ${placeholders.join(',')}
           ON CONFLICT (packet_key) DO UPDATE
             SET summary_vector = EXCLUDED.summary_vector,
                 enriched_at    = NOW()`,
          values
        );
      }
      done += chunk.length;
      if (i % 200 === 0 && i > 0) process.stdout.write(`  summary_vector: ${done}/${summaryRows.rows.length}\r`);
    }
    console.log(`  ✅ summary_vector: ${done} rows processed\n`);
  }

  // --- Pass 3: keyword_vector from ontology.keywords ---
  console.log('  Pass 3: keyword_vector ← embed ontology.keywords\n');

  const kwRows = await pgPool.query(`
    SELECT ap.packet_key,
           array_to_string(
             ARRAY(SELECT jsonb_array_elements_text(ap.ontology->'keywords') LIMIT 20),
             ' '
           ) AS kw_text
    FROM atlas_packets ap
    WHERE ap.ontology IS NOT NULL
      AND ap.ontology->>'keywords' IS NOT NULL
      AND jsonb_array_length(ap.ontology->'keywords') > 0
      AND NOT EXISTS (
        SELECT 1 FROM packet_vector_bundles pvb
        WHERE pvb.packet_key = ap.packet_key
          AND pvb.keyword_vector IS NOT NULL
      )
    LIMIT $1
  `, [Math.min(LIMIT, 20000)]);

  console.log(`  Found ${kwRows.rows.length} packets needing keyword_vector\n`);

  if (DRY_RUN) {
    console.log(`  DRY-RUN: Would embed+upsert ${kwRows.rows.length} keyword vectors`);
    console.log('\n  Re-run with --apply to write all vectors\n');
    await pgPool.end(); return;
  }

  let done = 0;
  for (let i = 0; i < kwRows.rows.length; i += EMBED_BATCH) {
    const chunk = kwRows.rows.slice(i, i + EMBED_BATCH).filter(r => r.kw_text?.trim());
    if (!chunk.length) continue;
    let embeddings;
    try { embeddings = await embedBatch(chunk.map(r => r.kw_text.slice(0, 512))); }
    catch { continue; }
    const values = [], placeholders = [];
    let pi = 1;
    for (let j = 0; j < chunk.length; j++) {
      if (!embeddings[j]) continue;
      placeholders.push(`($${pi},$${pi+1}::vector)`);
      values.push(chunk[j].packet_key, vecToLiteral(embeddings[j]));
      pi += 2;
    }
    if (placeholders.length > 0) {
      await pgPool.query(
        `INSERT INTO packet_vector_bundles (packet_key, keyword_vector)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (packet_key) DO UPDATE
           SET keyword_vector = EXCLUDED.keyword_vector,
               enriched_at    = NOW()`,
        values
      );
    }
    done += chunk.length;
    if (i % 200 === 0 && i > 0) process.stdout.write(`  keyword_vector: ${done}/${kwRows.rows.length}\r`);
  }
  console.log(`  ✅ keyword_vector: ${done} rows processed\n`);

  await pgPool.end();

  // Final coverage
  const cvg = await new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  }).query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN content_vector IS NOT NULL THEN 1 ELSE 0 END) AS content,
           SUM(CASE WHEN summary_vector IS NOT NULL THEN 1 ELSE 0 END) AS summary,
           SUM(CASE WHEN keyword_vector IS NOT NULL THEN 1 ELSE 0 END) AS keyword
    FROM packet_vector_bundles
  `).catch(() => null);
  if (cvg) {
    const r = cvg.rows[0];
    console.log(`  packet_vector_bundles coverage:`);
    console.log(`    total rows: ${r.total}`);
    console.log(`    content_vector: ${r.content}`);
    console.log(`    summary_vector: ${r.summary}`);
    console.log(`    keyword_vector: ${r.keyword}\n`);
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });