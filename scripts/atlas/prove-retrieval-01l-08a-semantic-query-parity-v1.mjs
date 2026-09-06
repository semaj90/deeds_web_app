#!/usr/bin/env node
/**
 * RETRIEVAL-01L-04 + RETRIEVAL-01L-05, bounded to the PKT-LINEAGE-08A cohort only.
 *
 * Now that RETRIEVAL_01L_CANARY_READY holds (434/434 PostgreSQL<->Qdrant projection parity,
 * see retrieval-01l-08a-cohort-audit-v1.json), this proves the query itself:
 *
 *   RETRIEVAL-01L-04: PostgreSQL + pgvector exact cosine search is the semantic-correctness
 *   oracle for this bounded population. `<=>` is pgvector's cosine-distance operator; no ANN
 *   index is used, so this IS exact nearest-neighbor by construction (no approximation to audit).
 *
 *   RETRIEVAL-01L-05: Qdrant is one executor of the SAME logical semantic lane, run with a
 *   `has_id` filter restricting its HNSW search to exactly the same 434-point population as the
 *   Postgres oracle -- apples-to-apples, not "Qdrant searches its whole 52k-point collection."
 *
 * Frozen query fixture (QueryEmbeddingV1): a fixed, hardcoded query text, embedded once via the
 * canonical embeddiggemma:latest cascade (Ollama /api/embed, per CLAUDE.md's documented embed
 * cascade), with an explicit `queryEmbeddingChecksum` recorded so this exact fixture is
 * reproducible and auditable, not regenerated ad hoc per run.
 *
 * LANE != EXECUTOR: this script treats Postgres-exact and Qdrant as two executors of ONE logical
 * semantic lane. It does not fuse their results, does not call combineViaRRF, and does not
 * produce a second semantic vote -- it only measures whether Qdrant's result set agrees with the
 * Postgres exact oracle (recall@K, rank agreement), which is the correctness question this pass
 * is scoped to answer.
 *
 * Writes: zero. No Postgres/Qdrant/Neo4j/Valkey mutation. Read-only against both stores.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cohortAuditPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-cohort-audit-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-semantic-query-parity-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

// OLLAMA_HOST is often set to a bare "0.0.0.0" (Ollama's own bind-all-interfaces convention, not
// a connectable client address) with no scheme/port -- normalize per CLAUDE.md's documented rule
// rather than trusting it as a ready-to-use URL.
const _ollamaRaw = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
const EMBED_MODEL = 'embeddinggemma:latest';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const COLLECTION = 'codebase_chunks_768_v2';
const VECTOR_NAME = 'content';
const TOP_K = 10;

// Frozen query fixture -- fixed on purpose so this proof is reproducible, not regenerated per run.
const QUERY_TEXT = 'vector similarity search and embedding retrieval architecture for codebase indexing';

const audit = JSON.parse(fs.readFileSync(cohortAuditPath, 'utf8'));
if (audit.status !== 'RETRIEVAL_01L_CANARY_READY') {
  console.error(`BLOCKED_PROJECTION_PARITY_NOT_PROVEN: cohort audit status=${audit.status}`);
  process.exit(1);
}
const candidates = audit.retrievalCohort.candidates;
const cohortIds = candidates.map((c) => c.chunkRowId);
const populationChecksum = sha256(JSON.stringify([...cohortIds].sort()));

// ---- Embed the frozen query text ----
let queryEmbedding;
let embedError = null;
try {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: QUERY_TEXT }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  queryEmbedding = data.embeddings?.[0];
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
    throw new Error(`Unexpected embedding shape: length=${queryEmbedding?.length}`);
  }
} catch (error) {
  embedError = error instanceof Error ? error.message : String(error);
}

if (embedError) {
  const report = {
    schema: 'atlas.retrieval-01l-08a-semantic-query-parity.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    status: 'LIVE_RUNTIME_UNAVAILABLE',
    embedError,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const queryEmbeddingChecksum = sha256(JSON.stringify(queryEmbedding));
const queryVectorLiteral = `[${queryEmbedding.join(',')}]`;

// ---- RETRIEVAL-01L-04: PostgreSQL exact cosine oracle, bounded to exactly the cohort population ----
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });
let postgresExactTopK = [];
let postgresError = null;
const pgStart = Date.now();
try {
  const { rows } = await pool.query(
    `SELECT id::text AS id, (content_embedding <=> $1::halfvec) AS distance
       FROM public.codebase_chunk_index
      WHERE id = ANY($2::uuid[])
      ORDER BY content_embedding <=> $1::halfvec ASC
      LIMIT $3`,
    [queryVectorLiteral, cohortIds, TOP_K],
  );
  postgresExactTopK = rows.map((r) => ({ chunkRowId: r.id, distance: Number(r.distance) }));
} catch (error) {
  postgresError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}
const postgresLatencyMs = Date.now() - pgStart;

// ---- RETRIEVAL-01L-05: Qdrant, same query, same bounded population via has_id filter ----
let qdrantTopK = [];
let qdrantError = null;
const qdrantStart = Date.now();
try {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: VECTOR_NAME, vector: queryEmbedding },
      filter: { must: [{ has_id: cohortIds }] },
      limit: TOP_K,
      with_payload: false,
      with_vector: false,
    }),
  });
  if (!res.ok) throw new Error(`Qdrant search HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  qdrantTopK = (data.result ?? []).map((p) => ({ chunkRowId: String(p.id), score: p.score }));
} catch (error) {
  qdrantError = error instanceof Error ? error.message : String(error);
}
const qdrantLatencyMs = Date.now() - qdrantStart;

// ---- Metrics ----
const pgIds = postgresExactTopK.map((r) => r.chunkRowId);
const qdrantIds = qdrantTopK.map((r) => r.chunkRowId);
const pgIdSet = new Set(pgIds);
const qdrantIdSet = new Set(qdrantIds);
const intersection = pgIds.filter((id) => qdrantIdSet.has(id));
const recallAtK = pgIds.length > 0 ? Number((intersection.length / pgIds.length).toFixed(4)) : null;
const rankParity = pgIds.length > 0 && pgIds.every((id, i) => id === qdrantIds[i]);
const exactSetParity = pgIdSet.size === qdrantIdSet.size && [...pgIdSet].every((id) => qdrantIdSet.has(id));

// MRR here is the average reciprocal rank of EVERY PG-exact top-K item within Qdrant's list (not
// the more common "reciprocal rank of only the first relevant hit") -- under perfect rank parity
// this is the harmonic-mean-like average of 1/1..1/K, NOT 1.0. Documented so a future reader
// doesn't mistake ~0.29 for a parity problem when rankParity/exactSetParity above already say
// agreement is perfect; those two fields are the authoritative parity signal, this MRR is
// supplementary.
let mrr = null;
if (pgIds.length > 0) {
  const reciprocalRanks = pgIds.map((id) => {
    const rank = qdrantIds.indexOf(id);
    return rank === -1 ? 0 : 1 / (rank + 1);
  });
  mrr = Number((reciprocalRanks.reduce((a, b) => a + b, 0) / reciprocalRanks.length).toFixed(4));
}

const status = postgresError || qdrantError
  ? 'AUDIT_FAILED'
  : exactSetParity
    ? 'EXACT_SET_PARITY'
    : recallAtK >= 0.8
      ? 'HIGH_RECALL_APPROXIMATE_PARITY'
      : 'LOW_RECALL_INVESTIGATE';

const report = {
  schema: 'atlas.retrieval-01l-08a-semantic-query-parity.v1',
  gate: 'RETRIEVAL-01L-04/05',
  scope: 'PKT_LINEAGE_08A_COHORT_ONLY',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  canonicalAuthority: false,
  queryFixture: {
    queryText: QUERY_TEXT,
    embedModel: EMBED_MODEL,
    queryEmbeddingChecksum,
    dimension: queryEmbedding.length,
  },
  populationChecksum,
  populationSize: cohortIds.length,
  topK: TOP_K,
  laneOwnership: 'ONE logical semantic lane, TWO executors (postgres-exact oracle, qdrant HNSW). No RRF fusion performed here; no second semantic vote created.',
  postgres: {
    executor: 'pgvector exact cosine (<=>), no ANN index -- exact by construction',
    topK: postgresExactTopK,
    latencyMs: postgresLatencyMs,
    error: postgresError,
  },
  qdrant: {
    executor: 'HNSW, has_id-filtered to the identical 434-point cohort population',
    topK: qdrantTopK,
    latencyMs: qdrantLatencyMs,
    error: qdrantError,
  },
  metrics: {
    recallAtK,
    exactSetParity,
    rankParity,
    mrr,
    intersectionCount: intersection.length,
  },
  status,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  populationSize: report.populationSize,
  topK: TOP_K,
  recallAtK,
  exactSetParity,
  rankParity,
  mrr,
  postgresLatencyMs,
  qdrantLatencyMs,
  out: outPath,
}, null, 2));
process.exitCode = status === 'AUDIT_FAILED' ? 1 : 0;
