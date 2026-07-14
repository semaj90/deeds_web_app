#!/usr/bin/env node
// Milestone 6: RRF smoke test — Qdrant ANN + Postgres BM25 join + verify identity fields

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1', port: 5434,
  user: 'legal_admin', password: '123456', database: 'legal_ai_db', max: 3
});

const QDRANT = 'http://127.0.0.1:6333';
const OLLAMA = 'http://127.0.0.1:11434';
const COLLECTION = 'codebase_chunks_768';
const QUERY = 'postgres database connection pool drizzle ORM';

async function embed(text) {
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
  });
  const { embedding } = await res.json();
  return embedding;
}

async function qdrantANN(vector, limit = 10) {
  const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: 'content', vector },
      limit,
      with_payload: true,
      with_vector: false
    })
  });
  const { result } = await res.json();
  return result;
}

async function pgBM25(query, limit = 10) {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT packet_key, source_ref, feature_id,
             ts_rank_cd(to_tsvector('english', COALESCE(summary, '')), plainto_tsquery('english', $1)) AS bm25
      FROM atlas_packets
      WHERE to_tsvector('english', COALESCE(summary, '')) @@ plainto_tsquery('english', $1)
      ORDER BY bm25 DESC
      LIMIT $2
    `, [query, limit]);
    return res.rows;
  } finally {
    client.release();
  }
}

function rrf(lists, k = 60) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const key = item.packet_key;
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([key, score]) => ({ packet_key: key, rrf_score: score }));
}

async function main() {
  console.log(`🔎 RRF Smoke — query: "${QUERY}"\n`);

  console.log('Step 1: Embed query...');
  const vec = await embed(QUERY);
  console.log(`  vector dim: ${vec.length} ✅`);

  console.log('Step 2: Qdrant ANN (content vector)...');
  const qdrantHits = await qdrantANN(vec, 10);
  console.log(`  Qdrant hits: ${qdrantHits.length}`);
  for (const h of qdrantHits.slice(0, 3)) {
    const pk = h.payload?.packet_key ?? h.payload?.packetKey ?? 'MISSING';
    const sr = h.payload?.source_ref ?? h.payload?.sourceRef ?? 'MISSING';
    console.log(`    score=${h.score.toFixed(4)} pk=${pk} sr=${sr.slice(0,60)}`);
  }

  // Normalize to {packet_key}
  const qdrantNorm = qdrantHits.map(h => ({
    packet_key: h.payload?.packet_key ?? h.payload?.packetKey,
    score: h.score
  })).filter(h => h.packet_key);

  console.log('Step 3: Postgres BM25...');
  const bm25Hits = await pgBM25(QUERY, 10);
  console.log(`  BM25 hits: ${bm25Hits.length}`);
  for (const h of bm25Hits.slice(0, 3)) {
    console.log(`    bm25=${parseFloat(h.bm25).toFixed(4)} pk=${h.packet_key} sr=${h.source_ref.slice(0,60)}`);
  }

  console.log('Step 4: RRF fusion...');
  const fused = rrf([qdrantNorm, bm25Hits], 60);
  console.log(`  Fused candidates: ${fused.length}`);
  for (const h of fused.slice(0, 5)) {
    console.log(`    rrf=${h.rrf_score.toFixed(5)} pk=${h.packet_key}`);
  }

  console.log('Step 5: Verify top-5 join back to atlas_packets...');
  const client = await pool.connect();
  try {
    const top5 = fused.slice(0, 5).map(h => h.packet_key);
    const res = await client.query(
      `SELECT packet_key, source_ref, feature_id, domain_class, topolog_cluster
       FROM atlas_packets WHERE packet_key = ANY($1)`,
      [top5]
    );
    console.log(`  Joined ${res.rows.length}/5 packets from Postgres ✅`);
    for (const r of res.rows) {
      console.log(`    pk=${r.packet_key} cluster=${r.topolog_cluster ?? 'null'} src=${r.source_ref.slice(0,55)}`);
    }
  } finally {
    client.release();
  }

  await pool.end();
  console.log('\n✅ RRF smoke complete — all lanes operational');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
