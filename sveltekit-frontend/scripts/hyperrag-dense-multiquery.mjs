#!/usr/bin/env node
/**
 * scripts/hyperrag-dense-multiquery.mjs
 *
 * HyperRAG Dense Multi-Query Search Pipeline
 * ============================================
 * Integrates:
 *   - TurboVec (4-bit ANN prefilter via Python sidecar) 
 *   - Qdrant 4D-manifold-filtered dense search
 *   - CouchDB wiki enrichment (GraphRAG rotorquant notes)
 *   - Redis cluster centroid cache (manifold4 topology)
 *   - Karpathy GPU enrich signals (pageRank boost)
 *   - Minified sidecar JSON logs for graph sort audit
 *   - Bitfrost/RotorQuant summary generation
 *
 * Usage:
 *   node scripts/hyperrag-dense-multiquery.mjs --query "retrieval context assembler"
 *   node scripts/hyperrag-dense-multiquery.mjs --query "..." --lanes semantic,kag --top 20
 *   node scripts/hyperrag-dense-multiquery.mjs --query "..." --dry-run
 *
 * ENV:
 *   QDRANT_URL       default http://127.0.0.1:6333
 *   REDIS_URL        default redis://127.0.0.1:6379
 *   OLLAMA_URL       default http://127.0.0.1:11434
 *   COUCH_URL        default http://127.0.0.1:5984
 *   TURBOVEC_SIDECAR default http://127.0.0.1:8792
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
function has(name)  { return args.includes(name); }

const QUERY   = flag('--query') ?? 'retrieval context assembler pipeline';
const LANES   = (flag('--lanes') ?? 'semantic,kag,wiki').split(',');
const TOP_K   = parseInt(flag('--top') ?? '15', 10);
const DRY_RUN = has('--dry-run');
const QUIET   = has('--quiet');

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const REDIS_URL         = process.env.REDIS_URL         ?? 'redis://127.0.0.1:6379';
const OLLAMA_URL        = process.env.OLLAMA_URL        ?? 'http://127.0.0.1:11434';
const COUCH_URL         = process.env.COUCH_URL         ?? 'http://127.0.0.1:5984';
const TURBOVEC_SIDECAR  = process.env.TURBOVEC_SIDECAR  ?? 'http://127.0.0.1:8792';
const BITFROST_URL      = process.env.BITFROST_URL      ?? process.env.TURBOQUANT_URL ?? 'http://127.0.0.1:8090';
const EMBED_MODEL       = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const BITFROST_MODEL     = process.env.BITFROST_MODEL    ?? 'gemma4-rotorquant:latest';
const AUTHORITY_SNAPSHOT_PATH = process.env.AUTHORITY_SNAPSHOT_PATH
  ?? path.join(ROOT, 'logs', 'authority', 'latest.json');

const CODEBASE_COL  = 'codebase_chunks_768';
const GLYPH_COL     = 'glyph_atlas';
const LOG_DIR       = path.join(ROOT, 'logs/hyperrag-stream');

const log  = (...a) => !QUIET && console.log(...a);
const warn = (...a) => console.warn(...a);
const c = {
  g: s => `\x1b[32m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`,
  d: s => `\x1b[2m${s}\x1b[0m`,
  cy: s => `\x1b[36m${s}\x1b[0m`,
};

function normalizeAuthorityPath(raw) {
  if (!raw) return null;
  let value = String(raw).trim().replace(/\\/g, '/');
  if (!value) return null;
  const repoPrefix = 'sveltekit-frontend/';
  if (value.startsWith(repoPrefix)) value = value.slice(repoPrefix.length);
  if (value.startsWith('./')) value = value.slice(2);
  return value.replace(/^\/+/u, '');
}

async function loadAuthoritySnapshot() {
  try {
    if (!fs.existsSync(AUTHORITY_SNAPSHOT_PATH)) return null;
    const raw = await fs.promises.readFile(AUTHORITY_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    const byRef = new Map();
    for (const row of rows) {
      const key = normalizeAuthorityPath(row?.filePath ?? row?.sourceRef ?? row?.rel ?? row?.path);
      if (!key) continue;
      byRef.set(key, row);
    }
    return {
      generatedAt: parsed?.generatedAt ?? null,
      limit: parsed?.limit ?? null,
      sourceCounts: parsed?.sources ?? null,
      byRef,
    };
  } catch {
    return null;
  }
}

function authorityForPayload(payload, snapshot) {
  if (!snapshot) return null;
  const ref = normalizeAuthorityPath(
    payload?.filePath ?? payload?.relativePath ?? payload?.path ?? payload?.source_ref ?? payload?.sourceRef,
  );
  if (!ref) return null;
  return snapshot.byRef.get(ref) ?? null;
}

// ── Ensure log dir ────────────────────────────────────────────────────────────
if (!DRY_RUN) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── Redis ─────────────────────────────────────────────────────────────────────
const { default: Redis } = await import('ioredis');
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 });
let redisOk = false;
try {
  await redis.ping();
  redisOk = true;
  log(`${c.g('✓')} Redis connected`);
} catch {
  warn(`${c.y('⚠')} Redis unavailable — cluster prefilter will be skipped`);
}

// ── Step 1: Embed the query ───────────────────────────────────────────────────
log(`\n${c.b('Step 1')} — Embedding query via Ollama (${EMBED_MODEL})`);

let queryVector = null;
try {
  const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: QUERY }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!embedRes.ok) throw new Error(`HTTP ${embedRes.status}`);
  const embedJson = await embedRes.json();
  queryVector = embedJson.embedding;
  log(`  ${c.g('✓')} Embedded (dim=${queryVector?.length ?? 0})`);
} catch (err) {
  warn(`  ${c.r('✗')} Embedding failed: ${err.message}`);
}

// ── Step 2: TurboVec prefilter (sidecar ANN) ──────────────────────────────────
log(`\n${c.b('Step 2')} — TurboVec 4-bit ANN prefilter sidecar`);

let turbovecIds = [];
let turbovecAvailable = false;
const turbovecIdSet = new Set();
try {
  const tvRes = await fetch(`${TURBOVEC_SIDECAR}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector: queryVector?.slice(0, 64), k: TOP_K * 5 }), // TurboVec on 64d projection
    signal: AbortSignal.timeout(5_000),
  });
  if (tvRes.ok) {
    const tvData = await tvRes.json();
    turbovecIds = tvData.ids ?? [];
    for (const id of turbovecIds) turbovecIdSet.add(String(id));
    turbovecAvailable = true;
    log(`  ${c.g('✓')} TurboVec prefilter: ${turbovecIds.length} candidate IDs`);
  }
} catch {
  log(`  ${c.y('⚠')} TurboVec sidecar not running — skipping ANN prefilter`);
}

// ── Step 3: Load 4D manifold cluster centroids from Redis ─────────────────────
log(`\n${c.b('Step 3')} — Load 4D manifold cluster topology from Redis`);

let manifold4 = [];
let activeClusterFilter = null;

if (redisOk) {
  try {
    const manifoldRaw = await redis.get('cluster:kmeans:k20:manifold4:all').catch(() => null);
    if (manifoldRaw) {
      manifold4 = JSON.parse(manifoldRaw);
      log(`  ${c.g('✓')} Loaded ${manifold4.length} cluster manifold entries`);

      // Find the best matching cluster for our query vector (cosine similarity to centroids)
      if (queryVector && manifold4.length > 0) {
        // Get centroids from Redis
        const centroidsRaw = await redis.get('cluster:kmeans:k20:centroids').catch(() => null);
        if (centroidsRaw) {
          const centroids = JSON.parse(centroidsRaw);
          let bestCluster = 0, bestSim = -Infinity;
          for (let i = 0; i < centroids.length; i++) {
            const cVec = centroids[i];
            if (!cVec || cVec.length !== queryVector.length) continue;
            // Dot product (vectors are normalized by Ollama)
            let dot = 0;
            for (let d = 0; d < queryVector.length; d++) dot += queryVector[d] * cVec[d];
            if (dot > bestSim) { bestSim = dot; bestCluster = i; }
          }
          activeClusterFilter = bestCluster;
          const m = manifold4[bestCluster];
          log(`  ${c.g('✓')} Best cluster: ${bestCluster} (${m?.topoLabel ?? 'unknown'}, SOM ${m?.somRow},${m?.somCol}, sim=${bestSim.toFixed(4)})`);
        }
      }
    } else {
      log(`  ${c.y('⚠')} No manifold4 in Redis — run: npm run graphify:semantic-cluster`);
    }
  } catch (err) {
    warn(`  ${c.y('⚠')} Manifold load error: ${err.message}`);
  }
}

// ── Step 4: Qdrant Multi-Lane Dense Search ────────────────────────────────────
log(`\n${c.b('Step 4')} — Qdrant multi-lane dense search (lanes: ${LANES.join(', ')})`);

const allResults = [];

async function qdrantSearch(collection, vectorName, filter, limit, laneTag) {
  if (!queryVector) return [];
  // glyph_atlas uses unnamed vectors; codebase_chunks_768 uses named 'content'
  const useNamed = vectorName && vectorName !== 'unnamed';
  const body = {
    vector: useNamed ? { name: vectorName, vector: queryVector } : queryVector,
    limit,
    with_payload: true,
    with_vector: false,
    ...(filter ? { filter } : {}),
  };
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (res.status === 400) {
        // Named vector mismatch — retry with bare vector
        if (useNamed) {
          const retry = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, vector: queryVector }),
            signal: AbortSignal.timeout(15_000),
          });
          if (retry.ok) {
            const d2 = await retry.json();
            return (d2.result ?? []).map(pt => ({ ...pt, lane: laneTag }));
          }
        }
        warn(`  Qdrant ${laneTag} HTTP 400 — collection may use different vector schema`);
        return [];
      }
      warn(`  Qdrant ${laneTag} HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.result ?? []).map(pt => ({ ...pt, lane: laneTag }));
  } catch (err) {
    warn(`  Qdrant ${laneTag} error: ${err.message}`);
    return [];
  }
}

// Build cluster filter if we have a best cluster
const clusterFilter = activeClusterFilter !== null
  ? { must: [{ key: 'gpuCluster', match: { value: activeClusterFilter } }] }
  : null;

// Lane A: semantic (codebase_chunks_768, content vector, cluster-filtered)
if (LANES.includes('semantic')) {
  const laneAFilter = clusterFilter; // Use cluster prefilter for efficiency
  const results = await qdrantSearch(CODEBASE_COL, 'content', laneAFilter, TOP_K, 'semantic');
  log(`  ${c.g('✓')} Lane semantic: ${results.length} hits` + (clusterFilter ? ` [cluster ${activeClusterFilter}]` : ''));
  allResults.push(...results);
}

// Lane B: glyph_atlas (directory-level embeddings)
if (LANES.includes('kag')) {
  const results = await qdrantSearch(GLYPH_COL, 'content', null, Math.ceil(TOP_K / 2), 'kag');
  log(`  ${c.g('✓')} Lane kag (glyph_atlas): ${results.length} hits`);
  allResults.push(...results);
}

// Lane C: No-cluster wide search (fallback if cluster filter is too restrictive)
if (LANES.includes('wide') || allResults.length < 3) {
  const results = await qdrantSearch(CODEBASE_COL, 'content', null, TOP_K, 'wide');
  log(`  ${c.y('⚠')} Lane wide fallback: ${results.length} hits`);
  allResults.push(...results);
}

// ── Step 5: Reciprocal Rank Fusion + PageRank boost ───────────────────────────
log(`\n${c.b('Step 5')} — RRF merge + PageRank boost`);

const authoritySnapshot = await loadAuthoritySnapshot();
const scoreMap = new Map(); // id → merged score
const payloadMap = new Map(); // id → payload
const laneMap = new Map(); // id → [lanes]

for (const pt of allResults) {
  const id = String(pt.id);
  const existing = scoreMap.get(id) ?? 0;
  // RRF: 1/(k + rank) — using score as proxy for rank inverse
  const rrfScore = pt.score ?? 0;
  // PageRank boost from Karpathy signals
  const authority = authorityForPayload(pt.payload, authoritySnapshot);
  const pageRank = pt.payload?.pageRank ?? pt.payload?.authority_score ?? authority?.pagerank ?? 0;
  const boosted = rrfScore + pageRank * 0.15 + (turbovecIdSet.has(id) ? 0.1 : 0);
  scoreMap.set(id, Math.max(existing, boosted) + (scoreMap.has(id) ? 0.05 : 0)); // cross-lane bonus
  if (!payloadMap.has(id)) payloadMap.set(id, pt.payload ?? {});
  const lanes = laneMap.get(id) ?? [];
  if (!lanes.includes(pt.lane)) lanes.push(pt.lane);
  laneMap.set(id, lanes);
}

const ranked = [...scoreMap.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_K)
  .map(([id, score]) => ({
    id,
    score: +score.toFixed(4),
    lanes: laneMap.get(id) ?? [],
    payload: payloadMap.get(id) ?? {},
    prefilterHit: turbovecIdSet.has(id),
    authoritySnapshot: authorityForPayload(payloadMap.get(id) ?? {}, authoritySnapshot),
  }));

log(`  ${c.g('✓')} Merged ${allResults.length} → ${ranked.length} unique ranked results`);

// ── Step 6: CouchDB Wiki Enrichment (GraphRAG rotorquant notes) ───────────────
log(`\n${c.b('Step 6')} — CouchDB wiki enrichment (rotorquant GraphRAG notes)`);

let wikiHits = 0;
for (const result of ranked) {
  const dir = result.payload?.dir ?? result.payload?.directoryPath ?? '';
  if (!dir) continue;
  try {
    const wikiKey = `wiki:note:dir:${dir.replace(/\//g, ':')}`;
    const note = redisOk ? await redis.get(wikiKey).catch(() => null) : null;
    if (note) {
      result.payload._wikiNote = JSON.parse(note);
      wikiHits++;
    } else {
      // Try CouchDB directly
      const slug = dir.replace(/\//g, '_');
      const couchRes = await fetch(`${COUCH_URL}/karpathy_wiki/${slug}`, {
        signal: AbortSignal.timeout(3_000),
      }).catch(() => null);
      if (couchRes?.ok) {
        const doc = await couchRes.json();
        result.payload._wikiNote = { summary: doc.content?.slice(0, 300) };
        wikiHits++;
      }
    }
  } catch {}
}
log(`  ${c.g('✓')} Wiki notes enriched: ${wikiHits}/${ranked.length} results`);

// ── Step 7: Minified sidecar JSON (graph sort + log) ─────────────────────────
log(`\n${c.b('Step 7')} — Minified sidecar JSON + graph sort log`);

// Build minified context packet (what gets sent to Bitfrost/rotorquant inference)
const contextPacket = {
  query: QUERY,
  lanes: LANES,
  ts: new Date().toISOString(),
  cluster: activeClusterFilter !== null ? {
    id: activeClusterFilter,
    label: manifold4[activeClusterFilter]?.topoLabel,
    manifold4: manifold4[activeClusterFilter]?.manifold4,
  } : null,
  turbovecPrefilter: turbovecAvailable,
  turbovecCandidates: turbovecIds.slice(0, Math.min(turbovecIds.length, TOP_K * 5)),
  results: ranked.map(r => ({
    id: r.id,
    score: r.score,
    lanes: r.lanes,
    prefilterHit: r.prefilterHit,
    // Minified payload — strip vectors, keep text
    filePath: r.payload?.filePath ?? r.payload?.relativePath,
    dir: r.payload?.dir ?? r.payload?.directoryPath,
    summary: (r.payload?.summary ?? r.payload?.content ?? '').slice(0, 300),
    wikiNote: r.payload?._wikiNote?.summary?.slice(0, 150),
    pageRank: r.authoritySnapshot?.pagerank ?? r.payload?.pageRank ?? r.payload?.authority_score,
    gpuCluster: r.payload?.gpuCluster,
    topoClass: r.payload?.topoClass ?? r.payload?.topo_class,
    authorityCombined: r.authoritySnapshot?.combinedScore ?? null,
    graphAuthority: r.authoritySnapshot?.graphAuthority ?? null,
    aceAuthority: r.authoritySnapshot?.aceAuthority ?? null,
    topology: r.authoritySnapshot?.topology ?? null,
    redisHot: r.authoritySnapshot?.redisHot ?? null,
    authoritySnapshot: r.authoritySnapshot,
  })),
};

const minifiedPacket = {
  query: contextPacket.query,
  ts: contextPacket.ts,
  cluster: contextPacket.cluster,
  turbovecPrefilter: contextPacket.turbovecPrefilter,
  turbovecCandidates: contextPacket.turbovecCandidates.slice(0, 20),
  results: contextPacket.results.slice(0, Math.min(10, contextPacket.results.length)).map((r) => ({
    id: r.id,
    score: r.score,
    lanes: r.lanes,
    prefilterHit: r.prefilterHit,
    filePath: r.filePath,
    dir: r.dir,
    summary: r.summary,
    wikiNote: r.wikiNote,
    pageRank: r.pageRank,
    gpuCluster: r.gpuCluster,
    topoClass: r.topoClass,
  })),
};

async function synthesizeBitfrostSummary(packet) {
  if (!packet.results.length) return null;

  try {
    const res = await fetch(`${BITFROST_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: BITFROST_MODEL,
        temperature: 0.2,
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'Summarize retrieval results for a legal/graph reasoning operator. Return 3 bullets and 1 next action. Keep it terse.',
          },
          {
            role: 'user',
            content: JSON.stringify(packet),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

const bitfrostSummary = await synthesizeBitfrostSummary(minifiedPacket);
if (bitfrostSummary) {
  contextPacket.bitfrostSummary = bitfrostSummary;
  minifiedPacket.bitfrostSummary = bitfrostSummary;
  log(`  ${c.g('✓')} Bitfrost summary synthesized`);
} else {
  log(`  ${c.y('⚠')} Bitfrost summary unavailable — using rank packet only`);
}

if (!DRY_RUN) {
  const logFile = path.join(LOG_DIR, `hyperrag-${Date.now()}.json`);
  fs.writeFileSync(logFile, JSON.stringify(contextPacket, null, 2));
  log(`  ${c.g('✓')} Sidecar log: ${logFile}`);

  // Also write a latest.json for quick inspection
  fs.writeFileSync(path.join(LOG_DIR, 'latest.json'), JSON.stringify(contextPacket, null, 2));
  fs.writeFileSync(path.join(LOG_DIR, 'latest.min.json'), JSON.stringify(minifiedPacket));
}

// ── Step 8: Print results summary ────────────────────────────────────────────
log(`\n${c.b('Step 8')} — Results`);
log(`\n  Query: "${c.cy(QUERY)}"`);
log(`  Active cluster: ${activeClusterFilter !== null ? `${c.g(activeClusterFilter)} (${manifold4[activeClusterFilter]?.topoLabel})` : c.y('none')}`);
log(`  TurboVec sidecar: ${turbovecAvailable ? c.g('active') : c.y('offline')}`);
log(`  Bitfrost summary: ${bitfrostSummary ? c.g('active') : c.y('offline')}`);
log(`\n  ${c.b('Top results:')}`);

for (let i = 0; i < ranked.length; i++) {
  const r = ranked[i];
  const file = r.payload?.filePath ?? r.payload?.relativePath ?? r.id;
  const lanes = r.lanes.join('+');
  const wiki = r.payload?._wikiNote ? c.cy(' [wiki]') : '';
  const pr = r.payload?.pageRank ? c.d(` pr=${r.payload.pageRank.toFixed(3)}`) : '';
  log(`  ${c.d(`[${i + 1}]`)} ${c.g(r.score.toString().padStart(6))}  [${c.cy(lanes)}]${wiki}${pr}`);
  log(`       ${c.d(file)}`);
  if (r.payload?.summary || r.payload?.content) {
    log(`       ${c.d((r.payload?.summary ?? r.payload?.content ?? '').slice(0, 100))}`);
  }
}

await redis.quit().catch(() => {});

log(`\n${c.g('✓')} hyperrag-dense-multiquery complete`);
log(`  Results: ${ranked.length} | Wiki-enriched: ${wikiHits} | Cluster: ${activeClusterFilter ?? 'none'}`);
log(`  → Feed to Bitfrost: cat logs/hyperrag-stream/latest.min.json`);
log(`  → Start TurboVec sidecar: npm run atlas:hyperrag:sidecar`);
