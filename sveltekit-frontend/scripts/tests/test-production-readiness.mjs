#!/usr/bin/env node
/**
 * test-production-readiness.mjs
 *
 * Systemically tests GPU codebase indexing + Gemma4 agentic tool-calling,
 * then writes timestamped .md plans to next_steps/active/ covering:
 *   - Directory consolidation opportunities
 *   - Dead/orphan route surfaces
 *   - Production-readiness gaps
 *
 * Prerequisites:
 *   - Dev server running on :5173 (npm run dev in sveltekit-frontend/)
 *   - Qdrant running on :6333
 *   - Ollama running on :11434 with gemma4-legal-vlm:latest loaded
 *   - Redis running on :6379
 *
 * Usage:
 *   node scripts/tests/test-production-readiness.mjs [--skip-index] [--skip-agent] [--dry-run]
 *
 * Flags:
 *   --skip-index        Skip codebase indexing (use existing Qdrant index)
 *   --skip-agent        Skip agent queries (only run indexing + health checks)
 *   --dry-run           Print plan to stdout instead of writing to next_steps/active/
 *   --turbo             Use TurboQuant on :8090 instead of Ollama :11434
 *   --full-gpu          Enable all GPU pipeline stages: SOM topology, Neo4j sync, PageRank,
 *                       hypergraph build, community detection (adds ~3-5 min)
 *   --require-inference Abort if no LLM backend is reachable (no RAG-only fallback)
 *
 * ### Full GPU Production Readiness Mode
 *
 * `--full-gpu` runs slower but deeper validation of the GPU-backed indexing
 * and retrieval pipeline. Use normal fast mode for daily checks. Use `--full-gpu`
 * before major refactors, releases, schema changes, or retrieval/ranking changes.
 *
 * When enabled the script runs the heavier SOM, Neo4j, PageRank, and hypergraph
 * stages through the orchestrate path, then verifies the pipeline with eight
 * parallel gates:
 *
 *   1. chunk delta          — Qdrant vectors_count before → after
 *   2. dual embedding       — content + signature named vectors present
 *   3. error-vector coverage — has_error=true chunks queryable
 *   4. attention wiring     — queryBmuBoost / _topological_stats in RAG response
 *   5. CUDA post-index      — cuda boolean from SSE complete event
 *   6. SOM topology         — som_bmu_row/col written to Qdrant payload
 *   7. Neo4j edge creation  — SIMILAR_TOPOLOGY edges via /api/graph/som-topology
 *   8. PageRank scoring     — scores in Redis or research-graph API
 *
 * The script also performs GPU cluster synthesis: fetches one representative
 * chunk per top-5 cluster from Qdrant, fires parallel LLM summaries, and
 * embeds the results in the master plan under "GPU Cluster Synthesis".
 *
 * npm run test:prod-readiness:full-gpu
 * npm run test:prod-readiness:full-gpu:turbo
 */

import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureInference, inferenceMarkdownTable } from './ensure-inference.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');   // sveltekit-frontend/
const PLANS_DIR = path.join(ROOT, 'next_steps', 'active');

const DEV_SERVER   = process.env.DEV_SERVER_URL  ?? 'http://localhost:5173';
const TURBO_URL    = process.env.TURBO_URL        ?? 'http://localhost:8090';
const OLLAMA_URL   = process.env.OLLAMA_BASE_URL  ?? 'http://localhost:11434';
const BYPASS_HEADER = { 'x-dev-bypass-auth': 'true' };

const SKIP_INDEX        = process.argv.includes('--skip-index');
const SKIP_AGENT        = process.argv.includes('--skip-agent');
const DRY_RUN           = process.argv.includes('--dry-run');
const USE_TURBO         = process.argv.includes('--turbo');
const FULL_GPU          = process.argv.includes('--full-gpu');
const REQUIRE_INFERENCE = process.argv.includes('--require-inference');
const TIMEOUT_MS        = 120_000;

// ── Colour helpers (no deps) ──────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function ts() { return new Date().toISOString(); }
function stamp() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function fileTs() { return new Date().toISOString().slice(0, 10); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function fetchJson(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    const body = await res.text();
    try { return { ok: res.ok, status: res.status, data: JSON.parse(body) }; }
    catch { return { ok: res.ok, status: res.status, data: body }; }
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

async function postJson(url, body, extra = {}) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...BYPASS_HEADER, ...extra.headers },
    body: JSON.stringify(body),
    timeout: extra.timeout ?? TIMEOUT_MS,
  });
}

// ── SSE consumer — reads an SSE stream to completion, returns the last 'complete' event data ──
// The orchestrate endpoint streams SSE events; we need the final 'complete' event payload.
async function postSseCollect(url, body, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...BYPASS_HEADER },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, data: null, error: text.slice(0, 200) };
    }

    // Collect all SSE lines; parse 'complete' and 'error' events
    const text = await res.text();
    clearTimeout(timer);

    let completeData = null;
    let errorData = null;
    let lastEvent = null;
    const stages = [];

    for (const line of text.split('\n')) {
      if (line.startsWith('event:')) {
        lastEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        try {
          const parsed = JSON.parse(raw);
          if (lastEvent === 'complete') completeData = parsed;
          else if (lastEvent === 'error') errorData = parsed;
          else if (lastEvent === 'stage' && parsed.step) stages.push(parsed.step);
        } catch { /* non-JSON data line */ }
        lastEvent = null;
      }
    }

    if (completeData) {
      return { ok: true, status: res.status, data: { ...completeData, _stages: stages } };
    }
    if (errorData) {
      return { ok: false, status: res.status, data: null, error: errorData.message ?? JSON.stringify(errorData) };
    }
    // Fallback: if no complete event, return what we have
    return { ok: true, status: res.status, data: { _stages: stages, _raw: text.slice(0, 500) } };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

// ── Qdrant helpers — used for cluster count + chunk count ground truth ────────
async function qdrantCollectionInfo(collection = 'codebase_chunks_768') {
  const r = await fetchJson(`http://localhost:6333/collections/${collection}`, { timeout: 5000 });
  return r.ok ? (r.data?.result ?? null) : null;
}

async function qdrantClusterCount(collection = 'codebase_chunks_768') {
  // Count distinct gpu_cluster values by scrolling with aggregation isn't available in v1.
  // Best proxy: scroll a sample and count distinct cluster values.
  const r = await postJson(
    `http://localhost:6333/collections/${collection}/points/scroll`,
    { limit: 50, with_payload: { include: ['gpu_cluster', 'som_cluster', 'cluster_id'] } },
    { timeout: 8000 },
  );
  const pts = r?.data?.result?.points ?? [];
  const clusterIds = new Set(pts.map(p =>
    p.payload?.gpu_cluster ?? p.payload?.som_cluster ?? p.payload?.cluster_id
  ).filter(v => v != null));
  return clusterIds.size;
}

// ── Logging ───────────────────────────────────────────────────────────────────
const results = [];
function log(section, label, status, detail = '', ms = null) {
  const statusStr = status === 'pass'  ? c.green('✅ PASS') :
                    status === 'fail'  ? c.red('❌ FAIL') :
                    status === 'skip'  ? c.dim('⏭  SKIP') :
                    status === 'warn'  ? c.yellow('⚠️  WARN') : c.cyan('ℹ️  INFO');
  const msStr = ms != null ? c.dim(` (${ms}ms)`) : '';
  console.log(`  ${statusStr}  ${c.bold(label)}${msStr}`);
  if (detail) console.log(`         ${c.dim(detail)}`);
  results.push({ section, label, status, detail, ms, time: ts() });
}

function section(title) {
  console.log(`\n${c.cyan('═'.repeat(60))}`);
  console.log(`${c.cyan('█')} ${c.bold(title)}`);
  console.log(`${c.cyan('═'.repeat(60))}`);
}

// ── Phase 1: Health checks ────────────────────────────────────────────────────
async function checkHealth() {
  section('Phase 1 — Service Health');

  const checks = [
    { label: 'Dev server :5173',   url: `${DEV_SERVER}/api/health` },
    { label: 'Qdrant :6333',       url: 'http://localhost:6333/collections' },
    { label: 'Ollama :11434',      url: `${OLLAMA_URL}/api/tags` },
    { label: 'Redis (via dev)',     url: `${DEV_SERVER}/api/cache/exact-match/stats` },
  ];
  if (USE_TURBO) checks.push({ label: 'TurboQuant :8090', url: `${TURBO_URL}/health` });

  const health = {};
  for (const { label, url } of checks) {
    const t0 = Date.now();
    const r = await fetchJson(url, { timeout: 5000 });
    const ms = Date.now() - t0;
    health[label] = r.ok;
    if (r.ok) {
      log('health', label, 'pass', url, ms);
    } else {
      log('health', label, 'fail', r.error ?? `HTTP ${r.status} — ${url}`);
    }
  }
  return health;
}

// ── Phase 2: GPU Codebase Indexing ────────────────────────────────────────────
async function runCodebaseIndex(health) {
  section(`Phase 2 — GPU Codebase Indexing${FULL_GPU ? ' (full pipeline)' : ' (incremental)'}`);

  if (SKIP_INDEX) {
    log('index', 'Codebase indexing', 'skip', '--skip-index flag set');
    return null;
  }
  if (!health['Dev server :5173']) {
    log('index', 'Codebase indexing', 'skip', 'Dev server not running');
    return null;
  }

  // 2a. Pre-index baseline stats — fetch file counts + Qdrant ground truth in parallel
  const [baselineRes, qdrantInfoBefore] = await Promise.all([
    fetchJson(`${DEV_SERVER}/api/codebase-index/stats`, { timeout: 10000 }),
    qdrantCollectionInfo('codebase_chunks_768'),
  ]);
  // Stats endpoint uses totalFiles/indexedFiles; chunk count comes from Qdrant vectors_count
  const filesBefore   = baselineRes.data?.totalFiles ?? baselineRes.data?.indexedFiles ?? 0;
  const chunksBefore  = qdrantInfoBefore?.vectors_count ?? qdrantInfoBefore?.points_count ?? 0;
  if (baselineRes.ok) {
    const s = baselineRes.data;
    log('index', 'Pre-index baseline', 'pass',
      `${filesBefore} indexed files, ${chunksBefore} Qdrant chunks` +
      (s._perf?.simdAvailable != null ? `, simdjson=${s._perf.simdAvailable}` : ''));
  } else {
    log('index', 'Pre-index baseline', 'warn', 'Stats endpoint unreachable — may be first run');
  }

  // 2b. Trigger GPU orchestrate — AST embed + GPU k-means + optional full pipeline stages
  if (FULL_GPU) {
    console.log(`\n  ${c.yellow('⚠️  --full-gpu: SOM topology + Neo4j + PageRank + hypergraph — expect 3-5 min')}`);
  }
  console.log(`\n  ${c.dim('Triggering GPU codebase index orchestration...')}`);
  const t0 = Date.now();
  // Orchestrate streams SSE; postSseCollect reads the stream and extracts the 'complete' event.
  // complete payload: { runId, completedStages, clusterCount, clusterIds, cuda, stageTimings, totalMs }
  const idxRes = await postSseCollect(
    `${DEV_SERVER}/api/codebase-index/orchestrate`,
    {
      scope:          'all',
      clusterCount:   20,
      gpuTag:         true,
      summarize:      false,   // Phase 2c synthesis handles cluster summaries separately
      somTopology:    FULL_GPU,
      neo4jSync:      FULL_GPU,
      pageRank:       FULL_GPU,
      exportWiki:     false,
      hypergraph:     FULL_GPU,
      communityGraph: FULL_GPU,
    },
    FULL_GPU ? 360_000 : 120_000,
  );
  const idxMs = Date.now() - t0;

  if (!idxRes.ok) {
    log('index', 'GPU codebase index', 'fail',
      idxRes.error ?? `HTTP ${idxRes.status}: ${JSON.stringify(idxRes.data).slice(0, 120)}`);
    return null;
  }

  // d comes from the SSE 'complete' event: { clusterCount, completedStages, cuda, stageTimings, totalMs, runId }
  const d = idxRes.data;
  const cudaFlag = d?.cuda ? '🟢 CUDA' : '🔵 CPU';
  const stages   = (d?._stages ?? []).join(', ') || (d?.completedStages ?? []).join(', ') || '?';
  log('index', `GPU codebase index (${FULL_GPU ? 'full' : 'incremental'})`, 'pass',
    `${d?.clusterCount ?? '?'} clusters, ${cudaFlag}, stages: ${stages}`, idxMs);

  // 2c–2j. Verification gates — all independent, run in parallel
  console.log(`\n  ${c.dim('Running verification gates in parallel...')}`);
  const gateT0 = Date.now();

  const [
    _delta,
    _dual,
    _errVec,
    _attn,
    statsAfterSettled,
    _som,
    _neo4j,
    _pr,
  ] = await Promise.allSettled([
    verifyChunkDelta(d, chunksBefore),                                     // 2c
    verifyDualEmbeddings(),                                                // 2d
    verifyErrorVectorSearch(),                                             // 2e
    verifyAttentionScoreWiring(),                                          // 2f
    fetchJson(`${DEV_SERVER}/api/codebase-index/stats`, { timeout: 8000 }), // 2g post-index file count
    FULL_GPU ? verifySomTopology()    : Promise.resolve(null),            // 2h
    FULL_GPU ? verifyNeo4jTopology()  : Promise.resolve(null),            // 2i
    FULL_GPU ? verifyPageRank()       : Promise.resolve(null),            // 2j
  ]);

  // 2g: log post-index file count from the parallel stats fetch; CUDA comes from SSE complete event
  const statsAfter = statsAfterSettled.status === 'fulfilled' ? statsAfterSettled.value : null;
  if (statsAfter?.ok) {
    const s = statsAfter.data;
    const filesAfter = s?.totalFiles ?? s?.indexedFiles ?? '?';
    log('index', 'Post-index file count', 'pass',
      `${filesAfter} files in index` +
      (s?._perf?.simdAvailable != null ? `, simdjson=${s._perf.simdAvailable}` : ''));
  }
  // CUDA status from SSE complete event (the only place the orchestrator reports it)
  if (d?.cuda != null) {
    log('index', 'CUDA acceleration (post-index)', d.cuda ? 'pass' : 'warn',
      d.cuda ? 'GPU CUDA path used for embeddings + k-means' : 'CPU fallback — CUDA unavailable during orchestration');
  }

  log('index', 'Verification gates (parallel)', 'pass',
    `All gates completed in ${Date.now() - gateT0}ms`);

  return { ...d, _statsAfter: statsAfter?.data };
}

// ── 2c: Chunk delta + cluster field present in Qdrant payload ────────────────
async function verifyChunkDelta(indexResult, chunksBefore) {
  // Ground truth: Qdrant vectors_count (not the stats endpoint which tracks files not chunks)
  const [qdrantInfo, observedClusters] = await Promise.all([
    qdrantCollectionInfo('codebase_chunks_768'),
    qdrantClusterCount('codebase_chunks_768'),
  ]);
  const chunksAfter = qdrantInfo?.vectors_count ?? qdrantInfo?.points_count ?? 0;
  const delta       = chunksAfter - chunksBefore;
  // clusterCount comes from SSE complete event payload
  const clusters    = indexResult?.clusterCount ?? observedClusters ?? 0;

  if (chunksAfter === 0) {
    log('index', 'Chunk delta + clusters', 'fail',
      'Zero chunks in Qdrant after indexing — Qdrant unreachable or index empty');
    return;
  }
  log('index', 'Chunk delta + clusters', delta >= 0 ? 'pass' : 'warn',
    `+${delta} chunks (${chunksBefore}→${chunksAfter}), ${clusters} GPU clusters (${observedClusters} observed in sample)`);

  // Verify cluster field actually written into Qdrant payload
  const sampleRes = await postJson(
    'http://localhost:6333/collections/codebase_chunks_768/points/scroll',
    { limit: 5, with_payload: { include: ['som_cluster', 'gpu_cluster', 'cluster_id'] } },
    { timeout: 8000 },
  );
  const pts = sampleRes?.data?.result?.points ?? [];
  const hasCluster = pts.some(p =>
    p.payload?.som_cluster != null || p.payload?.gpu_cluster != null || p.payload?.cluster_id != null
  );
  log('index', 'Cluster field in Qdrant payload', hasCluster ? 'pass' : 'warn',
    hasCluster
      ? `Cluster IDs present in sampled payload (${pts.length} pts)`
      : 'No cluster field found in sampled points — G31 gate may fail');
}

// ── 2d: Dual-embedding — content + signature named vectors ───────────────────
async function verifyDualEmbeddings() {
  const res = await postJson(
    'http://localhost:6333/collections/codebase_chunks_768/points/scroll',
    { limit: 1, with_vectors: true, with_payload: false },
    { timeout: 8000 },
  );
  const pts = res?.data?.result?.points ?? [];
  if (!pts.length) {
    log('index', 'Dual-embedding validation', 'warn', 'No points in codebase_chunks_768 to sample');
    return;
  }
  const vectors = pts[0]?.vector ?? pts[0]?.vectors ?? {};
  if (Array.isArray(vectors)) {
    log('index', 'Dual-embedding validation', 'warn',
      `Single unnamed vector (${vectors.length}-dim) — collection not in named-vector mode`);
  } else if ('content' in vectors && 'signature' in vectors) {
    log('index', 'Dual-embedding validation', 'pass',
      `content=${vectors.content.length}-dim, signature=${vectors.signature.length}-dim`);
  } else {
    log('index', 'Dual-embedding validation', 'warn',
      `Named vectors: [${Object.keys(vectors).join(', ')}] — expected content + signature`);
  }
}

// ── 2e: Error-vector queryability ────────────────────────────────────────────
async function verifyErrorVectorSearch() {
  const res = await postJson(
    'http://localhost:6333/collections/codebase_chunks_768/points/scroll',
    {
      filter: { must: [{ key: 'has_error', match: { value: true } }] },
      limit: 3,
      with_payload: { include: ['file_path', 'error_type', 'has_error'] },
    },
    { timeout: 8000 },
  );
  const pts = res?.data?.result?.points ?? [];
  log('index', 'Error-vector queryability', pts.length > 0 ? 'pass' : 'warn',
    pts.length > 0
      ? `${pts.length} error-tagged chunks in codebase_chunks_768`
      : 'No has_error=true chunks — OK if codebase has 0 tracked errors');
}

// ── 2f: ACE attentionScore wiring — queryBmuBoost in RAG response ─────────────
async function verifyAttentionScoreWiring() {
  const res = await postJson(
    `${DEV_SERVER}/api/rag/search`,
    { query: 'codebase indexer GPU cluster SOM topology', collection: 'codebase_chunks_768', limit: 3 },
    { timeout: 15000, headers: BYPASS_HEADER },
  );
  if (!res.ok) {
    log('index', 'AttentionScore wiring (ACE)', 'warn', `RAG search HTTP ${res.status}`);
    return;
  }
  const chunks = res.data?.chunks ?? res.data?.results ?? [];
  if (!chunks.length) {
    log('index', 'AttentionScore wiring (ACE)', 'warn', 'RAG search 0 chunks — index empty?');
    return;
  }
  const hasTopoStats = chunks.some(ch =>
    ch._topological_stats != null || ch.queryBmuBoost != null ||
    ch.attentionBoost != null || ch.meta?._topological_stats != null
  );
  log('index', 'AttentionScore wiring (ACE)', hasTopoStats ? 'pass' : 'warn',
    hasTopoStats
      ? 'Chunks carry _topological_stats / queryBmuBoost — ACE Phase 8 active'
      : 'No queryBmuBoost in chunks — ACE Phase 8 metadata may be stripped in response');
}

// ── 2h: SOM topology in Qdrant payload (--full-gpu) ──────────────────────────
async function verifySomTopology() {
  const res = await postJson(
    'http://localhost:6333/collections/codebase_chunks_768/points/scroll',
    {
      filter: { must: [{ key: 'som_bmu_row', range: { gte: 0 } }] },
      limit: 3,
      with_payload: { include: ['som_bmu_row', 'som_bmu_col', 'som_cluster'] },
    },
    { timeout: 8000 },
  );
  const pts = res?.data?.result?.points ?? [];
  if (pts.length > 0) {
    const s = pts[0].payload;
    log('index', 'SOM topology (Qdrant)', 'pass',
      `${pts.length} pts with som_bmu — e.g. row=${s.som_bmu_row}, col=${s.som_bmu_col}`);
  } else {
    log('index', 'SOM topology (Qdrant)', 'warn',
      'No som_bmu_row in payload — somTopology stage may not have written BMU coords');
  }
}

// ── 2i: Neo4j SIMILAR_TOPOLOGY edges (--full-gpu) ────────────────────────────
async function verifyNeo4jTopology() {
  const res = await fetchJson(`${DEV_SERVER}/api/graph/som-topology`, { timeout: 10000 });
  if (res.ok && res.data) {
    const edges = res.data?.edgeCount ?? res.data?.edges ?? res.data?.count ?? '?';
    log('index', 'Neo4j SIMILAR_TOPOLOGY edges', 'pass', `${edges} topology edges (G32)`);
  } else {
    log('index', 'Neo4j SIMILAR_TOPOLOGY edges', res.status === 404 ? 'fail' : 'warn',
      res.status === 404
        ? 'GET /api/graph/som-topology → 404 — endpoint missing'
        : `HTTP ${res.status} — Neo4j offline or edge sync not yet run`);
  }
}

// ── 2j: PageRank scores verification (--full-gpu) ────────────────────────────
async function verifyPageRank() {
  const stats = await fetchJson(`${DEV_SERVER}/api/codebase-index/stats`, { timeout: 8000 });
  if (stats.data?.pageRankComputed ?? stats.data?._perf?.pageRankComputed) {
    log('index', 'PageRank scores (Redis)', 'pass',
      `pageRankComputed=true (${stats.data?.pageRankNodes ?? '?'} nodes)`);
    return;
  }
  const rg = await fetchJson(`${DEV_SERVER}/api/analytics/research-graph`, { timeout: 8000 });
  log('index', 'PageRank scores (Redis)',
    (rg.ok && (rg.data?.nodes?.length ?? 0) > 0) ? 'pass' : 'warn',
    (rg.ok && (rg.data?.nodes?.length ?? 0) > 0)
      ? `research-graph API: ${rg.data.nodes.length} ranked nodes`
      : 'PageRank not confirmed — run scripts/run-pagerank.ts or check couchdb:pagerank_scores');
}

// ── Inference auto-start: delegated to shared ensure-inference.mjs ───────────

// ── RAG-only fallback (no LLM) ───────────────────────────────────────────────
// When no LLM backend is available, scroll Qdrant for relevant chunks and
// return them as raw context (no synthesis). Lets the plan files still have
// useful data even when Ollama + TurboQuant are both down.
async function ragOnlyFallback() {
  const QDRANT = 'http://localhost:6333';
  const topics = [
    { id: 'orphan_routes',       query: 'orphan dead unused api route', collection: 'codebase_chunks_768' },
    { id: 'duplicate_services',  query: 'duplicate service redis embedding auth', collection: 'codebase_chunks_768' },
    { id: 'dir_consolidation',   query: 'directory consolidation small lib server', collection: 'codebase_chunks_768' },
    { id: 'auth_gaps',           query: 'missing auth guard locals.user requireAuth', collection: 'codebase_chunks_768' },
    { id: 'prod_blockers',       query: 'todo fixme hardcoded localhost production blocker', collection: 'codebase_chunks_768' },
  ];

  const outputs = {};
  for (const t of topics) {
    const r = await postJson(
      `${QDRANT}/collections/${t.collection}/points/scroll`,
      {
        filter: { must: [{ key: 'tags', match: { any: t.query.split(' ') } }] },
        limit: 5,
        with_payload: { include: ['file_path', 'chunk_text', 'tags', 'domain'] },
      },
      { timeout: 8000 },
    );
    const pts = r?.data?.result?.points ?? [];
    const answer = pts.length
      ? pts.map(p => `- \`${p.payload?.file_path ?? 'unknown'}\`: ${(p.payload?.chunk_text ?? '').slice(0, 200)}`).join('\n')
      : '_No Qdrant chunks found — run codebase indexing first_';
    outputs[t.id] = {
      label: t.id.replace(/_/g, ' '),
      pipeline: 'rag-only',
      answer: `**RAG-only (no LLM synthesis):**\n\n${answer}`,
      toolsUsed: ['qdrant_scroll'],
      rounds: 1,
      sources: pts.map(p => p.payload?.file_path).filter(Boolean),
      ms: 0,
    };
  }
  return outputs;
}

// ── Phase 3: Gemma4 Agentic Tool-Calling ─────────────────────────────────────
async function runAgentQueries(health) {
  section('Phase 3 — Gemma4 Agentic Analysis');

  if (SKIP_AGENT) {
    log('agent', 'Agent queries', 'skip', '--skip-agent flag set');
    return { infResult: null, outputs: {} };
  }

  if (!health['Dev server :5173']) {
    log('agent', 'Agent queries', 'skip', 'Dev server not running');
    return { infResult: null, outputs: {} };
  }

  // If neither Ollama nor TurboQuant is up, attempt auto-start via shared module
  let inferenceMode = 'ollama';
  let infResult = null;

  if (!health['Ollama :11434'] && !(USE_TURBO && health['TurboQuant :8090'])) {
    console.log(`\n  ${c.yellow('⚠️')}  No LLM backend reachable — attempting TurboQuant auto-start...`);
    infResult = await ensureInference({ turbo: true, requireInference: REQUIRE_INFERENCE, baseUrl: TURBO_URL });
    inferenceMode = infResult.ok
      ? (infResult.backend.startsWith('turboquant') ? 'turbo' : 'ollama')
      : 'rag-only';
    if (!infResult.ok) {
      log('agent', 'Inference backend', 'warn',
        `${infResult.reason ?? 'No backend'} — agent queries will use RAG-only context (no LLM synthesis)`);
    } else {
      log('agent', 'Inference backend (auto-started)', 'pass',
        `${infResult.backend} on ${infResult.baseUrl}`);
    }
  } else {
    inferenceMode = (USE_TURBO && health['TurboQuant :8090']) ? 'turbo' : 'ollama';
  }

  if (USE_TURBO && inferenceMode === 'turbo') {
    log(
      'agent',
      'TurboQuant routing',
      'pass',
      '/api/ai/agent requests preferredBackend=turboquant when --turbo is enabled',
    );
  }

  const canCallAgent = inferenceMode !== 'rag-only';
  if (!canCallAgent) {
    if (REQUIRE_INFERENCE) {
      throw new Error('--require-inference: no LLM backend reachable (Ollama + TurboQuant both down)');
    }
    // RAG-only fallback: run a simplified Qdrant scroll per query instead of full agent
    log('agent', 'Agent queries', 'warn',
      'No LLM available — running RAG-only context retrieval as fallback');
    return { infResult, outputs: await ragOnlyFallback() };
  }

  // Analysis prompts targeting production-readiness + consolidation
  const queries = [
    {
      id:       'orphan_routes',
      label:    'Orphan/dead API routes',
      pipeline: 'kag',
      prompt:   'Search the codebase for API routes in src/routes/api/ that appear to have no frontend consumers — ' +
                'routes where no svelte file or client TypeScript file imports or fetches their path. ' +
                'List up to 10 route paths with their HTTP methods. Focus on routes added after Phase 100.',
    },
    {
      id:       'duplicate_services',
      label:    'Duplicate service implementations',
      pipeline: 'rag',
      prompt:   'Find duplicate or near-duplicate service implementations in src/lib/server/. ' +
                'Look for cases where two or more files implement the same concept (e.g., two Redis client singletons, ' +
                'two embedding helpers, two auth guard functions). List each duplicate pair with file paths.',
    },
    {
      id:       'dir_consolidation',
      label:    'Directory consolidation targets',
      pipeline: 'ace',
      prompt:   'Analyze the directory structure of src/lib/ and src/routes/. ' +
                'Which subdirectories have fewer than 3 files and could be merged into a parent directory? ' +
                'Which top-level lib/ subdirectories overlap in purpose (e.g., cache/ and server/cache/)? ' +
                'Return a structured list: directory path, file count, recommended merge target.',
    },
    {
      id:       'auth_gaps',
      label:    'Auth guard coverage gaps',
      pipeline: 'kag',
      prompt:   'Which API routes in src/routes/api/ are missing auth guards (no locals.user check, no requireAuth call, ' +
                'no getSession call)? Exclude routes under auth/, health/, and well-known/. ' +
                'List the route paths and their HTTP handlers.',
    },
    {
      id:       'prod_blockers',
      label:    'Production readiness blockers',
      pipeline: 'ace',
      prompt:   'Identify the top 5 production readiness blockers in this SvelteKit app. ' +
                'Consider: missing error boundaries, hardcoded localhost URLs outside env.server.ts, ' +
                'TODO/FIXME comments in server-side code, routes without Zod validation, ' +
                'and any services that fall back to mock data in production mode. ' +
                'Be specific with file paths.',
    },
  ];

  const agentOutputs = {};

  for (const q of queries) {
    console.log(`\n  ${c.dim(`Running: ${q.label}...`)}`);
    const t0 = Date.now();

    let res = await postJson(
      `${DEV_SERVER}/api/ai/agent`,
      {
        query:    q.prompt,
        pipeline: q.pipeline,
        tools:    ['rag_search', 'case_search', 'memory_recall', 'hyperedge_stats'],
        ...(USE_TURBO && inferenceMode === 'turbo'
          ? { metadata: { preferredBackend: 'turboquant', source: 'test-production-readiness' } }
          : {}),
      },
      { timeout: 90_000 },
    );

    // On timeout/abort: TurboQuant may have just warmed up — retry once
    if (!res.ok && (res.error?.includes('abort') || res.error?.includes('timeout') || res.status === 0)) {
      console.log(`    ${c.yellow('↺')}  Timeout on first attempt — retrying via ${inferenceMode}...`);
      res = await postJson(
        `${DEV_SERVER}/api/ai/agent`,
        {
          query:    q.prompt,
          pipeline: q.pipeline,
          tools:    ['rag_search', 'case_search', 'memory_recall', 'hyperedge_stats'],
          ...(USE_TURBO && inferenceMode === 'turbo'
            ? { metadata: { preferredBackend: 'turboquant', source: 'test-production-readiness' } }
            : {}),
        },
        { timeout: 120_000 },
      );
    }

    const ms = Date.now() - t0;

    if (res.ok && res.data?.answer) {
      log('agent', q.label, 'pass',
        `${res.data.rounds} rounds, tools: ${(res.data.toolsUsed ?? []).join(', ') || 'none'}`, ms);
      agentOutputs[q.id] = {
        query:     q.prompt,
        label:     q.label,
        pipeline:  q.pipeline,
        answer:    res.data.answer,
        toolsUsed: res.data.toolsUsed ?? [],
        rounds:    res.data.rounds,
        sources:   res.data.sources ?? [],
        ms,
      };
    } else {
      const errMsg = res.data?.error ?? res.data?.message ?? res.error ?? `HTTP ${res.status}`;
      log('agent', q.label, 'fail', errMsg.slice(0, 120), ms);
      agentOutputs[q.id] = {
        query:   q.prompt,
        label:   q.label,
        pipeline: q.pipeline,
        answer:  null,
        error:   errMsg,
        ms,
      };
    }
  }

  return { infResult, outputs: agentOutputs };
}

// ── Phase 3b: Per-directory deep audit via agent ─────────────────────────────
// Uses agent rag_search (now including codebase_chunks_768) to generate
// distilled context for each major src/lib subdirectory. Writes individual
// .md context files that Claude can load in future sessions.
async function runDirectoryAudit(health) {
  section('Phase 3b — Per-Directory Deep Audit (GPU RAG + 4D Topology)');

  if (SKIP_AGENT) {
    log('diraudit', 'Directory audit', 'skip', '--skip-agent flag set');
    return {};
  }
  if (!health['Dev server :5173']) {
    log('diraudit', 'Directory audit', 'skip', 'Dev server not running');
    return {};
  }

  // Top-level lib/server subdirectories to audit
  const dirs = [
    { path: 'src/lib/server/ace',        label: 'ACE context assembly',         topic: 'ace' },
    { path: 'src/lib/server/ai',         label: 'AI inference + caching',       topic: 'ai' },
    { path: 'src/lib/server/cache',      label: 'Redis/invalidation cache',     topic: 'cache' },
    { path: 'src/lib/server/graph',      label: 'Graph/hypergraph/community',   topic: 'graph' },
    { path: 'src/lib/server/indexer',    label: 'Codebase indexer + wiki',      topic: 'indexer' },
    { path: 'src/lib/server/retrieval',  label: 'Retrieval/reranking',          topic: 'retrieval' },
    { path: 'src/lib/server/vector',     label: 'Qdrant/vector ops',            topic: 'vector' },
    { path: 'src/lib/services',          label: 'ACP/KnowledgeSearch services', topic: 'services' },
    { path: 'src/routes/api/codebase-index', label: 'Codebase index API',       topic: 'codebase-index-api' },
    { path: 'src/routes/api/ai',         label: 'AI agent API routes',          topic: 'ai-api' },
  ];

  const dirOutputs = {};

  for (const dir of dirs) {
    console.log(`\n  ${c.dim(`Auditing ${dir.path}...`)}`);
    const t0 = Date.now();

    const res = await postJson(
      `${DEV_SERVER}/api/ai/agent`,
      {
        query: `Deep audit of \`${dir.path}\` — ${dir.label}. ` +
          `Search the codebase for all TypeScript files in this directory. ` +
          `For each file: what does it export? What are the main functions/classes? ` +
          `What does it read from (Qdrant collections, Postgres tables, Redis keys, Neo4j labels)? ` +
          `What does it write to? ` +
          `Are there any TODO/FIXME comments, stub implementations, or production gaps? ` +
          `Use rag_search with collection=codebase_chunks_768 to find the actual code chunks. ` +
          `Return a structured summary with: exports, data sources, data sinks, gaps.`,
        pipeline: 'ace',
        tools: ['rag_search', 'memory_recall', 'hyperedge_stats'],
        ...(USE_TURBO && health['TurboQuant :8090']
          ? { metadata: { preferredBackend: 'turboquant', source: 'test-production-readiness' } }
          : {}),
      },
      { timeout: 120_000 },
    );
    const ms = Date.now() - t0;

    if (res.ok && res.data?.answer) {
      log('diraudit', dir.label, 'pass',
        `${res.data.rounds} rounds, ${ms}ms`, ms);
      dirOutputs[dir.topic] = {
        path: dir.path,
        label: dir.label,
        answer: res.data.answer,
        toolsUsed: res.data.toolsUsed ?? [],
        rounds: res.data.rounds,
        ms,
      };
    } else {
      const err = res.data?.error ?? res.data?.message ?? res.error ?? `HTTP ${res.status}`;
      log('diraudit', dir.label, 'warn', err.slice(0, 100), ms);
      dirOutputs[dir.topic] = {
        path: dir.path,
        label: dir.label,
        answer: null,
        error: err,
        ms,
      };
    }
  }

  return dirOutputs;
}

// ── Phase 3c: Trigger cluster summarization ──────────────────────────────────
async function runClusterSummarization(health) {
  section('Phase 3c — Cluster Summarization (TurboQuant / Ollama)');

  if (SKIP_INDEX) {
    log('summarize', 'Cluster summarization', 'skip', '--skip-index flag set');
    return null;
  }
  if (!health['Dev server :5173']) {
    log('summarize', 'Cluster summarization', 'skip', 'Dev server not running');
    return null;
  }

  // Cluster count from Qdrant sample (stats endpoint doesn't expose cluster count)
  const observedClusters = await qdrantClusterCount('codebase_chunks_768');
  const clusterCount = observedClusters > 0 ? observedClusters : 20;

  console.log(`\n  ${c.dim(`Triggering summarization for ${clusterCount} GPU clusters...`)}`);
  const t0 = Date.now();

  const res = await postSseCollect(
    `${DEV_SERVER}/api/codebase-index/orchestrate`,
    {
      scope:        'summarize-only',
      summarize:    true,
      clusterCount,
      exportWiki:   false,
      communityGraph: false,
    },
    180_000,
  );
  const ms = Date.now() - t0;

  if (res.ok) {
    // complete event: { completedStages, clusterCount, stageTimings, totalMs }
    const summaryCount = res.data?.completedStages?.includes('summarize') ? clusterCount : '?';
    log('summarize', 'Cluster summarization', 'pass',
      `${summaryCount} cluster summaries in ${(ms/1000).toFixed(1)}s`, ms);
    return res.data;
  } else {
    log('summarize', 'Cluster summarization', 'warn',
      res.error ?? `HTTP ${res.status}`, ms);
    return null;
  }
}

// ── Phase 3d: Cluster synthesis — top clusters → LLM → plan file section ──────
// Fetches the top-N cluster summaries already stored by runClusterSummarization
// (or scraped fresh from Qdrant), feeds each into the agent/LLM, and returns
// a synthesis map suitable for embedding in the master plan file.
async function runClusterSynthesis(health, indexResult) {
  section('Phase 3d — GPU Cluster Synthesis (LLM per cluster)');

  if (SKIP_INDEX || SKIP_AGENT) {
    log('synthesis', 'Cluster synthesis', 'skip',
      SKIP_INDEX ? '--skip-index set' : '--skip-agent set');
    return {};
  }
  if (!health['Dev server :5173']) {
    log('synthesis', 'Cluster synthesis', 'skip', 'Dev server not running');
    return {};
  }
  if (!health['Ollama :11434'] && !(USE_TURBO && health['TurboQuant :8090'])) {
    log('synthesis', 'Cluster synthesis', 'warn',
      'No LLM backend — skipping synthesis (start Ollama or pass --turbo)');
    return {};
  }

  // Pull top-5 clusters from Qdrant: one representative chunk per cluster,
  // ordered by highest tag_score/payload rank, parallel fetches per cluster id
  // clusterCount from SSE complete event; fall back to Qdrant sample count
  const clusterCount = indexResult?.clusterCount ?? 20;
  const TOP_N = Math.min(5, clusterCount);

  console.log(`\n  ${c.dim(`Fetching representative chunk for top ${TOP_N} clusters in parallel...`)}`);

  const clusterFetches = Array.from({ length: TOP_N }, (_, i) =>
    postJson(
      'http://localhost:6333/collections/codebase_chunks_768/points/scroll',
      {
        filter: {
          must: [{ key: 'gpu_cluster', match: { value: i } }],
        },
        limit: 1,
        with_payload: { include: ['file_path', 'chunk_text', 'tags', 'domain', 'gpu_cluster', 'som_cluster'] },
        order_by: [{ key: 'tag_score', direction: 'desc' }],
      },
      { timeout: 8000 },
    ).catch(() => ({ data: null }))
  );

  const clusterResults = await Promise.allSettled(clusterFetches);

  // For clusters with no chunks, fall back to any cluster field variant
  const representatives = clusterResults.map((r, i) => {
    const pts = r.status === 'fulfilled'
      ? (r.value?.data?.result?.points ?? [])
      : [];
    const pt = pts[0];
    if (!pt) return null;
    return {
      clusterId: i,
      filePath: pt.payload?.file_path ?? 'unknown',
      chunkText: (pt.payload?.chunk_text ?? '').slice(0, 400),
      tags:      (pt.payload?.tags ?? []).slice(0, 6).join(', '),
      domain:    pt.payload?.domain ?? 'unknown',
    };
  }).filter(Boolean);

  if (!representatives.length) {
    log('synthesis', 'Cluster representative fetch', 'warn',
      'No cluster chunks retrieved — index may not have gpu_cluster payloads yet');
    return {};
  }

  log('synthesis', 'Cluster representative fetch', 'pass',
    `${representatives.length} of ${TOP_N} clusters have representative chunks`);

  // Synthesize each cluster in parallel via the /api/ai/agent endpoint
  console.log(`\n  ${c.dim(`Synthesizing ${representatives.length} clusters in parallel via LLM...`)}`);
  const synthT0 = Date.now();

  const synthFetches = representatives.map(rep =>
    postJson(
      `${DEV_SERVER}/api/ai/agent`,
      {
        query: `Cluster ${rep.clusterId} (domain: ${rep.domain}) — representative file: \`${rep.filePath}\`\n` +
               `Tags: ${rep.tags || 'none'}\n\n` +
               `Code excerpt:\n${rep.chunkText}\n\n` +
               `In 2-3 sentences: what does this cluster represent in the codebase? ` +
               `What is its primary responsibility? Are there any production gaps or refactor opportunities?`,
        pipeline: 'rag',
        tools: ['rag_search'],
        ...(USE_TURBO && health['TurboQuant :8090']
          ? { metadata: { preferredBackend: 'turboquant', source: 'test-production-readiness' } }
          : {}),
      },
      { timeout: 60_000 },
    ).catch(e => ({ ok: false, data: { error: e.message } }))
  );

  const synthResults = await Promise.allSettled(synthFetches);
  const synthMs = Date.now() - synthT0;

  const synthMap = {};
  let synthOk = 0;

  for (let i = 0; i < representatives.length; i++) {
    const rep = representatives[i];
    const r = synthResults[i];
    const res = r.status === 'fulfilled' ? r.value : { ok: false, data: { error: 'Promise rejected' } };

    if (res.ok && res.data?.answer) {
      synthMap[rep.clusterId] = {
        clusterId: rep.clusterId,
        filePath:  rep.filePath,
        domain:    rep.domain,
        tags:      rep.tags,
        summary:   res.data.answer,
      };
      synthOk++;
    } else {
      synthMap[rep.clusterId] = {
        clusterId: rep.clusterId,
        filePath:  rep.filePath,
        domain:    rep.domain,
        tags:      rep.tags,
        summary:   null,
        error:     res.data?.error ?? 'LLM unavailable',
      };
    }
  }

  log('synthesis', `Cluster synthesis (${representatives.length} clusters, parallel)`,
    synthOk > 0 ? 'pass' : 'warn',
    `${synthOk}/${representatives.length} synthesized in ${(synthMs/1000).toFixed(1)}s`);

  return synthMap;
}

// ── Phase 4: Static codebase scan ────────────────────────────────────────────
async function staticScan() {
  section('Phase 4 — Static Directory Scan');

  const srcRoutes = path.join(ROOT, 'src', 'routes');
  const srcLib    = path.join(ROOT, 'src', 'lib');

  const scan = {};

  // Count api route groups
  try {
    const { execSync } = await import('child_process');
    const apiDirs = execSync('find src/routes/api -mindepth 1 -maxdepth 1 -type d', {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split('\n').filter(Boolean);
    scan.apiRouteGroups = apiDirs.length;
    log('scan', 'API route groups', 'pass', `${apiDirs.length} top-level groups under api/`);

    // Find tiny dirs (< 3 files) — consolidation candidates
    const tinyDirs = [];
    for (const dir of apiDirs) {
      const files = execSync(`find ${dir} -maxdepth 3 -name "*.ts" -o -name "*.svelte"`, {
        cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim().split('\n').filter(Boolean);
      if (files.length <= 2) tinyDirs.push({ dir, files: files.length });
    }
    scan.tinyApiDirs = tinyDirs;
    log('scan', 'Tiny API dirs (≤2 files)', tinyDirs.length > 5 ? 'warn' : 'pass',
      tinyDirs.slice(0, 6).map(d => `${d.dir}(${d.files})`).join(', ') || 'none');

    // Count lib subdirs
    const libDirs = execSync('find src/lib -mindepth 1 -maxdepth 1 -type d', {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split('\n').filter(Boolean);
    scan.libDirs = libDirs.length;
    log('scan', 'lib/ subdirectories', 'pass', `${libDirs.length} direct children`);

    // Find TODO/FIXME in server code — split into grep + count in JS (avoids shell pipe issues)
    const todoFiles = execSync(
      'grep -rEl "TODO|FIXME|HACK|XXX" --include="*.ts" src/lib/server src/routes/api',
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().split('\n').filter(Boolean);
    scan.serverTodos = todoFiles.length;
    log('scan', 'Server files with TODO/FIXME', scan.serverTodos > 20 ? 'warn' : 'pass',
      `${scan.serverTodos} files`);

    // Find localhost hardcodes outside env.server.ts
    const hardcodedFiles = execSync(
      'grep -rEl "localhost|127\\.0\\.0\\.1" --include="*.ts" src/lib/server src/routes',
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().split('\n').filter(f => f && !f.includes('env.server'));
    scan.hardcodedUrls = hardcodedFiles.length;
    log('scan', 'Hardcoded localhost (non-env)', scan.hardcodedUrls > 0 ? 'warn' : 'pass',
      `${scan.hardcodedUrls} files (should be 0)`);

    // Missing Zod validation — find all +server.ts then grep for zod coverage
    const allRoutes = execSync(
      'find src/routes/api -name "+server.ts"',
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().split('\n').filter(Boolean);
    const zodCovered = execSync(
      'grep -rEl "zod|z\\." --include="+server.ts" src/routes/api',
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().split('\n').filter(Boolean);
    scan.noZodRoutes = Math.max(0, allRoutes.length - zodCovered.length);
    log('scan', 'API routes missing Zod', scan.noZodRoutes > 30 ? 'warn' : 'pass',
      `${scan.noZodRoutes} routes`);

  } catch (e) {
    log('scan', 'Static scan', 'fail', e.message.slice(0, 120));
  }

  return scan;
}

// ── Phase 5a: Write per-directory RAG context files ──────────────────────────
async function writeDirectoryContextFiles(dirOutputs, dateStr, stampStr) {
  section('Phase 5a — Writing Per-Directory Context Files');

  if (!Object.keys(dirOutputs).length) {
    log('dirctx', 'Directory context files', 'skip', 'No directory audit results');
    return [];
  }

  const CONTEXT_DIR = path.join(
    path.resolve(__dirname, '../..'),
    'next_steps', 'active', `${dateStr}-directory-context`
  );

  if (!DRY_RUN && !existsSync(CONTEXT_DIR)) {
    await mkdir(CONTEXT_DIR, { recursive: true });
  }

  const written = [];

  for (const [topic, data] of Object.entries(dirOutputs)) {
    const content = `# Directory Context: \`${data.path}\` — ${stampStr}

> Auto-generated by \`scripts/tests/test-production-readiness.mjs\`
> Agent pipeline: ACE + codebase_chunks_768 RAG
> Tools used: ${(data.toolsUsed ?? []).join(', ') || 'none'}
> Latency: ${data.ms}ms | Rounds: ${data.rounds ?? '?'}

## Summary

**Label:** ${data.label}
**Path:** \`${data.path}\`

## Agent Analysis

${data.answer ?? `_Agent error: ${data.error}_`}

## Usage

Load this file as context when working on \`${data.path}\`:
\`\`\`
Read next_steps/active/${dateStr}-directory-context/${topic}-context.md
\`\`\`

## Quick Audit Commands

\`\`\`bash
# Exports from this directory
rg "^export" ${data.path}/ --type ts -l

# Consumers of this directory
rg "from.*${data.path.split('/').pop()}" src/ --type ts --type svelte -l

# TODOs remaining
rg "TODO|FIXME|HACK" ${data.path}/ --type ts

# DB reads/writes
rg "db\\.|pool\\.query|redis\\.|qdrant\\." ${data.path}/ --type ts
\`\`\`
`;

    const fileName = `${topic}-context.md`;
    if (DRY_RUN) {
      console.log(`  ${c.dim(`[DRY] Would write: ${CONTEXT_DIR}/${fileName}`)}`);
    } else {
      await writeFile(path.join(CONTEXT_DIR, fileName), content, 'utf8');
      log('dirctx', `${topic}-context.md`, 'pass',
        `${data.path} — ${(data.answer ?? '').length} chars`);
    }
    written.push(fileName);
  }

  // Write index file
  const indexContent = `# Directory Context Index — ${stampStr}

> Generated by \`scripts/tests/test-production-readiness.mjs\`

## Available Context Files

${Object.entries(dirOutputs).map(([topic, d]) =>
  `- [\`${topic}-context.md\`](./${topic}-context.md) — \`${d.path}\` (${d.label})`
).join('\n')}

## How to Use

Load the relevant context file before editing a directory:

\`\`\`
Read next_steps/active/${dateStr}-directory-context/<topic>-context.md
\`\`\`

Or load all at session start for full coverage:
\`\`\`bash
ls next_steps/active/${dateStr}-directory-context/
\`\`\`
`;

  if (!DRY_RUN) {
    await writeFile(path.join(CONTEXT_DIR, 'INDEX.md'), indexContent, 'utf8');
    log('dirctx', 'INDEX.md', 'pass', CONTEXT_DIR);
  }

  return written;
}

// ── Phase 5b: Write plan files ────────────────────────────────────────────────
async function writePlans(health, indexResult, agentOutputs, scan, clusterSynth = {}, infResult = null) {
  section('Phase 5 — Writing .md Plans');

  const dateStr  = fileTs();
  const stampStr = stamp();
  const passed   = results.filter(r => r.status === 'pass').length;
  const failed   = results.filter(r => r.status === 'fail').length;
  const warned   = results.filter(r => r.status === 'warn').length;
  const skipped  = results.filter(r => r.status === 'skip').length;

  // ── Master plan ────────────────────────────────────────────────────────────
  const masterPlan = `# Production Readiness Plan — ${stampStr}

> Generated by \`scripts/tests/test-production-readiness.mjs\`
> Commit: \`${await getGitHash()}\`

## Test Run Summary

| Metric | Count |
|--------|-------|
| ✅ Pass | ${passed} |
| ❌ Fail | ${failed} |
| ⚠️  Warn | ${warned} |
| ⏭  Skip | ${skipped} |
| Total checks | ${results.length} |

## Inference Backend

${infResult ? inferenceMarkdownTable(infResult) : '_Inference check not run (backends were already live or agent was skipped)_'}

## Service Health

${results.filter(r => r.section === 'health').map(r =>
  `- **${r.label}**: ${r.status === 'pass' ? '✅' : '❌'} ${r.detail || ''}`
).join('\n')}

## Codebase Index

${indexResult
  ? `- Clusters assigned: ${indexResult.clusterCount ?? '?'}
- GPU CUDA: ${indexResult.cuda ? '✅ yes' : '❌ CPU fallback'}
- Completed stages: ${(indexResult.completedStages ?? indexResult._stages ?? []).join(', ') || '?'}
- Full GPU pipeline: ${FULL_GPU ? 'yes (SOM + Neo4j + PageRank + hypergraph)' : 'no (incremental only)'}`
  : '- Index skipped or failed — run with dev server + Qdrant online'}

## GPU Cluster Synthesis

> Top-5 clusters synthesized by Gemma4 agent from representative Qdrant chunks.
> Re-run with \`--full-gpu\` after hypergraph build for richer SOM-aligned clusters.

${Object.values(clusterSynth).length
  ? Object.values(clusterSynth).map(cs =>
      `### Cluster ${cs.clusterId} — \`${cs.domain}\`\n\n` +
      `**Representative file:** \`${cs.filePath}\`  \n` +
      `**Tags:** ${cs.tags || 'none'}\n\n` +
      (cs.summary
        ? cs.summary
        : `> ❌ Synthesis failed: ${cs.error}`) +
      '\n'
    ).join('\n')
  : '_Cluster synthesis skipped — start Ollama or pass --skip-agent to omit_'}

## Static Scan Results

| Check | Value | Status |
|-------|-------|--------|
| API route groups | ${scan.apiRouteGroups ?? '?'} | ${scan.apiRouteGroups ? '✅' : '?'} |
| Tiny API dirs (≤2 files) | ${scan.tinyApiDirs?.length ?? '?'} | ${(scan.tinyApiDirs?.length ?? 0) > 5 ? '⚠️' : '✅'} |
| lib/ subdirectories | ${scan.libDirs ?? '?'} | ✅ |
| Server files with TODO/FIXME | ${scan.serverTodos ?? '?'} | ${(scan.serverTodos ?? 0) > 20 ? '⚠️' : '✅'} |
| Hardcoded localhost (non-env) | ${scan.hardcodedUrls ?? '?'} | ${(scan.hardcodedUrls ?? 0) > 0 ? '⚠️ needs env.server.ts' : '✅'} |
| API routes missing Zod | ${scan.noZodRoutes ?? '?'} | ${(scan.noZodRoutes ?? 0) > 30 ? '⚠️' : '✅'} |

## Agent Analysis Queries

${Object.values(agentOutputs).map(o =>
  `### ${o.label}\n\n` +
  (o.error
    ? `> ❌ Agent error: ${o.error}\n`
    : `> Pipeline: \`${o.pipeline}\` | Rounds: ${o.rounds} | Tools: ${(o.toolsUsed ?? []).join(', ') || 'none'} | Latency: ${o.ms}ms\n\n${o.answer}`) +
  '\n'
).join('\n') || '_No agent queries ran (Ollama offline or --skip-agent)_'}

## Next Steps Priority Order

1. Fix all ❌ FAIL items above (blocking production)
2. Address ⚠️ WARN items (hardcoded URLs, missing Zod, TODO density)
3. Run directory consolidation plan (see \`${dateStr}-directory-consolidation.md\`)
4. Run auth guard coverage plan (see \`${dateStr}-auth-gaps.md\`)
5. Re-run this script after fixes — target: all PASS, 0 FAIL
`;

  // ── Directory consolidation plan ──────────────────────────────────────────
  const dirPlan = `# Directory Consolidation Plan — ${stampStr}

> Auto-generated from Gemma4 agent analysis + static scan
> Source: \`scripts/tests/test-production-readiness.mjs\`

## Why Consolidate

Small directories (≤2 files) create navigation overhead without structural benefit.
Overlapping lib/ directories (e.g., \`lib/cache/\` vs \`lib/server/cache/\`) cause import confusion.

## Tiny API Route Directories (≤2 files each)

These are candidates to merge into a parent \`misc/\` group or nearest logical sibling:

${(scan.tinyApiDirs ?? []).map(d =>
  `- \`${d.dir}/\` — ${d.files} file(s)`
).join('\n') || '- None found (or scan was skipped)'}

## Agent Analysis: Directory Consolidation

${agentOutputs.dir_consolidation?.answer ?? '_Agent did not run — start Ollama and re-run_'}

## Consolidation Rules

1. **Never move** route files (\`+page.svelte\`, \`+server.ts\`) without updating all fetch() paths
2. **Update barrel exports** (\`index.ts\`) after any lib/ move
3. **Run** \`npm run check\` after every move — 0 errors required before committing
4. **Run** \`node scripts/tests/test-screenshots.mjs\` to verify no 500s introduced

## Immediate Action Items

\`\`\`bash
# 1. Verify each tiny dir has zero consumers before merging
rg "from.*<DIR_NAME>" src/ --type ts --type svelte

# 2. Move files
mv src/routes/api/<small-dir>/* src/routes/api/<parent-dir>/

# 3. Check for broken imports
npm run check

# 4. Run screenshot regression
node scripts/tests/test-screenshots.mjs --all
\`\`\`
`;

  // ── Auth gaps plan ────────────────────────────────────────────────────────
  const authPlan = `# Auth Guard Coverage Plan — ${stampStr}

> Auto-generated from Gemma4 KAG agent analysis
> Source: \`scripts/tests/test-production-readiness.mjs\`

## Current Coverage

Based on CLAUDE.md: **358/386 API routes** (92.7%) have auth guards.
The 28 unguarded routes should be exclusively: auth/, health/, system/ping, .well-known/

## Agent Analysis: Auth Gaps

${agentOutputs.auth_gaps?.answer ?? '_Agent did not run — start Ollama and re-run_'}

## Fix Pattern

Every API route that handles user data MUST contain one of:

\`\`\`typescript
// Pattern A: SvelteKit locals guard
const user = locals.user;
if (!user) throw error(401, 'Unauthorized');

// Pattern B: requireAuth helper
const user = await requireAuth(locals);

// Pattern C: getSession guard
const session = await getSession(event);
if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });
\`\`\`

## Audit Command

\`\`\`bash
# Find +server.ts files without any auth check
for f in $(find src/routes/api -name "+server.ts"); do
  grep -q "locals.user\\|requireAuth\\|getSession" "$f" || echo "UNGUARDED: $f"
done | grep -v "auth/\\|health\\|ping\\|well-known"
\`\`\`
`;

  // ── Production blockers plan ──────────────────────────────────────────────
  const blockersPlan = `# Production Blockers Plan — ${stampStr}

> Auto-generated from Gemma4 ACE agent analysis
> Source: \`scripts/tests/test-production-readiness.mjs\`

## Agent Analysis: Top Blockers

${agentOutputs.prod_blockers?.answer ?? '_Agent did not run — start Ollama and re-run_'}

## Orphan Routes Found

${agentOutputs.orphan_routes?.answer ?? '_Agent did not run — start Ollama and re-run_'}

## Duplicate Services Found

${agentOutputs.duplicate_services?.answer ?? '_Agent did not run — start Ollama and re-run_'}

## Static Scan Findings

${(scan.hardcodedUrls ?? 0) > 0
  ? `### Hardcoded localhost URLs (${scan.hardcodedUrls} files)\n\nRun this to find them:\n\`\`\`bash\ngrep -rl "localhost\\|127\\.0\\.0\\.1" src/lib/server src/routes --include="*.ts" | grep -v env.server\n\`\`\``
  : '### ✅ No hardcoded localhost URLs outside env.server.ts'}

${(scan.serverTodos ?? 0) > 20
  ? `### TODO/FIXME Density (${scan.serverTodos} server files)\n\nHigh density suggests unfinished logic. Audit:\n\`\`\`bash\ngrep -rn "TODO\\|FIXME\\|HACK" src/lib/server src/routes/api\n\`\`\``
  : '### ✅ TODO/FIXME density is acceptable'}

${(scan.noZodRoutes ?? 0) > 30
  ? `### Missing Zod Validation (${scan.noZodRoutes} routes)\n\nAll POST/PATCH/DELETE routes need input validation. Priority: POST routes with DB writes.`
  : '### ✅ Zod coverage is good'}

## Deployment Checklist

- [ ] \`npm run check\` → 0 errors, 0 warnings
- [ ] \`npm run build\` → exit 0
- [ ] \`npm run ci:all\` → exit 0
- [ ] All ❌ in master plan resolved
- [ ] \`node scripts/tests/test-screenshots.mjs --all\` → no 500s
- [ ] Auth guard coverage ≥ 95%
- [ ] Zod validation on all JSON POST routes
- [ ] 0 hardcoded localhost URLs outside env.server.ts
- [ ] Redis + Qdrant + Ollama health endpoints return 200
- [ ] TurboQuant or Ollama inference latency < 60s
`;

  const files = [
    {
      name: `${dateStr}-production-readiness-master.md`,
      content: masterPlan,
    },
    {
      name: `${dateStr}-directory-consolidation.md`,
      content: dirPlan,
    },
    {
      name: `${dateStr}-auth-gaps.md`,
      content: authPlan,
    },
    {
      name: `${dateStr}-production-blockers.md`,
      content: blockersPlan,
    },
  ];

  if (DRY_RUN) {
    console.log(`\n${c.yellow('  DRY RUN — Plans would be written to:')}`);
    for (const f of files) {
      console.log(`    ${c.dim(`next_steps/active/${f.name}`)}`);
      console.log(c.dim('  ' + '─'.repeat(56)));
      console.log(f.content.split('\n').slice(0, 8).map(l => `  ${c.dim(l)}`).join('\n'));
      console.log(c.dim('  [...]'));
    }
  } else {
    if (!existsSync(PLANS_DIR)) {
      await mkdir(PLANS_DIR, { recursive: true });
    }
    for (const f of files) {
      const outPath = path.join(PLANS_DIR, f.name);
      await writeFile(outPath, f.content, 'utf8');
      log('plans', f.name, 'pass', outPath);
    }
  }

  return files.map(f => f.name);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getGitHash() {
  try {
    const { execSync } = await import('child_process');
    return execSync('git rev-parse --short HEAD', {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { return 'unknown'; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(c.bold('\n🔍 Production Readiness Test Suite'));
  console.log(c.dim(`   Dev server: ${DEV_SERVER}`));
  console.log(c.dim(`   Inference:  ${USE_TURBO ? `TurboQuant ${TURBO_URL}` : `Ollama ${OLLAMA_URL}`}`));
  console.log(c.dim(`   Skip index: ${SKIP_INDEX} | Skip agent: ${SKIP_AGENT} | Full GPU: ${FULL_GPU} | Dry run: ${DRY_RUN}`));
  console.log(c.dim(`   Started:    ${stamp()}\n`));

  const t0 = Date.now();

  const health          = await checkHealth();
  const indexResult     = await runCodebaseIndex(health);
  const summarizeResult = await runClusterSummarization(health);
  const clusterSynth    = await runClusterSynthesis(health, indexResult);
  const { infResult, outputs: agentOutputs } = await runAgentQueries(health);
  const dirOutputs      = await runDirectoryAudit(health);
  const scan            = await staticScan();

  const dateStr  = new Date().toISOString().slice(0, 10);
  const stampStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await writeDirectoryContextFiles(dirOutputs, dateStr, stampStr);

  const plans = await writePlans(health, indexResult, agentOutputs, scan, clusterSynth, infResult);

  // ── Final report ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const passed  = results.filter(r => r.status === 'pass').length;
  const failed  = results.filter(r => r.status === 'fail').length;
  const warned  = results.filter(r => r.status === 'warn').length;

  console.log(`\n${c.cyan('═'.repeat(60))}`);
  console.log(c.bold('  Results'));
  console.log(`${c.cyan('═'.repeat(60))}`);
  console.log(`  ${c.green(`✅ ${passed} passed`)}  ${c.red(`❌ ${failed} failed`)}  ${c.yellow(`⚠️  ${warned} warned`)}`);
  console.log(`  Elapsed: ${elapsed}s`);
  if (!DRY_RUN) {
    console.log(`\n  ${c.bold('Plans written:')}`);
    for (const p of plans) {
      console.log(`    ${c.cyan('next_steps/active/')}${p}`);
    }
    const dirCount = Object.keys(dirOutputs).length;
    if (dirCount > 0) {
      console.log(`\n  ${c.bold('Directory context files:')}`);
      console.log(`    ${c.cyan(`next_steps/active/${dateStr}-directory-context/`)} (${dirCount} dirs + INDEX.md)`);
    }
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(c.red('\n❌ Fatal error:'), e.message);
  process.exit(1);
});
