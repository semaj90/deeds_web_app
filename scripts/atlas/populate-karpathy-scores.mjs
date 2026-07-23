#!/usr/bin/env node
/**
 * populate-karpathy-scores.mjs
 *
 * Populates gpu:karpathy:scores in Valkey with the Karpathy authority blend:
 *   blend = 0.4·pagerank + 0.3·authority + 0.3·attention
 *
 * Sources:
 *   - PageRank:   Neo4j Packet.pageRankScore (real power-law, NOT Postgres fake 0.5 values)
 *   - Authority:  atlas_packets.authority_score (Postgres)
 *   - Attention:  CPU cosine(packet_embedding, risk_probe) via Qdrant codebase_chunks_384_hybrid
 *   - Risk probe: embedded via Ollama embeddinggemma:latest
 *
 * Usage:
 *   node scripts/atlas/populate-karpathy-scores.mjs --dry-run --limit=200
 *   node scripts/atlas/populate-karpathy-scores.mjs --apply --limit=500
 *   node scripts/atlas/populate-karpathy-scores.mjs --apply --limit=2000
 */

import process from 'node:process';
import pg from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../sveltekit-frontend/.env', import.meta.url).pathname });

// ── Config ────────────────────────────────────────────────────────────────────

const QDRANT_URL      = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COL      = 'codebase_chunks_384_hybrid';
const NEO4J_URL       = (process.env.NEO4J_URL ?? 'http://localhost:7474').replace(/^bolt:\/\/|^neo4j:\/\//, 'http://').replace(':7687', ':7474');
const NEO4J_USER      = process.env.NEO4J_USER        ?? 'neo4j';
const NEO4J_PASS      = process.env.NEO4J_PASSWORD    ?? 'neo4j123';
const OLLAMA_URL      = process.env.OLLAMA_BASE_URL   ?? 'http://127.0.0.1:11434';
const EMBED_MODEL     = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const REDIS_HOST      = process.env.REDIS_HOST        ?? '127.0.0.1';
const REDIS_PORT      = parseInt(process.env.REDIS_PORT ?? '6379');
const REDIS_PASSWORD  = process.env.REDIS_PASSWORD    ?? 'redis';

const DB_CONFIG = {
  host:     process.env.DATABASE_HOST     ?? '127.0.0.1',
  port:     parseInt(process.env.DATABASE_PORT ?? '5434'),
  user:     process.env.DATABASE_USER     ?? 'legal_admin',
  password: process.env.DATABASE_PASSWORD ?? '123456',
  database: process.env.DATABASE_NAME     ?? 'legal_ai_db',
};

// Blend weights — match CLAUDE.md canonical
const W_PR        = 0.40;
const W_AUTHORITY = 0.30;
const W_ATTENTION = 0.30;

// Risk probe query — embedded once, reused for all attention scores
const RISK_QUERY = 'critical authentication authorization security error handling database query';

const REDIS_SCORES_KEY  = 'gpu:karpathy:scores';
const REDIS_SUMMARY_KEY = 'gpu:karpathy:summary';
const REDIS_TTL         = 86400; // 24h

// ── Args ──────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const APPLY   = args.includes('--apply');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT   = limitArg ? parseInt(limitArg.split('=')[1]) : 500;

if (!DRY_RUN && !APPLY) {
  console.error('Usage: node populate-karpathy-scores.mjs [--dry-run|--apply] [--limit=N]');
  process.exit(1);
}

console.log(`Karpathy Scores Pipeline`);
console.log(`  Mode:  ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log(`  Limit: ${LIMIT} packets`);
console.log(`  Blend: ${W_PR}·PR + ${W_AUTHORITY}·authority + ${W_ATTENTION}·attention`);
console.log();

// ── Connections ───────────────────────────────────────────────────────────────

const pool = new pg.Pool({ ...DB_CONFIG, max: 3 });

const redis = new Redis({
  host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD,
  lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null,
});
redis.on('error', () => {});

// ── Helpers ───────────────────────────────────────────────────────────────────

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; n1 += a[i]*a[i]; n2 += b[i]*b[i]; }
  if (n1 === 0 || n2 === 0) return 0;
  return dot / (Math.sqrt(n1) * Math.sqrt(n2));
}

function attentionScore(vec, probe) {
  // Map cosine [-1,1] → [0,1]
  return Math.max(0, Math.min(1, (cosine(vec, probe) + 1) / 2));
}

function normalizePageRank(rawScores) {
  // Neo4j pageRankScore is unbounded (10.1, 9.4...) — normalize to [0,1] by max
  const max = Math.max(...rawScores, 1e-9);
  return rawScores.map(s => s / max);
}

// ── Step 1: Embed risk probe ──────────────────────────────────────────────────

async function embedProbe() {
  process.stdout.write(`[1/5] Embedding risk probe via Ollama... `);
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: RISK_QUERY }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = await res.json();
  const emb = data.embedding;
  if (!Array.isArray(emb) || emb.length < 64) throw new Error(`Bad embedding dim: ${emb?.length}`);
  console.log(`${emb.length}-dim ✓`);
  return new Float32Array(emb);
}

// ── Step 2: Pull top-N from Neo4j by real PageRank ───────────────────────────

async function fetchNeo4jTopN(limit) {
  process.stdout.write(`[2/5] Fetching top-${limit} packets from Neo4j by pageRankScore... `);
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64'),
    },
    body: JSON.stringify({
      statements: [{
        statement: `
          MATCH (n:Packet)
          WHERE n.pageRankScore IS NOT NULL AND n.path IS NOT NULL
          RETURN n.path AS path, n.pageRankScore AS pr
          ORDER BY n.pageRankScore DESC
          LIMIT ${limit * 2}
        `,
        resultDataContents: ['row'],
      }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Neo4j query failed: ${res.status}`);
  const data = await res.json();
  const rows = data.results?.[0]?.data ?? [];
  const candidates = rows.map(d => ({ path: d.row[0], pr: d.row[1] }))
    .filter(c => c.path && typeof c.pr === 'number');
  console.log(`${candidates.length} candidates ✓`);
  return candidates;
}

// ── Step 3: Join with Postgres authority_score ────────────────────────────────

async function joinAuthority(candidates) {
  process.stdout.write(`[3/5] Joining authority_score from Postgres... `);
  const paths = candidates.map(c => c.path);
  const { rows } = await pool.query(
    `SELECT source_ref, packet_key, authority_score
     FROM atlas_packets
     WHERE source_ref = ANY($1::text[])`,
    [paths]
  );
  const authMap = new Map(rows.map(r => [r.source_ref, { packet_key: r.packet_key, authority: Number(r.authority_score ?? 0) }]));
  const joined = candidates.map(c => ({
    ...c,
    packet_key: authMap.get(c.path)?.packet_key ?? null,
    authority:  authMap.get(c.path)?.authority   ?? 0,
  }));
  const matched = joined.filter(c => c.packet_key).length;
  console.log(`${matched}/${joined.length} matched to atlas_packets ✓`);
  return joined.filter(c => c.packet_key); // drop unmatched
}

// ── Step 4: Fetch embeddings from Qdrant ────────────────────────────────────

async function fetchQdrantEmbeddings(candidates) {
  process.stdout.write(`[4/5] Fetching embeddings from Qdrant (${QDRANT_COL})... `);
  // Scroll by packet_key filter — batch in groups of 100
  const embMap = new Map(); // packet_key → Float32Array
  const BATCH = 100;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const packetKeys = batch.map(c => c.packet_key);
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COL}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }] },
        limit: BATCH,
        with_payload: ['packet_key'],
        with_vector: ['content'],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) continue;
    const data = await res.json();
    for (const pt of (data.result?.points ?? [])) {
      const pk = pt.payload?.packet_key;
      const vec = pt.vector?.content ?? pt.vector;
      if (pk && Array.isArray(vec)) embMap.set(pk, new Float32Array(vec));
    }
  }
  console.log(`${embMap.size}/${candidates.length} embeddings found ✓`);
  return embMap;
}

// ── Step 5: Blend and write to Redis ─────────────────────────────────────────

async function blendAndWrite(candidates, embMap, probe) {
  process.stdout.write(`[5/5] Computing blend and writing to Redis... `);

  // Normalize PageRank across all candidates to [0,1]
  const rawPr = candidates.map(c => c.pr);
  const normPr = normalizePageRank(rawPr);

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const pr        = normPr[i];
    const authority = Math.min(1, c.authority); // already [0,1] but clamp
    const vec       = embMap.get(c.packet_key);
    const attention = vec ? attentionScore(vec, probe) : 0;
    const blend     = W_PR * pr + W_AUTHORITY * authority + W_ATTENTION * attention;
    results.push({ stableKey: c.path, packet_key: c.packet_key, pr, authority, attention, blend });
  }

  results.sort((a, b) => b.blend - a.blend);

  // Top 5 preview
  console.log(`\n  Top 5:`);
  results.slice(0, 5).forEach((r, i) =>
    console.log(`  ${i+1}. ${r.stableKey.slice(0, 60).padEnd(60)} blend=${r.blend.toFixed(3)} PR=${r.pr.toFixed(3)} auth=${r.authority.toFixed(3)} attn=${r.attention.toFixed(3)}`)
  );

  if (DRY_RUN) {
    console.log(`\n  DRY-RUN: ${results.length} scores computed, not written.`);
    return results;
  }

  // Write to Redis hash
  await redis.connect();
  const pipe = redis.pipeline();
  // Clear old scores first
  pipe.del(REDIS_SCORES_KEY);
  for (const r of results) {
    pipe.hset(REDIS_SCORES_KEY, r.stableKey, JSON.stringify({
      stableKey:  r.stableKey,
      packet_key: r.packet_key,
      pr:         r.pr,
      authority:  r.authority,
      attention:  r.attention,
      blend:      r.blend,
    }));
  }
  pipe.expire(REDIS_SCORES_KEY, REDIS_TTL);
  pipe.hset(REDIS_SUMMARY_KEY,
    'computed_at', new Date().toISOString(),
    'count',       String(results.length),
    'limit',       String(LIMIT),
    'pr_source',   'neo4j:pageRankScore',
    'auth_source', 'atlas_packets:authority_score',
    'attn_source', `qdrant:${QDRANT_COL}:content`,
    'blend',       `${W_PR}*PR + ${W_AUTHORITY}*auth + ${W_ATTENTION}*attn`,
  );
  pipe.expire(REDIS_SUMMARY_KEY, REDIS_TTL);
  await pipe.exec();
  await redis.quit().catch(() => {});
  console.log(`  ✓ Written ${results.length} scores to ${REDIS_SCORES_KEY} (TTL 24h)`);
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const probe      = await embedProbe();
    const neo4jTop   = await fetchNeo4jTopN(LIMIT);
    const candidates = await joinAuthority(neo4jTop.slice(0, LIMIT));
    const embMap     = await fetchQdrantEmbeddings(candidates);
    const results    = await blendAndWrite(candidates, embMap, probe);

    console.log(`\n━━━ DONE ━━━`);
    console.log(`  Scored:    ${results.length}`);
    console.log(`  Mode:      ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLIED'}`);
    if (!DRY_RUN) {
      console.log(`  Redis key: ${REDIS_SCORES_KEY}`);
      console.log(`  TTL:       24h`);
    }
  } finally {
    await pool.end();
    if (redis.status === 'ready') await redis.quit().catch(() => {});
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
