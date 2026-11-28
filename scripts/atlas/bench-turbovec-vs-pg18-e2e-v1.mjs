#!/usr/bin/env node
/**
 * Standalone Read-Only Benchmark: TurboVec Shortlist vs PG18 HNSW + FTS + Gemma 4 Citation Audit.
 *
 * FIXTURE_ONLY / UNVERIFIED_DEV_ONLY. Does not write to PostgreSQL, Qdrant, or Neo4j.
 * Usage: node scripts/atlas/bench-turbovec-vs-pg18-e2e-v1.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');

function loadDatabaseUrl() {
  if (process.env.PG18_URL || process.env.DATABASE_URL) {
    return process.env.PG18_URL || process.env.DATABASE_URL;
  }
  const envPath = resolve(ROOT, 'sveltekit-frontend/.env');
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('DATABASE_URL=')) {
      return t.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('DATABASE_URL not found in environment or sveltekit-frontend/.env');
}

const CFG = {
  eg1Url: process.env.EG1_URL || 'http://127.0.0.1:8097/embed',
  turboVecUrl: process.env.TURBOVEC_URL || 'http://127.0.0.1:8791/search',
  llamaBaseUrl: (process.env.LLAMA_BASE_URL || 'http://127.0.0.1:8090').replace(/\/+$/, ''),
  efSearch: Number(process.env.PG18_EF_SEARCH || 100),
  shortlistK: 100,
  topK: 10,
  rrfK: 60,
};

const FIXTURE_QUERIES = [
  { id: 'q1', text: 'Where is canonical RRF fusion implemented in SearchRuntime?' },
  { id: 'q2', text: 'How does zero-hit FTS fallback avoid unindexed substring scans in PG18?' },
  { id: 'q3', text: 'How does tensorrt_bridge.node run AVX2 masked Top-K rescoring?' },
];

const l2Normalize = (vec) => {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
};

const toPgVector = (vec) => `[${vec.join(',')}]`;

async function embedQueryEG1(text) {
  const t0 = performance.now();
  let res = await fetch(CFG.eg1Url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.trim() }),
  });
  if (!res.ok) {
    res = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text.trim() }),
    });
  }
  if (!res.ok) throw new Error(`EG1 HTTP ${res.status}`);
  const json = await res.json();
  const raw = Array.isArray(json.embedding) ? json.embedding : json.embeddings?.[0];
  if (!Array.isArray(raw) || raw.length !== 768) throw new Error('EG1_768D_MISSING');
  const vec768 = l2Normalize(raw);
  const vec128 = l2Normalize(vec768.slice(0, 128));
  return { vec768, vec128, ms: performance.now() - t0 };
}

async function queryTurboVec(vec128, k) {
  const t0 = performance.now();
  try {
    const res = await fetch(CFG.turboVecUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vector: vec128, top_k: k }),
    });
    if (!res.ok) return { ids: [], ms: performance.now() - t0, error: `HTTP_${res.status}` };
    const json = await res.json();
    const ids = (json.results || json.hits || []).map((r) => String(r.id ?? r.chunk_id ?? '')).filter(Boolean);
    return { ids, ms: performance.now() - t0, error: null };
  } catch (err) {
    return { ids: [], ms: performance.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function rescorePg18Exact(client, ids, vec768, topK) {
  const t0 = performance.now();
  if (!ids.length) return { rows: [], ms: 0 };
  const sql = `
    SELECT id::text,
           COALESCE(NULLIF(source_ref, ''), relative_path) AS source_ref,
           content,
           1 - (content_embedding_768 <=> $1::vector) AS cosine
      FROM codebase_chunk_index
     WHERE id::text = ANY($2::text[])
       AND content_embedding_768 IS NOT NULL
     ORDER BY content_embedding_768 <=> $1::vector
     LIMIT $3
  `;
  const { rows } = await client.query(sql, [toPgVector(vec768), ids, topK]);
  return { rows, ms: performance.now() - t0 };
}

async function queryPg18Hnsw(client, vec768, topK) {
  const t0 = performance.now();
  await client.query(`SET LOCAL hnsw.ef_search = ${Math.max(10, Math.min(400, CFG.efSearch))}`);
  const sql = `
    SELECT id::text,
           COALESCE(NULLIF(source_ref, ''), relative_path) AS source_ref,
           content,
           1 - (content_embedding_768 <=> $1::vector) AS cosine
      FROM codebase_chunk_index
     WHERE content_embedding_768 IS NOT NULL
     ORDER BY content_embedding_768 <=> $1::vector
     LIMIT $2
  `;
  const { rows } = await client.query(sql, [toPgVector(vec768), topK]);
  return { rows, ms: performance.now() - t0 };
}

async function queryPg18Fts(client, text, topK) {
  const t0 = performance.now();
  const sql = `
    SELECT id::text,
           COALESCE(NULLIF(source_ref, ''), relative_path) AS source_ref,
           content,
           ts_rank_cd(search_vector, plainto_tsquery('english', $1)) AS fts_score
      FROM codebase_chunk_index
     WHERE search_vector @@ plainto_tsquery('english', $1)
     ORDER BY fts_score DESC
     LIMIT $2
  `;
  const { rows } = await client.query(sql, [text, topK]);
  return { rows, ms: performance.now() - t0 };
}

function fuseRrf(semanticRows, ftsRows, topK) {
  const scores = new Map();
  const byId = new Map();
  semanticRows.forEach((r, idx) => {
    byId.set(r.id, r);
    scores.set(r.id, (scores.get(r.id) || 0) + 1 / (CFG.rrfK + idx + 1));
  });
  ftsRows.forEach((r, idx) => {
    if (!byId.has(r.id)) byId.set(r.id, r);
    scores.set(r.id, (scores.get(r.id) || 0) + 1 / (CFG.rrfK + idx + 1));
  });
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, rrfScore]) => ({ ...byId.get(id), rrfScore }));
}

function overlapAtK(candRows, refRows, k) {
  const refSet = new Set(refRows.slice(0, k).map((r) => r.id));
  if (!refSet.size) return 0;
  return candRows.slice(0, k).filter((r) => refSet.has(r.id)).length / refSet.size;
}

async function resolveLlamaModel() {
  const res = await fetch(`${CFG.llamaBaseUrl}/v1/models`);
  if (!res.ok) throw new Error(`llama /v1/models HTTP ${res.status}`);
  const data = await res.json();
  const id = data?.data?.[0]?.id;
  if (!id) throw new Error('NO_MODEL_ON_LLAMA_SERVER');
  return id;
}

async function recommendWithGemma4(modelId, question, chunks) {
  const t0 = performance.now();
  const admittedIds = new Set(chunks.map((c) => String(c.id)));
  const context = chunks
    .map((c) => `[${c.id}] (${c.source_ref})\n${String(c.content ?? '').slice(0, 600)}`)
    .join('\n\n');
  const res = await fetch(`${CFG.llamaBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.1,
      max_tokens: 160,
      messages: [
        { role: 'system', content: 'Answer concisely using ONLY the provided code chunks. Cite every claim with [chunk_id].' },
        { role: 'user', content: `Question: ${question}\n\nChunks:\n${context}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Gemma4 HTTP ${res.status}`);
  const json = await res.json();
  const answer = json.choices?.[0]?.message?.content || '';
  const cited = [...answer.matchAll(/\[([a-zA-Z0-9_-]+)\]/g)].map((m) => m[1]);
  const unsupportedCitations = cited.filter((id) => !admittedIds.has(id));
  return {
    ms: performance.now() - t0,
    citedIds: [...new Set(cited)],
    unsupportedCitations: [...new Set(unsupportedCitations)],
    citationsValid: cited.length > 0 && unsupportedCitations.length === 0,
  };
}

async function main() {
  const { default: pg } = await import(pathToFileURL(resolve(ROOT, 'sveltekit-frontend/node_modules/pg/lib/index.js')).href);
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl(), max: 1 });
  const client = await pool.connect();
  const llamaModel = await resolveLlamaModel();
  const results = [];

  try {
    await client.query('BEGIN READ ONLY');
    for (const q of FIXTURE_QUERIES) {
      const emb = await embedQueryEG1(q.text);
      const fts = await queryPg18Fts(client, q.text, CFG.topK);
      const tv = await queryTurboVec(emb.vec128, CFG.shortlistK);
      const rescore = await rescorePg18Exact(client, tv.ids, emb.vec768, CFG.topK);
      const hnsw = await queryPg18Hnsw(client, emb.vec768, CFG.topK);
      const fused = fuseRrf(rescore.rows.length ? rescore.rows : hnsw.rows, fts.rows, CFG.topK);
      const gen = await recommendWithGemma4(llamaModel, q.text, fused.slice(0, 5));

      results.push({
        queryId: q.id,
        question: q.text,
        turboVecError: tv.error,
        overlapAt10VsHnsw: overlapAtK(rescore.rows, hnsw.rows, CFG.topK),
        latencyMs: {
          embed: Math.round(emb.ms),
          fts: Math.round(fts.ms),
          pathA_turboVec: Math.round(tv.ms),
          pathA_pg18Rescore: Math.round(rescore.ms),
          pathB_pg18Hnsw: Math.round(hnsw.ms),
          gemma4: Math.round(gen.ms),
        },
        citationAudit: {
          citationsValid: gen.citationsValid,
          citedIds: gen.citedIds,
          unsupportedCitations: gen.unsupportedCitations,
        },
      });
    }
    await client.query('COMMIT');
  } finally {
    client.release();
    await pool.end();
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '');
  const outPath = resolve(ROOT, `.tmp/review/turbovec-vs-pg18-e2e-${ts}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        mode: 'FIXTURE_ONLY',
        authorizationStatus: 'UNVERIFIED_DEV_ONLY',
        fusionOwner: 'SINGLE_RRF_LOCAL_BENCH',
        turboVecRole: 'CHALLENGER_PREFILTER_ONLY_VOTE_0',
        llamaModel,
        config: CFG,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`Receipt written: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
