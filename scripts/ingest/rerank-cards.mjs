#!/usr/bin/env node
/**
 * rerank-cards.mjs  —  Phase 10B TurboVec Rerank
 *
 * Reads .tmp/retrieval-ranking-report.json, applies blended reranking
 * (semantic 0.5 + topology/authority 0.35 + keyword-boost 0.15),
 * emits a before/after diff, and writes the reranked report in-place.
 *
 * Rules:
 *   - Never mutates Qdrant
 *   - Never makes network calls (pure in-process, no external deps)
 *   - TurboVec sidecar at :8791 is probed as optional fast-path;
 *     falls back to in-process cosine blend silently
 *   - Source refs are preserved unchanged
 *
 * Outputs:
 *   .tmp/retrieval-ranking-report.json   (overwritten, now sorted by rerank score)
 *   .tmp/rerank-diff.json                (before/after diff for tracing)
 *
 * Usage:
 *   node scripts/ingest/rerank-cards.mjs
 *   node scripts/ingest/rerank-cards.mjs --dry-run
 *   node scripts/ingest/rerank-cards.mjs --query "ACE context"
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT       = process.cwd();
const TMP_DIR    = path.join(ROOT, '.tmp');
const REPORT     = path.join(TMP_DIR, 'retrieval-ranking-report.json');
const DIFF_OUT   = path.join(TMP_DIR, 'rerank-diff.json');
const TURBOVEC_URL = 'http://127.0.0.1:8791';

const args    = process.argv.slice(2);
const DRY     = args.includes('--dry-run');
const queryArg = args.filter(a => !a.startsWith('--')).join(' ');

// Blend weights (matches turbovec-rerank.ts)
const W = { semantic: 0.50, authority: 0.35, keywordBoost: 0.15 };

// Authority signals: source paths that indicate high-authority files
const AUTHORITY_PATTERNS = [
  { re: /CLAUDE\.md|master_agents|feature-registry|codebase-atlas/i, score: 1.0 },
  { re: /AGENTS\.md|architecture|design/i, score: 0.85 },
  { re: /src\/lib\/server\/(db|redis|env\.server)/i, score: 0.80 },
  { re: /src\/routes\/api/i, score: 0.70 },
  { re: /docs\/|memory\//i, score: 0.65 },
  { re: /\.(ts|svelte|mjs)$/, score: 0.55 },
  { re: /\.json$|\.sql$/, score: 0.50 },
];

// Keyword signals that boost authority for this pipeline
const BOOST_TERMS = [
  'error', 'failed', 'TODO', 'Phase', 'ACE', 'Qdrant', 'Redis', 'Postgres',
  'OpenCode', 'Gemma4', 'sourceRef', 'build', 'smoke', 'sourceRef',
];

function authorityScore(sourceRef) {
  const s = (sourceRef || '').replace(/\\/g, '/');
  for (const { re, score } of AUTHORITY_PATTERNS) {
    if (re.test(s)) return score;
  }
  return 0.2;
}

function keywordBoost(entry) {
  const text = ((entry.title || '') + ' ' + (entry.summary || '')).toLowerCase();
  const hits = BOOST_TERMS.filter(t => text.includes(t.toLowerCase())).length;
  return Math.min(hits / BOOST_TERMS.length, 1.0);
}

function blendScore(entry) {
  const semantic   = Number(entry.score) || 0;
  const authority  = authorityScore(entry.sourceRef);
  const kboost     = keywordBoost(entry);
  return W.semantic * semantic + W.authority * authority + W.keywordBoost * kboost;
}

// Optional: probe TurboVec sidecar health
async function turbovecHealthy() {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`${TURBOVEC_URL}/health`, { signal: ctrl.signal });
    return r.ok;
  } catch { return false; }
}

// Load embedding cache (id → float32 vector)
async function loadEmbeddingCache() {
  const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');
  const cache = new Map();
  const files = await fs.readdir(EMB_DIR).catch(() => []);
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    try {
      const j = JSON.parse(await fs.readFile(path.join(EMB_DIR, f), 'utf8'));
      if (j.id && Array.isArray(j.vector)) cache.set(j.id, j.vector);
    } catch { /* skip */ }
  }
  return cache;
}

// Call sidecar /rerank with candidates that have vectors
async function turbovecRerank(ranked, embCache) {
  const candidates = ranked
    .map(e => ({ id: e.id, vector: embCache.get(e.id) ?? null, _entry: e }))
    .filter(c => c.vector !== null)
    .slice(0, 500);

  if (candidates.length === 0) return null;

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    // Use first candidate's vector dimension as query proxy (query vec not stored — use blend of top-5)
    const queryVec = candidates.slice(0, 5).reduce((acc, c) => {
      for (let i = 0; i < acc.length; i++) acc[i] += c.vector[i] / 5;
      return acc;
    }, new Array(candidates[0].vector.length).fill(0));

    const res = await fetch(`${TURBOVEC_URL}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        query: queryVec,
        candidates: candidates.map(c => ({ id: c.id, vector: c.vector })),
        top_k: candidates.length,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Build id → turbovec_score map
    const scoreMap = new Map(
      (data.results || []).map(r => [r.id, r.turbovec_score])
    );
    return { scoreMap, search_ms: data.search_ms };
  } catch { return null; }
}

function intentHash(query) {
  return crypto.createHash('sha1').update((query || '').toLowerCase().trim()).digest('hex').slice(0, 16);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Rerank Cards (Phase 10B) ──────────────────────────────');

  let report;
  try {
    report = JSON.parse(await fs.readFile(REPORT, 'utf8'));
  } catch {
    console.error(`❌ ${REPORT} not found — run rank-cards.mjs first`);
    process.exit(1);
  }

  const query = queryArg || report.query || 'ACE context retrieval';
  const ranked = report.ranked || [];
  console.log(`  query    : "${query}"`);
  console.log(`  entries  : ${ranked.length}`);

  // Probe TurboVec sidecar + load embeddings
  const [tvHealthy, embCache] = await Promise.all([turbovecHealthy(), loadEmbeddingCache()]);
  console.log(`  TurboVec : ${tvHealthy ? '✅ :8791 healthy' : '⚠️  offline — in-process blend'}  embeddings: ${embCache.size}`);

  // Before snapshot (top-10 ids)
  const beforeTop10 = ranked.slice(0, 10).map(e => e.id);

  // Attempt live sidecar rerank when healthy
  let tvResult = null;
  if (tvHealthy) {
    tvResult = await turbovecRerank(ranked, embCache);
    if (tvResult) {
      console.log(`  sidecar  : reranked ${tvResult.scoreMap.size} cards in ${tvResult.search_ms}ms`);
    }
  }

  // Blend: if sidecar returned scores, fold them in (0.4 turbovec + 0.6 in-process)
  const reranked = ranked.map(entry => {
    const inProcess = blendScore(entry);
    const tvScore   = tvResult?.scoreMap.get(entry.id);
    // Normalise turbovec score to 0-1 range (scores are inner-product magnitudes ~10-50)
    const tvNorm    = tvScore != null ? Math.min(tvScore / 50, 1.0) : null;
    const rerank    = tvNorm != null
      ? 0.6 * inProcess + 0.4 * tvNorm
      : inProcess;
    return { ...entry, rerankScore: Math.round(rerank * 10000) / 10000, turbovecScore: tvNorm ?? null };
  });
  reranked.sort((a, b) => b.rerankScore - a.rerankScore);

  // After snapshot + diff
  const afterTop10 = reranked.slice(0, 10).map(e => e.id);
  const moved = beforeTop10.filter((id, i) => afterTop10[i] !== id).length;
  console.log(`  reranked : ${reranked.length} entries | top-10 positions changed: ${moved}`);

  // Top 5 after rerank
  console.log(`\n  Top 5 after rerank:`);
  for (const e of reranked.slice(0, 5)) {
    console.log(`    ${e.rerankScore.toFixed(4)}  ${String(e.title || '').slice(0, 55).replace(/\n/g, ' ')}  [${e.sourceRef || ''}]`);
  }

  const diff = {
    generatedAt: new Date().toISOString(),
    query,
    intentHash: intentHash(query),
    turbovecSidecar: tvHealthy ? (tvResult ? 'used' : 'healthy-no-vectors') : 'offline',
    blendWeights: W,
    beforeTop10,
    afterTop10,
    positionsChanged: moved,
    scoreDeltas: Object.fromEntries(
      reranked.slice(0, 20).map(e => [
        e.id,
        { before: e.score, after: e.rerankScore, delta: Math.round((e.rerankScore - e.score) * 10000) / 10000 }
      ])
    ),
  };

  // Update report: replace ranked array with reranked, add rerank metadata
  const updatedReport = {
    ...report,
    query,
    rerankApplied: true,
    rerankAt: new Date().toISOString(),
    intentHash: intentHash(query),
    blendWeights: W,
    ranked: reranked,
  };

  if (!DRY) {
    await fs.mkdir(TMP_DIR, { recursive: true });
    await fs.writeFile(REPORT, JSON.stringify(updatedReport, null, 2), 'utf8');
    await fs.writeFile(DIFF_OUT, JSON.stringify(diff, null, 2), 'utf8');
    console.log(`\n  ✅ wrote ${REPORT}  (reranked)`);
    console.log(`  ✅ wrote ${DIFF_OUT}`);
  } else {
    console.log(`\n  dry-run: would rerank ${reranked.length} entries, ${moved} top-10 changes`);
  }

  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
