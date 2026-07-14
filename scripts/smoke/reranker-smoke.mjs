#!/usr/bin/env node
/**
 * reranker-smoke.mjs
 *
 * Milestone 7: MixedBread CrossEncoder rerank smoke test.
 *
 * Pipeline:
 *   1. Embed query (Ollama embeddinggemma:latest, 768-dim)
 *   2. Qdrant ANN on 'content' named vector → top-20 candidates
 *   3. Postgres join → fetch summary / source_ref / topolog_cluster per packet
 *   4. POST /rerank to mxbai-rerank-base-v2 sidecar (:8099)
 *   5. Print before/after rank order + score delta
 *
 * Usage:
 *   node scripts/smoke/reranker-smoke.mjs [query]
 *   RERANKER_URL=http://127.0.0.1:8099 node scripts/smoke/reranker-smoke.mjs
 */

import pg from 'pg';

const { Pool } = pg;

const QUERY        = process.argv[2] ?? 'postgres database connection pool drizzle ORM';
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://127.0.0.1:11434';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://127.0.0.1:6333';
const RERANKER_URL = process.env.RERANKER_URL || 'http://127.0.0.1:8099';
const COLLECTION   = 'codebase_chunks_768';
const ANN_TOP      = 20;   // over-retrieve for reranker
const FINAL_TOP    = 5;

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const { embedding } = await res.json();
  return embedding;
}

async function qdrantAnn(vector) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: 'content', vector },
      limit: ANN_TOP,
      with_payload: true,
      with_vector: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Qdrant ANN failed: ${res.status} ${await res.text()}`);
  const { result } = await res.json();
  return result ?? [];
}

async function fetchPackets(client, packetKeys) {
  if (!packetKeys.length) return [];
  const res = await client.query(`
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.topolog_cluster,
      ap.title_id,
      COALESCE(
        (SELECT sl.summary
         FROM atlas_summary_layers sl
         WHERE sl.packet_key = ap.packet_key
           AND sl.layer_type = 'chunk_projection'
           AND sl.summary IS NOT NULL
         LIMIT 1),
        ap.source_ref
      ) AS text_for_rerank
    FROM atlas_packets ap
    WHERE ap.packet_key = ANY($1::text[])
  `, [packetKeys]);
  return res.rows;
}

async function mxbaiRerank(query, candidates) {
  const payload = {
    query,
    candidates: candidates.map(c => ({
      packet_key: c.packet_key,
      text: c.text_for_rerank,
    })),
    batch_size: 8,
  };

  const res = await fetch(`${RERANKER_URL}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Reranker failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`🎯 Reranker Smoke — query: "${QUERY}"\n`);

    // Step 1: Embed
    process.stdout.write('Step 1: Embed query... ');
    const vector = await embed(QUERY);
    console.log(`dim=${vector.length} ✅`);

    // Step 2: Qdrant ANN
    process.stdout.write(`Step 2: Qdrant ANN (top ${ANN_TOP})... `);
    const annHits = await qdrantAnn(vector);
    // Deduplicate by packet_key (multiple chunks → same packet)
    const seenKeys = new Set();
    const dedupedHits = [];
    for (const h of annHits) {
      const pk = h.payload?.packet_key;
      if (pk && !seenKeys.has(pk)) {
        seenKeys.add(pk);
        dedupedHits.push({ packet_key: pk, ann_score: h.score, ann_rank: dedupedHits.length + 1 });
      }
    }
    console.log(`${annHits.length} hits → ${dedupedHits.length} unique packets ✅`);

    // Step 3: Postgres join for reranker text
    process.stdout.write('Step 3: Postgres join (text for reranker)... ');
    const packetData = await fetchPackets(client, dedupedHits.map(h => h.packet_key));
    const packetMap = new Map(packetData.map(r => [r.packet_key, r]));

    // Merge ANN rank info with packet text
    const candidates = dedupedHits
      .map(h => {
        const p = packetMap.get(h.packet_key);
        if (!p) return null;
        return { ...h, ...p };
      })
      .filter(Boolean);
    console.log(`${candidates.length}/${dedupedHits.length} joined ✅`);

    if (candidates.length === 0) {
      console.log('\n❌ No candidates to rerank — check Qdrant + atlas_packets join.');
      return;
    }

    // Step 4: MixedBread rerank
    process.stdout.write(`Step 4: MixedBread rerank (${candidates.length} candidates)... `);
    const rerankRes = await mxbaiRerank(QUERY, candidates);
    console.log(`done in ${rerankRes.latency_ms.toFixed(0)}ms, device=${rerankRes.model_loaded ? 'loaded' : 'err'}, batches=${rerankRes.batch_count} ✅`);

    // Step 5: Compare before vs after
    const rerankedMap = new Map(rerankRes.ranked.map((r, i) => [r.packet_key, { rerank_score: r.score, rerank_rank: i + 1 }]));

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('Before rerank (ANN order) vs After rerank (CrossEncoder order)');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`${'ANN#'.padEnd(5)} ${'RR#'.padEnd(5)} ${'Δrank'.padEnd(7)} ${'ANN score'.padEnd(11)} ${'CE score'.padEnd(10)} source_ref`);
    console.log('─'.repeat(100));

    const finalCandidates = [...candidates]
      .map(c => ({
        ...c,
        ...(rerankedMap.get(c.packet_key) ?? { rerank_score: -99, rerank_rank: 99 }),
      }))
      .sort((a, b) => a.rerank_rank - b.rerank_rank)
      .slice(0, FINAL_TOP * 2);  // show top-10 after rerank

    for (const c of finalCandidates) {
      const delta = c.ann_rank - c.rerank_rank;
      const deltaStr = delta === 0 ? '  =' : delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`;
      const annScore = c.ann_score.toFixed(4);
      const ceScore  = c.rerank_score.toFixed(4);
      const src = c.source_ref?.slice(-60) ?? '?';
      console.log(
        `${String(c.ann_rank).padEnd(5)} ${String(c.rerank_rank).padEnd(5)} ${deltaStr.padEnd(7)} ${annScore.padEnd(11)} ${ceScore.padEnd(10)} ${src}`
      );
    }

    // Gate: top-5 reranked should all join to atlas_packets
    const top5 = rerankRes.ranked.slice(0, FINAL_TOP);
    const top5Keys = top5.map(r => r.packet_key);
    const verifyRes = await client.query(
      `SELECT packet_key FROM atlas_packets WHERE packet_key = ANY($1::text[])`,
      [top5Keys]
    );
    const joined = verifyRes.rows.length;

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`Top-${FINAL_TOP} reranked packets joined to atlas_packets: ${joined}/${FINAL_TOP}  ${joined === FINAL_TOP ? '✅' : '❌'}`);
    console.log(`Reranker latency: ${rerankRes.latency_ms.toFixed(0)}ms`);
    console.log(`VRAM peak: ${rerankRes.vram_peak_mb.toFixed(0)}MB`);
    console.log('════════════════════════════════════════════════════════════');

    if (joined === FINAL_TOP) {
      console.log('\n✅ Milestone 7 PASS — MixedBread reranker pipeline operational');
    } else {
      console.log('\n❌ Milestone 7 FAIL — some top-5 packets missing from atlas_packets');
      process.exit(1);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
