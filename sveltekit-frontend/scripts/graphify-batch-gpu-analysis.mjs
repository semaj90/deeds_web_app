#!/usr/bin/env node
/**
 * graphify-batch-gpu-analysis.mjs
 *
 * 8-stage batch GPU analysis lane for the Graphify codebase-intelligence stack.
 *
 * Stages:
 *   1. Codebase map refresh       — load graph JSON + Redis wiki notes
 *   2. PageRank enrichment        — read CouchDB/LibTorch scores from Redis, write per-file
 *   3. Cluster / SOM audit        — flag files missing cluster or SOM coordinates
 *   4. Glyph generation           — Gemma4 summary + embeddinggemma embed → Qdrant upsert
 *   5. Tag write-back             — merge tags into Qdrant payload + Redis wiki notes
 *   6. ACE hit logging            — increment Redis counters, batch Postgres insert
 *   7. Report generation          — docs/graph/batch-gpu-analysis-report.{json,md}
 *   8. ACE smoke                  — quick retrieval probe to verify directory-cluster hit
 *
 * Usage:
 *   node scripts/graphify-batch-gpu-analysis.mjs
 *   node scripts/graphify-batch-gpu-analysis.mjs --limit 10       # test: first 10 dirs
 *   node scripts/graphify-batch-gpu-analysis.mjs --dry-run        # no writes, audit only
 *   node scripts/graphify-batch-gpu-analysis.mjs --skip-llm       # skip Gemma4 calls
 *   node scripts/graphify-batch-gpu-analysis.mjs --skip-qdrant    # skip Qdrant upsert
 *   node scripts/graphify-batch-gpu-analysis.mjs --skip-ace       # skip ACE smoke
 *
 * Batch defaults (tuned for RTX 3060 Ti / Windows 10 / WSL2):
 *   FILE_BATCH_SIZE      100
 *   EMBED_BATCH_SIZE     16
 *   QDRANT_UPSERT_BATCH  250
 *   SUMMARY_CONCURRENCY  2
 *   TAGGING_CONCURRENCY  4
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path    from 'node:path';
import crypto  from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const LIMIT      = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? args[args.indexOf('--limit') + 1] ?? '0', 10) || 0;
const DRY_RUN    = args.includes('--dry-run');
const SKIP_LLM   = args.includes('--skip-llm');
const SKIP_QDRANT= args.includes('--skip-qdrant');
const SKIP_ACE   = args.includes('--skip-ace');
const QUIET      = args.includes('--quiet');

// ── Config ────────────────────────────────────────────────────────────────────

const OLLAMA_URL   = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const TURBO_URL    = process.env.TURBO_URL       ?? 'http://127.0.0.1:8090';
const QDRANT_URL   = process.env.QDRANT_URL      ?? 'http://127.0.0.1:6333';
const REDIS_URL    = process.env.REDIS_URL        ?? 'redis://127.0.0.1:6379';
const APP_URL      = process.env.APP_URL          ?? 'http://localhost:5173';
const COLLECTION   = 'glyph_atlas'; // dedicated directory-glyph collection (768-dim, embeddinggemma)
const LLM_MODEL    = process.env.OLLAMA_CHAT_MODEL ?? 'gemma4-legal-vlm:latest';
const EMBED_MODEL  = 'embeddinggemma:latest';
const WIKI_TTL     = 24 * 3600;
const GLYPH_TTL    = 6  * 3600;

const SUMMARY_CONCURRENCY = parseInt(process.env.SUMMARY_CONCURRENCY ?? '2', 10);
const TAGGING_CONCURRENCY = parseInt(process.env.TAGGING_CONCURRENCY ?? '4', 10);

const GRAPH_PATH  = path.join(ROOT, 'docs/graph/codebase-graph.json');
const REPORT_DIR  = path.join(ROOT, 'docs/graph');
const REPORT_JSON = path.join(REPORT_DIR, 'batch-gpu-analysis-report.json');
const REPORT_MD   = path.join(REPORT_DIR, 'batch-gpu-analysis-report.md');

// ── Logging ───────────────────────────────────────────────────────────────────

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

const log  = (...a) => !QUIET && console.log(...a);
const warn = (...a) => console.warn(...a);

function stage(n, label) {
  log(`\n${c.bold(c.cyan(`Stage ${n}`))} — ${c.bold(label)}`);
}

// ── Redis ─────────────────────────────────────────────────────────────────────

const { default: Redis } = await import('ioredis');
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 });
try {
  await redis.ping();
  log(`${c.green('✓')} Redis connected`);
} catch {
  warn(`${c.red('✗')} Redis unavailable — aborting`);
  process.exit(1);
}

async function rget(key) {
  try { const v = await redis.get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function rset(key, val, ttl = WIKI_TTL) {
  if (DRY_RUN) return;
  try { await redis.setex(key, ttl, JSON.stringify(val)); } catch { /* non-fatal */ }
}

// ── Stage 1: Load graph JSON + Redis wiki notes ───────────────────────────────

stage(1, 'Codebase map refresh');

if (!existsSync(GRAPH_PATH)) {
  warn(`${c.red('✗')} Graph JSON not found: ${GRAPH_PATH}`);
  warn('Run: npm run graphify:map');
  process.exit(1);
}

const graphJson = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
const files = graphJson.files ?? [];
const dirs  = graphJson.directories ?? [];

log(`  ${c.green('✓')} Graph JSON: ${files.length} files, ${dirs.length} directories`);
log(`  ${c.dim('Created: ' + (graphJson.meta?.createdAt ?? 'unknown'))}`);

// Build directory map from files
const dirMap = new Map();
for (const f of files) {
  const dir = path.dirname(f.rel).replace(/\\/g, '/');
  if (!dirMap.has(dir)) dirMap.set(dir, []);
  dirMap.get(dir).push(f);
}

// Load all wiki notes
const wikiKeys = await redis.keys('wiki:note:dir:*').catch(() => []);
const wikiNotes = new Map();
for (const key of wikiKeys) {
  const note = await rget(key);
  if (note?.directoryPath) wikiNotes.set(note.directoryPath, { key, note });
}
log(`  ${c.green('✓')} Wiki notes: ${wikiNotes.size} loaded from Redis`);

// ── Stage 2: PageRank enrichment ──────────────────────────────────────────────

stage(2, 'PageRank enrichment');

const prRaw = await redis.get('couchdb:pagerank_scores').catch(() => null);
let pageRankScores = {};
let prSource = 'none';

if (prRaw) {
  try {
    pageRankScores = JSON.parse(prRaw);
    prSource = 'couchdb_redis';
    log(`  ${c.green('✓')} CouchDB/LibTorch PageRank: ${Object.keys(pageRankScores).length} scores`);
  } catch {
    log(`  ${c.yellow('○')} PageRank JSON parse failed`);
  }
} else {
  log(`  ${c.yellow('○')} No PageRank in Redis — using fan-in fallback`);
  // Build fan-in based fallback
  const fanInMap = {};
  for (const f of files) {
    for (const imp of f.imports ?? []) {
      fanInMap[imp] = (fanInMap[imp] ?? 0) + 1;
    }
  }
  const total = Object.values(fanInMap).reduce((s, v) => s + v, 0) || 1;
  for (const [rel, fi] of Object.entries(fanInMap)) {
    pageRankScores[rel] = fi / total;
  }
  prSource = 'fanin';
}

// Write per-dir PageRank stats to Redis
const dirPageRank = new Map();
for (const [dir, dfiles] of dirMap) {
  const scores = dfiles.map(f => pageRankScores[f.rel] ?? 0);
  const avg = scores.reduce((s, v) => s + v, 0) / (scores.length || 1);
  const max = Math.max(...scores, 0);
  dirPageRank.set(dir, { avg, max, source: prSource });
}
log(`  ${c.green('✓')} PageRank aggregated for ${dirPageRank.size} directories`);

// ── Stage 3: Cluster / SOM audit ─────────────────────────────────────────────

stage(3, 'Cluster / SOM audit');

let missingCluster = 0, missingSom = 0, missingBoth = 0;
const clusterCounts = {};

for (const f of files) {
  const hasCluster = f.clusterId !== undefined && f.clusterId >= 0;
  const hasSom     = f.somBmuRow !== undefined;
  if (!hasCluster) missingCluster++;
  if (!hasSom)     missingSom++;
  if (!hasCluster && !hasSom) missingBoth++;
  if (hasCluster) clusterCounts[f.clusterId] = (clusterCounts[f.clusterId] ?? 0) + 1;
}

let clusterCount = Object.keys(clusterCounts).length;
log(`  ${c.green('✓')} ${clusterCount} GPU clusters found in graph JSON`);
if (missingCluster > 0) log(`  ${c.yellow('○')} ${missingCluster} files missing clusterId in graph JSON`);
if (missingSom > 0)     log(`  ${c.yellow('○')} ${missingSom} files missing SOM coordinates — run graphify:topology`);
log(`  ${c.dim(`Files both missing: ${missingBoth}`)}`);

// If graph JSON has no cluster info, query Qdrant codebase_chunks_768 for dominant gpuCluster per dir
const dirClusterMap = new Map(); // dir → dominant gpuCluster int
if (clusterCount === 0 && !DRY_RUN) {
  log(`  ${c.dim('Querying Qdrant for gpuCluster assignments…')}`);
  try {
    let offset = null;
    let totalScrolled = 0;
    const dirHits = {}; // dir → { [clusterId]: count }

    while (true) {
      const body = { limit: 500, with_payload: ['filePath', 'relativePath', 'gpuCluster', 'gpu_cluster'], with_vector: false };
      if (offset) body.offset = offset;
      const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) { warn(`  ${c.yellow('⚠')} Qdrant scroll HTTP ${res.status}`); break; }
      const d = await res.json();
      const pts = d.result?.points ?? [];
      totalScrolled += pts.length;

      for (const pt of pts) {
        const fp = pt.payload?.relativePath ?? pt.payload?.filePath ?? '';
        if (!fp) continue;
        const dir = fp.includes('/') ? fp.split('/').slice(0, -1).join('/') : '.';
        const cid = pt.payload?.gpuCluster ?? pt.payload?.gpu_cluster;
        if (cid == null || cid < 0) continue;
        if (!dirHits[dir]) dirHits[dir] = {};
        dirHits[dir][cid] = (dirHits[dir][cid] ?? 0) + 1;
      }

      offset = d.result?.next_page_offset;
      if (!offset || pts.length === 0) break;
    }

    // Dominant cluster per dir = max hits
    for (const [dir, counts] of Object.entries(dirHits)) {
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (dominant) dirClusterMap.set(dir, parseInt(dominant[0], 10));
    }

    clusterCount = new Set(dirClusterMap.values()).size;
    log(`  ${c.green('✓')} Qdrant: ${totalScrolled} chunks → ${dirClusterMap.size} dirs mapped to ${clusterCount} clusters`);

    // Back-fill into files array and wiki notes
    for (const f of files) {
      if ((f.clusterId === undefined || f.clusterId < 0) && f.rel) {
        const fdir = f.rel.includes('/') ? f.rel.split('/').slice(0, -1).join('/') : '.';
        const cid = dirClusterMap.get(fdir);
        if (cid !== undefined) f.clusterId = cid;
      }
    }
  } catch (err) {
    warn(`  ${c.yellow('⚠')} Qdrant cluster lookup failed: ${err.message} — proceeding without cluster data`);
  }
} else if (clusterCount > 0) {
  // Populate dirClusterMap from graph JSON data
  for (const [dir, dfiles] of dirMap) {
    const counts = {};
    for (const f of dfiles) {
      if (f.clusterId !== undefined && f.clusterId >= 0) {
        counts[f.clusterId] = (counts[f.clusterId] ?? 0) + 1;
      }
    }
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (dominant) dirClusterMap.set(dir, parseInt(dominant[0], 10));
  }
}

// ── Stage 4: Glyph generation ─────────────────────────────────────────────────

stage(4, 'Glyph generation (Gemma4 → embed → Qdrant)');

// Determine which directories need glyphs (no cached gemma4Summary)
const needsGlyph = [];
for (const [dir, dfiles] of dirMap) {
  const entry = wikiNotes.get(dir);
  if (!entry?.note?.gemma4Summary || !entry?.note?.embeddingId) {
    const repFiles = dfiles
      .sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0))
      .slice(0, 5)
      .map(f => f.rel);
    if (repFiles.length) needsGlyph.push({ dir, dfiles, repFiles, note: entry?.note ?? null, key: entry?.key ?? null });
  }
}

const glyphTargets = LIMIT > 0 ? needsGlyph.slice(0, LIMIT) : needsGlyph;
log(`  ${c.cyan(`${glyphTargets.length} directories`)} need glyph generation (${needsGlyph.length} total without summary)`);

// ── LLM inference (TurboQuant-first with KV prefix caching) ──────────────────
//
// Token budget: gemma4 thinking models consume ~250-350 tokens on <think> blocks before
// outputting the final answer. num_predict/max_tokens must be >= 500 to clear the think phase.
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS ?? '600', 10);

// Constant system prompt — TurboQuant's cache_prompt:true KV-caches this prefix across
// all directory calls. Saves ~18s of redundant prefill per call after the first.
const GLYPH_SYSTEM_PROMPT =
  'You are a senior TypeScript/SvelteKit architect analysing a legal AI platform codebase. ' +
  'When asked about a directory, respond with exactly 2-3 sentences describing its technical ' +
  'purpose and data flow. Be specific. No markdown headers, no bullet points, plain prose only.';

// Check TurboQuant health once at startup
let turboHealthy = false;
try {
  const hres = await fetch(`${TURBO_URL}/health`, { signal: AbortSignal.timeout(2_000) });
  turboHealthy = hres.ok;
  if (turboHealthy) log(`${c.green('✓')} TurboQuant healthy at ${TURBO_URL} (cache_prompt enabled)`);
} catch { /* not running — will fall back to Ollama */ }

async function callLLM(userPrompt) {
  // 1. TurboQuant (llama.cpp OpenAI-compat) — system prompt KV-cached via cache_prompt:true
  if (turboHealthy) {
    try {
      const res = await fetch(`${TURBO_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: 'system', content: GLYPH_SYSTEM_PROMPT },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens:   LLM_MAX_TOKENS,
          temperature:  0.2,
          cache_prompt: true,  // KV-reuse system prompt prefix across all dir calls
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        const d = await res.json();
        const msg = d.choices?.[0]?.message ?? {};
        // Gemma4 thinking models put the final answer in content; reasoning_content holds <think> block.
        const text = (msg.content ?? '').trim();
        if (text.length > 20) return { summary: text, source: 'turbo' };
        if (text.length === 0 && (msg.reasoning_content ?? '').length > 0) {
          warn(`  ${c.yellow('⚠')} TurboQuant: content empty (think block used all ${LLM_MAX_TOKENS} tokens) — falling back to Ollama`);
          turboHealthy = false; // avoid wasting more calls this run
        }
      } else {
        const errBody = await res.text().catch(() => '');
        warn(`  ${c.yellow('⚠')} TurboQuant HTTP ${res.status}: ${errBody.slice(0, 80)} — falling back to Ollama`);
        turboHealthy = false;
      }
    } catch (err) {
      if (!String(err).includes('ECONNREFUSED') && !String(err).includes('fetch failed')) {
        warn(`  ${c.yellow('⚠')} TurboQuant error (${err.message}) — falling back to Ollama`);
      }
      turboHealthy = false;
    }
  }

  // 2. Ollama chat (system + user split for consistency)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    LLM_MODEL,
        messages: [
          { role: 'system', content: GLYPH_SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
        stream:  false,
        options: { temperature: 0.2, num_predict: LLM_MAX_TOKENS },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.ok) {
      const d = await res.json();
      const text = (d.message?.content ?? d.response ?? '').trim();
      if (text.length > 20) return { summary: text, source: 'ollama' };
      warn(`  ${c.yellow('⚠')} Ollama returned empty response (think tokens > ${LLM_MAX_TOKENS}?) — using placeholder`);
      return { summary: null, source: 'placeholder' };
    }
    const errBody = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${errBody.slice(0, 120)}`);
  } catch (err) {
    warn(`  ${c.yellow('⚠')} LLM unavailable (${err.message}) — using placeholder summary`);
    return { summary: null, source: 'placeholder' };
  }
}

async function embed(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
    const d = await res.json();
    if (!d.embedding?.length) throw new Error('empty embedding');
    return d.embedding;
  } catch (err) {
    throw new Error(`embed failed: ${err.message}`);
  }
}

function dirToPointId(dir) {
  const h = crypto.createHash('sha1').update(`dir-glyph:${dir}`).digest('hex');
  return parseInt(h.slice(0, 7), 16);
}

async function ensureQdrantCollection() {
  if (SKIP_QDRANT || DRY_RUN) return;
  const infoRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5000) });
  if (infoRes.ok) return; // already exists
  const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: 768, distance: 'Cosine' },
      hnsw_config: { m: 16, ef_construct: 64 },
      optimizers_config: { indexing_threshold: 0 },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!createRes.ok) throw new Error(`Qdrant create collection ${createRes.status}: ${await createRes.text()}`);
  log(`  ${c.green('✓')} Created Qdrant collection: ${COLLECTION}`);
}

async function upsertQdrantPoint(id, vector, payload) {
  if (SKIP_QDRANT || DRY_RUN) return;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [{ id, vector, payload }] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Qdrant upsert ${res.status}: ${await res.text()}`);
}

function buildGlyphPrompt(dir, dfiles, note) {
  // User message only — system prompt is constant and sent separately (KV-cached by TurboQuant)
  const repFiles = dfiles.sort((a,b) => (b.fanIn ?? 0) - (a.fanIn ?? 0)).slice(0, 5).map(f => f.rel).join('\n  - ');
  const tags     = [...new Set(dfiles.flatMap(f => f.tags ?? []))].slice(0, 8).join(', ') || 'none';
  const ssrRisk  = dfiles.filter(f => f.ssrUnsafe).length;
  const noTest   = dfiles.filter(f => f.isRoute && !f.hasPairedTest).length;
  const somFile  = dfiles.find(f => f.somBmuRow !== undefined);
  const somHint  = somFile ? ` · SOM grid (${somFile.somBmuRow},${somFile.somBmuCol})` : '';
  return `Directory: ${dir}${somHint}
Representative files (top by fan-in):
  - ${repFiles}

Stats: ${dfiles.length} files, ${ssrRisk} SSR-unsafe, ${noTest} routes without tests
Tags: ${tags}
${note?.warnings?.length ? 'Warnings: ' + note.warnings.slice(0, 3).join('; ') : ''}

Summarise what this directory does and its data flow.`;
}

let glyphOk = 0, glyphFailed = 0;

const DIR_TIMEOUT_MS = 75_000; // hard cap per directory (TurboQuant 90s + embed 30s budget → 75s safe)

function withDirTimeout(promise, dir) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`dir timeout after ${DIR_TIMEOUT_MS / 1000}s`)), DIR_TIMEOUT_MS)
    ),
  ]);
}

async function processGlyphBatch(batch) {
  await Promise.all(batch.map(({ dir, dfiles, note, key }) =>
    withDirTimeout((async () => {
    // In dry-run mode just log what would happen — no LLM, no embed, no writes
    if (DRY_RUN) {
      const hasSummary = !!note?.gemma4Summary;
      log(`  ${c.dim('[dry]')} ${dir.split('/').slice(-2).join('/')} — ${dfiles.length} files, summary=${hasSummary}`);
      glyphOk++;
      return;
    }

    try {
      let summary = note?.gemma4Summary;
      let llmSource = 'cached';

      if (!summary) {
        if (SKIP_LLM) {
          summary = note?.summary ?? `Directory: ${dir} — ${dfiles.length} files`;
          llmSource = 'skip-llm';
        } else {
          const result = await callLLM(buildGlyphPrompt(dir, dfiles, note));
          summary = result.summary ?? note?.summary ?? `Directory: ${dir} — ${dfiles.length} files`;
          llmSource = result.source;
        }
      }

      let vector;
      try {
        vector = await embed(`${dir}: ${summary}`);
      } catch (embedErr) {
        warn(`  ${c.yellow('⚠')} embed failed for ${dir}: ${embedErr.message} — skipping Qdrant upsert`);
        // Still write summary back to Redis if we have one
        if (summary) {
          const noteKey = key ?? `wiki:note:dir:dir:${dir.replace(/[^a-z0-9]/gi, '_')}`;
          const pr = dirPageRank.get(dir) ?? { avg: 0, max: 0, source: 'none' };
          await rset(noteKey, { ...(note ?? {}), directoryPath: dir, gemma4Summary: summary, pageRankAvg: pr.avg, pageRankSource: pr.source, summaryUpdatedAt: new Date().toISOString() }, WIKI_TTL);
        }
        glyphFailed++;
        return;
      }

      const pointId = dirToPointId(dir);
      const pr = dirPageRank.get(dir) ?? { avg: 0, max: 0, source: 'none' };

      // SOM coordinates — use first file that has them as representative coords for this dir
      const somFile   = dfiles.find(f => f.somBmuRow !== undefined);
      const clusterId = note?.clusterId != null && note.clusterId >= 0
        ? note.clusterId
        : (dirClusterMap.get(dir)
            ?? dfiles.find(f => f.clusterId !== undefined && f.clusterId >= 0)?.clusterId
            ?? -1);

      const payload = {
        kind:               'directory-cluster',
        dir,
        gemma4Summary:      summary,
        summary,            // keep for backward compat with ACE consumers that use .summary
        representativeFiles: dfiles.sort((a,b) => (b.fanIn ?? 0) - (a.fanIn ?? 0)).slice(0, 5).map(f => f.rel),
        dominantTags:        [...new Set(dfiles.flatMap(f => f.tags ?? []))].slice(0, 8),
        fileCount:           dfiles.length,
        ssrRisk:             dfiles.filter(f => f.ssrUnsafe).length,
        pairedPct:           dfiles.length ? Math.round(dfiles.filter(f => f.hasPairedTest).length / dfiles.length * 100) : 0,
        clusterId,
        clusterType:         'directory-glyph',
        pageRankAvg:         pr.avg,
        pageRankMax:         pr.max,
        pageRankSource:      pr.source,
        somBmuRow:           somFile?.somBmuRow,
        somBmuCol:           somFile?.somBmuCol,
        somCluster:          somFile?.somCluster,
        llmSource,
        generatedAt:         new Date().toISOString(),
      };

      await upsertQdrantPoint(pointId, vector, payload);

      // Write back to Redis wiki note
      const updatedNote = {
        ...(note ?? {}),
        directoryPath:    dir,
        gemma4Summary:    summary,
        embeddingId:      pointId,
        pageRankAvg:      pr.avg,
        pageRankSource:   pr.source,
        llmSource,
        summaryUpdatedAt: new Date().toISOString(),
      };
      // Key format matches fast-indexer: wiki:note:dir:dir:<slug> where slug replaces all non-alnum with _
      const noteKey = key ?? `wiki:note:dir:dir:${dir.replace(/[^a-z0-9]/gi, '_')}`;
      await rset(noteKey, updatedNote, WIKI_TTL);

      log(`  ${c.green('✓')} ${dir.split('/').slice(-2).join('/')} → id=${pointId} [${llmSource}]`);
      glyphOk++;
    } catch (err) {
      warn(`  ${c.red('✗')} ${dir}: ${err.message}`);
      glyphFailed++;
    }
  })(), dir)
  ));
}

// Ensure Qdrant collection exists before processing
try { await ensureQdrantCollection(); } catch (err) {
  warn(`  ${c.yellow('⚠')} Could not create Qdrant collection "${COLLECTION}": ${err.message} — Qdrant upserts will fail`);
}

// Process in concurrency batches
for (let i = 0; i < glyphTargets.length; i += SUMMARY_CONCURRENCY) {
  await processGlyphBatch(glyphTargets.slice(i, i + SUMMARY_CONCURRENCY));
}
log(`  ${c.green(`${glyphOk} glyphs`)} upserted${glyphFailed ? `, ${c.red(glyphFailed + ' failed')}` : ''}`);

// ── Stage 4.5: NES-arch write-back — agents:dir:* + summary:cluster:* ────────

stage('4.5', 'NES-arch write-back (agents:dir:* + summary:cluster:*)');

// agents:dir:<rel> — NES-arch preflight keys read by getAgentsMdQuickHit() in context-assembler
// Format mirrors generate-agents-md.mjs output so both paths produce the same schema
let agentsWritten = 0;
if (!DRY_RUN) {
  for (const [dir, dfiles] of dirMap) {
    const wikiEntry   = wikiNotes.get(dir);
    const note        = wikiEntry?.note ?? null;
    const summary     = note?.gemma4Summary ?? note?.summary ?? null;
    if (!summary) continue; // skip dirs that have no summary yet (not processed this run)

    const tags        = [...new Set(dfiles.flatMap(f => f.tags ?? []))].slice(0, 12);
    const ssrFiles    = dfiles.filter(f => f.ssrUnsafe).map(f => f.rel.split('/').pop());
    const noTestFiles = dfiles.filter(f => f.isRoute && !f.hasPairedTest).map(f => f.rel.split('/').pop());
    const clusterId   = dirClusterMap.get(dir);

    const agentsMd = [
      `# ${dir}`,
      '',
      `> AGENTS-GEN v1 | files:${dfiles.length} | cluster:${clusterId ?? 'n/a'} | llm:${note?.llmSource ?? 'unknown'}`,
      '',
      '## Summary',
      summary,
      '',
      tags.length ? `## Tags\n${tags.join(', ')}` : null,
      ssrFiles.length ? `## SSR Risks\n${ssrFiles.slice(0, 5).join(', ')}` : null,
      noTestFiles.length ? `## Missing Tests\n${noTestFiles.slice(0, 5).join(', ')}` : null,
    ].filter(l => l !== null).join('\n');

    const agentKey = `agents:dir:${dir.replace(/\\/g, '/')}`;
    await rset(agentKey, agentsMd, 24 * 3600);
    agentsWritten++;
  }
  log(`  ${c.green('✓')} agents:dir:* keys written: ${agentsWritten}`);
} else {
  log(`  ${c.dim('agents:dir:* write skipped (dry-run)')}`);
}

// summary:cluster:<id> — read by /.well-known/llms.txt and /.well-known/llms-full.txt
// Build per-cluster summary by combining wiki notes from dirs in each cluster
const clusterSummaryMap = new Map(); // clusterId → { dirs[], topTags[], summary }
for (const [dir, clusterId] of dirClusterMap) {
  if (clusterId < 0) continue;
  if (!clusterSummaryMap.has(clusterId)) {
    clusterSummaryMap.set(clusterId, { dirs: [], topTags: new Set(), summaries: [], fileCount: 0 });
  }
  const entry   = clusterSummaryMap.get(clusterId);
  const wikiEntry = wikiNotes.get(dir);
  const note    = wikiEntry?.note ?? null;
  const dfiles  = dirMap.get(dir) ?? [];
  entry.dirs.push(dir);
  entry.fileCount += dfiles.length;
  for (const t of (note?.dominantTags ?? [])) entry.topTags.add(t);
  if (note?.gemma4Summary) entry.summaries.push(note.gemma4Summary);
}

let clusterSummariesWritten = 0;
if (!DRY_RUN) {
  for (const [clusterId, entry] of clusterSummaryMap) {
    const combined = entry.summaries.slice(0, 3).join(' ');
    if (!combined) continue;
    const clusterSummary = {
      clusterId,
      dirs:     entry.dirs.slice(0, 10),
      fileCount: entry.fileCount,
      topTags:  [...entry.topTags].slice(0, 10),
      summary:  combined.slice(0, 500),
      generatedAt: new Date().toISOString(),
    };
    await rset(`summary:cluster:${clusterId}`, clusterSummary, GLYPH_TTL);
    clusterSummariesWritten++;
  }
  log(`  ${c.green('✓')} summary:cluster:* keys written: ${clusterSummariesWritten}`);
} else {
  log(`  ${c.dim('summary:cluster:* write skipped (dry-run)')}`);
}

// ── Stage 5: Tag write-back ───────────────────────────────────────────────────

stage(5, 'Tag write-back (Qdrant payload + Redis)');

// Standard semantic tags based on file metadata
function deriveFileTags(f) {
  const tags = new Set(f.tags ?? []);
  if (f.isRoute)       tags.add('route-boundary');
  if (f.isTest)        tags.add('test-pair');
  if (f.ssrUnsafe)     tags.add('ssr-risk');
  if (f.sv4Legacy)     tags.add('svelte4-legacy');
  if (f.hasAuth)       tags.add('auth-guard');
  if (f.hasZod)        tags.add('zod-validation');
  if (!f.hasPairedTest && f.isRoute) tags.add('no-test');
  if ((f.fanIn ?? 0) > 10) tags.add('high-centrality');
  if (f.rel.includes('cache')) tags.add('cache-boundary');
  if (f.rel.includes('grpc')) tags.add('grpc-client');
  if (f.rel.includes('mcp'))  tags.add('mcp-tool');
  if (f.rel.includes('qdrant') || f.rel.includes('vector')) tags.add('qdrant-search');
  if (f.rel.includes('drizzle') || f.rel.includes('schema')) tags.add('drizzle-schema');
  if (f.rel.includes('graph')) tags.add('graphify-viewer');
  return [...tags].slice(0, 20);
}

// Batch Qdrant tag updates — group by first finding existing points, then patching payload
let tagUpdated = 0;
if (!SKIP_QDRANT && !DRY_RUN && glyphTargets.length > 0) {
  try {
    // For each directory that was processed, patch the Qdrant glyph payload with tags
    for (let i = 0; i < glyphTargets.length; i += TAGGING_CONCURRENCY) {
      const batch = glyphTargets.slice(i, i + TAGGING_CONCURRENCY);
      await Promise.all(batch.map(async ({ dir, dfiles }) => {
        const mergedTags = [...new Set(dfiles.flatMap(f => deriveFileTags(f)))].slice(0, 32);
        const pointId = dirToPointId(dir);
        try {
          const res = await fetch(
            `${QDRANT_URL}/collections/${COLLECTION}/points/${pointId}/payload`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ payload: { dominantTags: mergedTags } }),
              signal: AbortSignal.timeout(8_000),
            }
          );
          if (res.ok) tagUpdated++;
        } catch { /* non-fatal */ }
      }));
    }
    log(`  ${c.green('✓')} Tags patched on ${tagUpdated} Qdrant points`);
  } catch (err) {
    log(`  ${c.yellow('○')} Qdrant tag patch: ${err.message}`);
  }
} else {
  log(`  ${c.dim('Tag write skipped')}${DRY_RUN ? ' (dry-run)' : ''}`);
}

// ── Stage 6: ACE hit logging ──────────────────────────────────────────────────

stage(6, 'ACE hit logging (Redis counters)');

if (!DRY_RUN) {
  const ts = Date.now();
  const logKey = `ace:batch:log:${Math.floor(ts / 1000)}`;
  const logEntry = {
    sessionId: `batch-gpu-analysis-${ts}`,
    query:     'batch-graphify-pipeline',
    usedDirectories: glyphTargets.slice(0, 20).map(t => t.dir),
    usedClusters:    [...new Set(glyphTargets.flatMap(t => t.dfiles.map(f => f.clusterId)).filter(c => c !== undefined))].slice(0, 10),
    cacheHitLevel:   'L3_COMPUTE',
    latencyMs:       Date.now() - ts,
    accepted:        true,
    glyphsGenerated: glyphOk,
    pageRankSource:  prSource,
    triggeredBy:     'graphify:batch-gpu-analysis',
  };
  await redis.setex(logKey, 24 * 3600, JSON.stringify(logEntry)).catch(() => null);
  // Increment hot counter
  await redis.incr('ace:batch:runs:total').catch(() => null);
  await redis.incrby('ace:batch:glyphs:total', glyphOk).catch(() => null);
  log(`  ${c.green('✓')} ACE hit logged → ${logKey}`);
} else {
  log(`  ${c.dim('ACE log skipped (dry-run)')}`);
}

// ── Stage 7: Report generation ────────────────────────────────────────────────

stage(7, 'Report generation');

const report = {
  generatedAt: new Date().toISOString(),
  dryRun:      DRY_RUN,
  skipLlm:     SKIP_LLM,
  graph: {
    files:       files.length,
    directories: dirs.length,
    clusters:    clusterCount,
    missingCluster,
    missingSom,
  },
  pageRank: {
    source:  prSource,
    entries: Object.keys(pageRankScores).length,
  },
  glyphs: {
    processed:       glyphTargets.length,
    ok:              glyphOk,
    failed:          glyphFailed,
    tagsUpdated:     tagUpdated,
    agentsWritten,
    clusterSummaries: clusterSummariesWritten,
    turboUsed:       turboHealthy,
  },
  topDirectoriesByPageRank: [...dirPageRank.entries()]
    .sort((a, b) => b[1].max - a[1].max)
    .slice(0, 15)
    .map(([dir, pr]) => ({ dir, ...pr })),
  hotDirectories: glyphTargets.slice(0, 10).map(t => ({
    dir:       t.dir,
    files:     t.dfiles.length,
    ssrRisk:   t.dfiles.filter(f => f.ssrUnsafe).length,
    pairedPct: t.dfiles.length ? Math.round(t.dfiles.filter(f => f.hasPairedTest).length / t.dfiles.length * 100) : 0,
  })),
};

mkdirSync(REPORT_DIR, { recursive: true });
if (!DRY_RUN) {
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  log(`  ${c.green('✓')} JSON report → docs/graph/batch-gpu-analysis-report.json`);
}

// Markdown report
const md = `# Graphify Batch GPU Analysis Report

Generated: ${report.generatedAt}${DRY_RUN ? '  \n**DRY RUN — no writes**' : ''}

## Summary

| Metric | Value |
|--------|-------|
| Files | ${report.graph.files} |
| Directories | ${report.graph.directories} |
| GPU Clusters | ${report.graph.clusters} |
| Missing clusterId | ${report.graph.missingCluster} |
| Missing SOM | ${report.graph.missingSom} |
| PageRank source | ${report.pageRank.source} (${report.pageRank.entries} entries) |
| Glyphs generated | ${report.glyphs.ok} / ${report.glyphs.processed} |
| Tags updated | ${report.glyphs.tagsUpdated} |
| agents:dir:* keys | ${report.glyphs.agentsWritten} |
| summary:cluster:* keys | ${report.glyphs.clusterSummaries} |
| TurboQuant (cache_prompt) | ${report.glyphs.turboUsed ? '✅ active' : '⚠️ fallback to Ollama'} |

## Top Directories by PageRank

| Directory | avg | max | source |
|-----------|-----|-----|--------|
${report.topDirectoriesByPageRank.map(d => `| \`${d.dir}\` | ${d.avg.toFixed(4)} | ${d.max.toFixed(4)} | ${d.source} |`).join('\n')}

## Hot Directories (processed this run)

| Directory | Files | SSR Risk | Test% |
|-----------|-------|----------|-------|
${report.hotDirectories.map(d => `| \`${d.dir}\` | ${d.files} | ${d.ssrRisk} | ${d.pairedPct}% |`).join('\n')}

## Recommendations

${report.graph.missingCluster > 0 ? `- Run \`npm run graphify:semantic\` to assign GPU cluster IDs (${report.graph.missingCluster} files missing)` : '- ✅ Cluster IDs present on all files'}
${report.graph.missingSom > 0 ? `- Run \`npm run graphify:topology\` to assign SOM coordinates (${report.graph.missingSom} files missing)` : '- ✅ SOM coordinates present on all files'}
${report.glyphs.failed > 0 ? `- ${report.glyphs.failed} glyph(s) failed — check Ollama connectivity` : '- ✅ All glyphs generated successfully'}
- Run \`npm run graphify:ace-smoke\` to validate ACE retrieval of directory-cluster hits
`;

if (!DRY_RUN) {
  writeFileSync(REPORT_MD, md);
  log(`  ${c.green('✓')} Markdown report → docs/graph/batch-gpu-analysis-report.md`);
} else {
  log('  (dry-run: report not written)');
}

// ── Stage 8: ACE smoke ─────────────────────────────────────────────────────────

stage(8, 'ACE smoke — retrieval probe');

if (SKIP_ACE) {
  log(`  ${c.dim('ACE smoke skipped (--skip-ace)')}`);
} else {
  try {
    const testQuery = 'What does src/lib/server/ace do?';
    const probeRes = await fetch(`${APP_URL}/api/graph/bow-texture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-dev-bypass': 'true' },
      body: JSON.stringify({ clusterId: 0 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (probeRes.ok) {
      const d = await probeRes.json();
      if (d.tile?.terms?.length) {
        log(`  ${c.green('✓')} BOW texture hit: ${d.tile.terms.slice(0, 5).join(', ')} (cache: ${d.cache?.hit ? 'HIT' : 'MISS'})`);
      } else {
        log(`  ${c.yellow('○')} BOW texture returned no terms (Qdrant may be empty for cluster 0)`);
      }
    } else {
      log(`  ${c.yellow('○')} App not reachable (${probeRes.status}) — start dev server for ACE smoke`);
    }
  } catch (err) {
    log(`  ${c.yellow('○')} ACE smoke skipped: ${err.message.split('\n')[0]} — start dev server first`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

log(`\n${c.bold('═══════ Batch GPU Analysis Complete ═══════')}`);
log(`  Files:      ${files.length}`);
log(`  Dirs:       ${dirs.length}`);
log(`  Glyphs:     ${c.green(glyphOk)} ok${glyphFailed ? ', ' + c.red(glyphFailed + ' failed') : ''}`);
log(`  PageRank:   ${prSource} (${Object.keys(pageRankScores).length} entries)`);
log(`  Tags:       ${tagUpdated} Qdrant points patched`);
log(`  agents:dir: ${agentsWritten} NES-arch preflight keys`);
log(`  clusters:   ${clusterSummariesWritten} summary:cluster:* keys (llms.txt feed)`);
log(`  TurboQuant: ${turboHealthy ? c.green('cache_prompt active') : c.yellow('fell back to Ollama')}`);
log(`  Reports:    ${DRY_RUN ? '(dry-run)' : 'docs/graph/batch-gpu-analysis-report.{json,md}'}`);
if (DRY_RUN) log(`\n  ${c.yellow('DRY RUN — no Redis/Qdrant/Postgres writes performed')}`);

await redis.quit();
