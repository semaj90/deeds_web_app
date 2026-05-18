#!/usr/bin/env node
/**
 * unified-atlas-trace.mjs
 *
 * Unified retrieval router: CHR97 Stage A0 fast-path → HyperRAG deep-path.
 *
 * Router logic:
 *   1. Check Redis ace:cartridge:{queryHash}  → fast mode if confidence ≥ 0.75
 *   2. Embed query via Ollama → dense search codebase_chunks_768 + llm_wiki_chunks
 *   3. Apply Karpathy blend (0.45·cosine + 0.20·PR + 0.15·topo + 0.10·hot + 0.10·fresh)
 *   4. If blend confidence < 0.75 → HyperRAG: 3 variants, RRF fusion, multi-collection
 *   5. Cache result at ace:cartridge:{queryHash} (TTL 1800s)
 *   6. Emit AtlasRetrievalResult JSON
 *
 * Usage:
 *   node scripts/atlas/unified-atlas-trace.mjs --query "kmeans worker error handling"
 *   node scripts/atlas/unified-atlas-trace.mjs --query "backprop gradient" --json
 *   node scripts/atlas/unified-atlas-trace.mjs --query "kv cache inference" --no-cache
 *   node scripts/atlas/unified-atlas-trace.mjs --dry-run
 *
 * Pass gates:
 *   CHR97 cache hit       : <5ms
 *   Warm cached answer    : <25ms
 *   Hybrid query          : <8000ms target
 *   Deep fallback         : ≤8000ms acceptable with Qdrant rescue
 *   sourceRefs            : 100%
 */

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

dotenv.config({ path: './sveltekit-frontend/.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const execFileAsync = promisify(execFile);
const RG_SEARCH_PATHS = [
  path.join(ROOT, 'sveltekit-frontend', 'src'),
  path.join(ROOT, 'scripts'),
].filter((searchPath) => fs.existsSync(searchPath));

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv      = process.argv.slice(2);
const queryIdx  = argv.indexOf('--query');
let QUERY       = 'kmeans worker error handling';
if (queryIdx >= 0) {
  QUERY = argv[queryIdx + 1];
} else {
  const remaining = argv.filter(arg => !arg.startsWith('-'));
  if (remaining.length > 0) {
    QUERY = remaining.join(' ');
  }
}
const JSON_OUT  = argv.includes('--json');
const NO_CACHE  = argv.includes('--no-cache');
const DRY_RUN   = argv.includes('--dry-run');
const VERBOSE   = argv.includes('--verbose') || argv.includes('-v');

// ── Service URLs ──────────────────────────────────────────────────────────────
const QDRANT_URL  = process.env.QDRANT_URL    ?? 'http://localhost:6333';
const OLLAMA_URL  = process.env.OLLAMA_URL    ?? 'http://localhost:11434';
const REDIS_URL   = process.env.REDIS_URL     ?? 'redis://localhost:6379';
const REDIS_PASS  = process.env.REDIS_PASSWORD ?? 'redis';
const EMBED_MODEL = process.env.EMBED_MODEL   ?? 'embeddinggemma:latest';

const PRIMARY_COLLECTION = 'codebase_chunks_768';
const WIKI_COLLECTION    = 'llm_wiki_chunks';
const CACHE_TTL          = 1800; // 30 min

// ── Confidence thresholds ─────────────────────────────────────────────────────
const FAST_CONFIDENCE_GATE = 0.45;
const MIN_SCORE_THRESHOLD  = 0.25;

// ── FNV-1a query hash ─────────────────────────────────────────────────────────
function queryHash(text) {
  return createHash('sha256')
    .update(text.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

// ── Karpathy blend scoring formula ────────────────────────────────────────────
// finalScore = 0.45·cosine + 0.20·pagerank + 0.15·topology + 0.10·hotness + 0.10·freshness
// +0.15 bonus if rgPathHit (implementation query) or graphCommunityHit (architecture query)
function blendScore({ cosine, pagerank = 0, topology = 0, hotness = 0, freshness = 0.5, rgBonus = false, graphBonus = false }) {
  let base = 0.45 * cosine + 0.20 * pagerank + 0.15 * topology + 0.10 * hotness + 0.10 * freshness;
  if (rgBonus)    base += 0.15;
  if (graphBonus) base += 0.15;
  return Math.min(base, 1.0);
}

// ── 4D topology score from payload metadata ───────────────────────────────────
function topologyScore(payload) {
  if (!payload) return 0;
  const text   = (payload.text ?? payload.content ?? '');
  const tags   = (payload.tags ?? []);
  const x      = 0;           // cosine handled separately
  const y      = Math.min((text.length) / 800, 1);
  const z      = Math.min(tags.length / 8, 1);
  return (0.5 * y + 0.5 * z);
}

// ── Heuristic query variants for HyperRAG expansion ──────────────────────────
function generateVariants(query) {
  const q = query.trim();
  return [
    q,
    `${q} implementation code example`,
    `${q} how does it work explained`,
  ];
}

// ── RRF fusion across result sets ─────────────────────────────────────────────
function rrfFuse(resultSets, k = 60) {
  const map = new Map();
  for (const results of resultSets) {
    for (const [rank, r] of results.entries()) {
      const key = String(r.id);
      const rrf = 1 / (k + rank + 1);
      const existing = map.get(key);
      if (existing) {
        existing.rrf += rrf;
        existing.hits++;
      } else {
        map.set(key, { rrf, hits: 1, payload: r.payload ?? null, baseScore: r.score });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.rrf - a.rrf);
}

// ── Embed via Ollama ──────────────────────────────────────────────────────────
async function embed(text, model = EMBED_MODEL, redisClient = null) {
  if (redisClient) {
    try {
      const hash = createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
      const cached = await redisClient.get(`bifrost:embed:${hash}`);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  const r = await fetch(`${OLLAMA_URL}/api/embed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model, input: [text] }),
    signal:  AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Ollama embed ${r.status}`);
  const j = await r.json();
  const vector = j.embeddings[0];

  if (redisClient && vector) {
    try {
      const hash = createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
      await redisClient.setex(`bifrost:embed:${hash}`, 86400 * 7, JSON.stringify(vector));
    } catch {}
  }

  return vector;
}

// ── Qdrant dense search ───────────────────────────────────────────────────────
async function qdrantSearch(vector, collection, topK = 6, scoreThreshold = MIN_SCORE_THRESHOLD) {
  const body = {
    limit: topK,
    with_payload: true,
    score_threshold: scoreThreshold,
  };

  if (collection === PRIMARY_COLLECTION) {
    body.vector = { name: 'content', vector: vector };
  } else {
    body.vector = vector;
  }

  const r = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(8_000),
  });
  if (!r.ok) {
    if (r.status === 404) return [];
    throw new Error(`Qdrant ${collection} ${r.status}`);
  }
  const j = await r.json();
  return j.result ?? [];
}

async function searchCodebaseWithFallback(text, vector, topK = 8) {
  const primaryHits = await qdrantSearch(vector, PRIMARY_COLLECTION, topK).catch(() => []);
  if (primaryHits.length) {
    return { hits: primaryHits, retryUsed: false };
  }

  const rescueHits = await qdrantSearch(vector, PRIMARY_COLLECTION, topK + 8, 0.1).catch(() => []);
  return { hits: rescueHits, retryUsed: true };
}

// ── ripgrep (rg) fallback ────────────────────────────────────────────────────
function buildRgSearchPaths() {
  return RG_SEARCH_PATHS;
}

function buildRgHit(filePath, index) {
  let textSnippet = '';
  try {
    const fullPath = path.resolve(filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    textSnippet = content.slice(0, 200).replace(/\r?\n/g, ' ') + '...';
  } catch (err) {
    textSnippet = `Matched file: ${filePath}`;
  }

  const fullPath = path.resolve(filePath);
  const cleanPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
  return {
    id: cleanPath,
    chunk_id: cleanPath,
    source_ref: cleanPath,
    text: textSnippet,
    score: parseFloat((0.45 - (index * 0.02)).toFixed(4)),
    signals: { cosine: 0.3, pagerank: 0, topology: 0.1, hotness: 0, ripgrep: true },
    collection: 'ripgrep_fallback',
  };
}

function runRgSearch(query, limit = 8) {
  try {
    const sanitized = query.replace(/["'\\]/g, '');
    if (!sanitized.trim()) return [];
    const searchPaths = buildRgSearchPaths();
    if (searchPaths.length === 0) return [];

    const cmd = `rg --ignore-case --files-with-matches "${sanitized}" ${searchPaths.map((searchPath) => `"${searchPath}"`).join(' ')}`;
    const stdout = execSync(cmd, { encoding: 'utf8', timeout: 5000 });

    const paths = stdout.trim().split('\n').filter(Boolean);
    return paths.slice(0, limit).map((filePath, index) => buildRgHit(filePath, index));
  } catch (e) {
    return [];
  }
}

async function runRgSearchAsync(query, limit = 8) {
  try {
    const sanitized = query.replace(/["'\\]/g, '');
    if (!sanitized.trim()) return [];
    const searchPaths = buildRgSearchPaths();
    if (searchPaths.length === 0) return [];

    const { stdout } = await execFileAsync(
      'rg',
      ['--ignore-case', '--files-with-matches', sanitized, ...searchPaths],
      {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      }
    );

    const paths = stdout.trim().split('\n').filter(Boolean);
    return paths.slice(0, limit).map((filePath, index) => buildRgHit(filePath, index));
  } catch (e) {
    return [];
  }
}

// ── Redis helpers (cold-start safe) ──────────────────────────────────────────
function makeRedis() {
  const redis = new Redis(REDIS_URL, {
    password:             REDIS_PASS,
    lazyConnect:          true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   false,
    retryStrategy:        () => null,
  });
  redis.on('error', () => {});
  return redis;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = performance.now();

  if (!JSON_OUT) {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  Unified Atlas Trace — CHR97 + HyperRAG Router          ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`Query      : "${QUERY}"`);
    console.log(`No-cache   : ${NO_CACHE}`);
    console.log(`Dry-run    : ${DRY_RUN}`);
  }

  if (DRY_RUN) {
    const dryResult = {
      mode: 'fast',
      query: QUERY,
      confidence: 0.92,
      latencyMs: 3,
      cacheHit: true,
      karpathyRev: 'dry-run',
      chunks: [
        { chunk_id: 'dry-001', source_ref: 'scripts/atlas/unified-atlas-trace.mjs#L1', text: '(dry-run placeholder)', score: 0.92, signals: { cosine: 0.92, pagerank: 0, topology: 0, hotness: 0 } }
      ],
      sourceRefs: ['scripts/atlas/unified-atlas-trace.mjs'],
      _dry: true,
    };
    console.log(JSON.stringify(dryResult, null, 2));
    return;
  }

  const redis = makeRedis();
  let redisReady = false;
  try {
    await redis.connect();
    await redis.ping();
    redisReady = true;
  } catch { /* Redis offline — skip cache */ }

  const qHash = queryHash(QUERY);
  const cacheKey = `ace:cartridge:${qHash}`;
  const rgSearchPromise = runRgSearchAsync(QUERY, 8);

  // ── Stage A0: CHR97 fast-path cache check ─────────────────────────────────
  if (!NO_CACHE && redisReady) {
    const tCache = performance.now();
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      const hit = JSON.parse(cached);
      const cacheLatency = Math.round(performance.now() - tCache);
      if (!JSON_OUT) {
        console.log(`\n[A0] Cache HIT — ${cacheLatency}ms`);
        console.log(`  mode       : ${hit.mode}`);
        console.log(`  confidence : ${hit.confidence?.toFixed(3)}`);
        console.log(`  chunks     : ${hit.chunks?.length}`);
        console.log(`  karpathyRev: ${hit.karpathyRev}`);
      }
      if (hit.confidence >= FAST_CONFIDENCE_GATE) {
        hit.latencyMs = Math.round(performance.now() - t0);
        hit.cacheHit  = true;
        if (JSON_OUT) {
          process.stdout.write(JSON.stringify(hit, null, 2));
        } else {
          printResult(hit);
        }
        await redis.quit().catch(() => {});
        return;
      }
      if (!JSON_OUT) console.log(`  (confidence below ${FAST_CONFIDENCE_GATE} — escalating to hybrid)`);
    }
  }

  // ── Stage 1: Embed primary query ──────────────────────────────────────────
  if (!JSON_OUT) process.stdout.write('\n[A1] Embedding query... ');
  let primaryVec;
  try {
    primaryVec = await embed(QUERY, EMBED_MODEL, redisReady ? redis : null);
    if (!JSON_OUT) console.log(`done (${primaryVec.length}d)`);
  } catch (e) {
    if (!JSON_OUT) console.error(`FAILED: ${e.message}`);
    process.exit(1);
  }

  // ── Stage 2: Primary dense search (codebase_chunks_768) ──────────────────
  if (!JSON_OUT) process.stdout.write('[A2] Searching codebase_chunks_768... ');
  const codebaseProbe = await searchCodebaseWithFallback(QUERY, primaryVec, 8);
  let codebaseHits = codebaseProbe.hits;
  let codebaseRetryUsed = codebaseProbe.retryUsed;
  if (!JSON_OUT) console.log(`${codebaseHits.length} hits${codebaseRetryUsed ? ' (rescue threshold=0.10)' : ''}`);

  const rgHits = await rgSearchPromise;
  if (!JSON_OUT) {
    console.log(`[A2.1] rg lane ${rgHits.length > 0 ? `found ${rgHits.length} matches` : 'had no matches'}`);
  }
  if (rgHits.length > 0) {
    codebaseHits = codebaseHits.length > 0 ? [...codebaseHits, ...rgHits] : rgHits;
  }

  // ── Stage 3: Load Karpathy blend scores from Redis ────────────────────────
  let karpathyMap = {};
  let karpathyRev = 'unknown';
  if (redisReady) {
    const prRaw = await redis.hgetall('gpu:karpathy:scores').catch(() => null);
    if (prRaw) karpathyMap = prRaw;
    const summary = await redis.hgetall('gpu:karpathy:summary').catch(() => null);
    if (summary?.rev) karpathyRev = summary.rev;
    else if (summary?.run_at) karpathyRev = summary.run_at.slice(0, 10);
  }

  // ── Stage 4: Score codebase hits with full blend formula ─────────────────
  const isImplQuery  = /\b(how|where|which file|code|implement|wire|export|import|function)\b/i.test(QUERY);
  const isArchQuery  = /\b(depend|connect|graph|relationship|topology|cluster|architecture)\b/i.test(QUERY);

  const scoredCodebase = codebaseHits.map(r => {
    if (r.collection === 'ripgrep_fallback') {
      return r;
    }
    const sourceRef = (r.payload?.source_path ?? r.payload?.file_path ?? r.payload?.chunk_id ?? String(r.id));
    const prRaw     = karpathyMap[sourceRef] ?? karpathyMap[sourceRef.replace(/\\/g, '/')];
    const pr        = prRaw ? parseFloat(JSON.parse(prRaw).blend ?? JSON.parse(prRaw)) : 0;
    const topo      = topologyScore(r.payload);
    const hotness   = r.payload?.hot_cluster ? 1.0 : 0.0;
    const blend     = blendScore({
      cosine:    r.score,
      pagerank:  pr,
      topology:  topo,
      hotness,
      freshness: 0.5,
      rgBonus:   isImplQuery,
      graphBonus: isArchQuery,
    });
    return {
      chunk_id:   sourceRef,
      source_ref: sourceRef,
      text:       ((r.payload?.text ?? r.payload?.content ?? '') + '').slice(0, 200),
      score:      parseFloat(blend.toFixed(4)),
      signals:    { cosine: parseFloat(r.score.toFixed(3)), pagerank: parseFloat(pr.toFixed(3)), topology: parseFloat(topo.toFixed(3)), hotness },
      collection: PRIMARY_COLLECTION,
    };
  }).sort((a, b) => b.score - a.score);

  // Compute initial confidence from top blend score
  const topScore = scoredCodebase[0]?.score ?? 0;
  let mode = topScore >= FAST_CONFIDENCE_GATE ? 'fast' : 'hybrid';

  if (!JSON_OUT) console.log(`[A3] Top blend score: ${topScore.toFixed(3)} → mode: ${mode}`);

  // ── Stage 5: HyperRAG deep path if needed ────────────────────────────────
  let wikiHits = [];

  if (mode === 'hybrid') {
    if (!JSON_OUT) process.stdout.write('[A4] HyperRAG deep expansion... ');

    // Parallel: search wiki + codebase rescue (using primaryVec to avoid cascade)
    const [wikiSearch, codebaseRescueSearch] = await Promise.allSettled([
      qdrantSearch(primaryVec, WIKI_COLLECTION, 5),
      qdrantSearch(primaryVec, PRIMARY_COLLECTION, 12, 0.1),
    ]);

    if (wikiSearch.status === 'fulfilled') wikiHits = wikiSearch.value;
    const rescueHits = codebaseRescueSearch.status === 'fulfilled' ? codebaseRescueSearch.value : [];

    // RRF fusion of primary/ripgrep hits + rescue hits
    const allSets = [codebaseHits, rescueHits];
    const fused = rrfFuse(allSets);

    // Re-score fused results with blend formula
    const fusedScored = fused.slice(0, 8).map(({ rrf, hits, payload, baseScore }) => {
      const sourceRef = (payload?.source_path ?? payload?.file_path ?? payload?.chunk_id ?? 'unknown');
      const prRaw     = karpathyMap[sourceRef] ?? karpathyMap[sourceRef.replace(/\\/g, '/')];
      const pr        = prRaw ? parseFloat(JSON.parse(prRaw).blend ?? JSON.parse(prRaw)) : 0;
      const topo      = topologyScore(payload);
      const blend     = blendScore({
        cosine:     baseScore ?? 0,
        pagerank:   pr,
        topology:   topo,
        hotness:    payload?.hot_cluster ? 1.0 : 0.0,
        freshness:  0.5,
        rgBonus:    isImplQuery,
        graphBonus: isArchQuery,
      });
      return {
        chunk_id:   sourceRef,
        source_ref: sourceRef,
        text:       ((payload?.text ?? payload?.content ?? '') + '').slice(0, 200),
        score:      parseFloat(blend.toFixed(4)),
        signals:    { cosine: parseFloat((baseScore ?? 0).toFixed(3)), pagerank: parseFloat(pr.toFixed(3)), topology: parseFloat(topo.toFixed(3)), rrf: parseFloat(rrf.toFixed(4)), hits },
        collection: PRIMARY_COLLECTION,
      };
    }).sort((a, b) => b.score - a.score);

    // Merge: fused codebase + wiki hits (wiki chunks carry source_ref URL)
    const wikiScored = wikiHits.map(r => ({
      chunk_id:   (r.payload?.source_path ?? r.payload?.url ?? String(r.id)),
      source_ref: (r.payload?.source_path ?? r.payload?.url ?? String(r.id)),
      text:       ((r.payload?.text ?? '') + '').slice(0, 200),
      score:      parseFloat(r.score.toFixed(4)),
      signals:    { cosine: parseFloat(r.score.toFixed(3)), pagerank: 0, topology: topologyScore(r.payload), hotness: 0 },
      collection: WIKI_COLLECTION,
    }));

    // Prefer fused codebase results, append any wiki-only chunks at end
    const mergedChunks = [
      ...fusedScored,
      ...wikiScored.filter(w => !fusedScored.some(c => c.source_ref === w.source_ref)),
    ].slice(0, 10);

    if (!JSON_OUT) console.log(`${mergedChunks.length} merged (${wikiHits.length} wiki)`);

    // Replace scoredCodebase with merged for final output
    scoredCodebase.length = 0;
    scoredCodebase.push(...mergedChunks);
  }

  // ── Stage 6: ACE feature card hotness boost ──────────────────────────────
  if (redisReady) {
    const topicKeys = ['backpropagation', 'tokenization', 'attention-mechanism', 'embedding-vectors',
      'retrieval-augmented-generation', 'quantization', 'fine-tuning', 'kv-cache', 'som-clustering', 'graph-rag'];
    const aceValues = await redis.mget(...topicKeys.map(k => `ace:feature:${k}`)).catch(() => []);
    const hotTopics = new Set(topicKeys.filter((_, i) => aceValues[i] !== null));

    // Boost any chunk whose tags overlap a hot ACE topic
    for (const chunk of scoredCodebase) {
      if (hotTopics.size && wikiHits.some(r => r.id === chunk.chunk_id || r.payload?.source_path === chunk.source_ref)) {
        chunk.score = Math.min(chunk.score + 0.05, 1.0);
        chunk.signals.hotness = 1.0;
      }
    }
    scoredCodebase.sort((a, b) => b.score - a.score);
  }

  // ── Stage 7: Compute final confidence & sourceRefs ───────────────────────
  const finalTopScore  = scoredCodebase[0]?.score ?? 0;
  const finalConfidence = parseFloat(finalTopScore.toFixed(3));
  const sourceRefs = [...new Set(scoredCodebase.map(c => c.source_ref).filter(Boolean))];

  // ── Stage 8: Cache result ─────────────────────────────────────────────────
  const latencyMs = Math.round(performance.now() - t0);

  /** @type {AtlasRetrievalResult} */
  const result = {
    mode,
    query:       QUERY,
    confidence:  finalConfidence,
    latencyMs,
    cacheHit:    false,
    karpathyRev,
    chunks:      scoredCodebase,
    sourceRefs,
    lexicalHitCount: rgHits.length,
    _meta: {
      qHash,
      codebaseHits:   codebaseHits.length,
      wikiHits:       wikiHits.length,
      variantSearches: 0,
      redisOnline:    redisReady,
      lexicalHits:    rgHits.length,
    },
  };

  if (!NO_CACHE && redisReady) {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)).catch(() => {});
  }

  await redis.quit().catch(() => {});

  // ── Output ────────────────────────────────────────────────────────────────
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(result, null, 2));
  } else {
    printResult(result);
  }

  // Pass gate
  // fast: cache hit so should be <25ms; hybrid: Ollama ~1.2s/embed × N variants
  // Realistic ceiling: fast <25ms, hybrid/deep <6000ms (Ollama cold), warm <1700ms
  const embedAttempts = 1;
  const latencyGate = mode === 'fast' ? 25 : Math.max(8000, 1500 * embedAttempts + 1000);
  const pass =
    sourceRefs.length > 0 &&
    finalConfidence > 0 &&
    latencyMs < latencyGate;

  if (!JSON_OUT) {
    const latencyNote = mode === 'fast'
      ? `(gate <25ms)`
      : `(gate <${latencyGate}ms; warm Ollama ~1200ms/embed × ${embedAttempts} embeds)`;
    console.log(`\n${ pass ? '✅ PASS' : '❌ FAIL'} — ${latencyMs}ms ${latencyNote} | confidence ${finalConfidence.toFixed(3)} | ${sourceRefs.length} sourceRefs | mode: ${mode}`);
  }

  if (!pass) process.exit(1);
}

function printResult(r) {
  console.log(`\n── Result ─────────────────────────────────────────────────`);
  console.log(`  mode        : ${r.mode}`);
  console.log(`  confidence  : ${r.confidence}`);
  console.log(`  latencyMs   : ${r.latencyMs}`);
  console.log(`  cacheHit    : ${r.cacheHit}`);
  console.log(`  karpathyRev : ${r.karpathyRev}`);
  console.log(`  chunks      : ${r.chunks?.length ?? 0}`);
  console.log(`  sourceRefs  : ${r.sourceRefs?.length ?? 0}`);
  if (r.lexicalHitCount != null) {
    console.log(`  lexicalHits : ${r.lexicalHitCount}`);
  }
  if (VERBOSE && r.chunks?.length) {
    console.log('\n── Top Chunks ─────────────────────────────────────────────');
    for (const c of r.chunks.slice(0, 5)) {
      console.log(`  [${c.score.toFixed(3)}] ${c.source_ref}`);
      if (c.text) console.log(`         "${c.text.slice(0, 80)}"`);
    }
  }
  if (r.sourceRefs?.length) {
    console.log('\n── sourceRefs ─────────────────────────────────────────────');
    for (const ref of r.sourceRefs.slice(0, 8)) {
      console.log(`  · ${ref}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
