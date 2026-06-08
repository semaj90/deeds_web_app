#!/usr/bin/env node
/**
 * rank-cards.mjs
 *
 * Scores every card in .opencode/cards/ against a retrieval query using the
 * Phase 11D ranking formula:
 *
 *   score = 0.35 semantic
 *         + 0.20 sourceRef confidence
 *         + 0.15 error/build relevance
 *         + 0.10 recency
 *         + 0.10 TODO priority
 *         + 0.05 root importance
 *         + 0.05 smoke-test availability
 *
 * Outputs:
 *   .tmp/retrieval-ranking-report.json  — full ranked list with per-signal breakdown
 *
 * Usage:
 *   node scripts/ingest/rank-cards.mjs "ACE context retrieval"
 *   node scripts/ingest/rank-cards.mjs "ACE context retrieval" --top 200 --dry-run
 */

import fs from 'fs/promises';
import { existsSync, statSync, readdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { CARDS_DIR as NESCHROM_CARDS_DIR, LEGACY_CARDS_DIR } from '../atlas/_neschrom-paths.mjs';

const _require = createRequire(import.meta.url);

// Real Ollama embed — falls back to pseudo if server unavailable
async function ollamaEmbed(text, host = 'http://localhost:11434') {
  try {
    const res = await fetch(`${host}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const vec = j.embeddings?.[0] ?? j.embedding;
    return Array.isArray(vec) && vec.length === 768 ? vec : null;
  } catch {
    return null;
  }
}

const ROOT = process.cwd();
const CARDS_DIR = existsSync(NESCHROM_CARDS_DIR) && readdirSync(NESCHROM_CARDS_DIR).filter(f => f.endsWith('.json')).length > 0
  ? NESCHROM_CARDS_DIR : LEGACY_CARDS_DIR;
const EMB_DIR     = path.join(ROOT, '.opencode', 'embeddings');
const TMP_DIR     = path.join(ROOT, '.tmp');
const OUT_REPORT  = path.join(TMP_DIR, 'retrieval-ranking-report.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const topIdx  = args.indexOf('--top');
const TOP     = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : 500;
const query   = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a)).join(' ') || 'ACE context retrieval';

// ── Scoring weights ────────────────────────────────────────────────────────────
const W = {
  semantic:      0.35,
  sourceRef:     0.20,
  errorBoost:    0.15,
  recency:       0.10,
  todoBoost:     0.10,
  rootImportance:0.05,
  smokeTest:     0.05,
};

// Priority keywords that boost relevance
const PRIORITY_TERMS = [
  'error', 'failed', 'TODO', 'Phase', 'ACE', 'Qdrant', 'Redis', 'Postgres',
  'OpenCode', 'Gemma4', 'sourceRef', 'build', 'smoke',
];

// ── Cosine similarity ──────────────────────────────────────────────────────────
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

// ── Deterministic pseudo-embed (same algo as embed-cards.mjs) ─────────────────
// Used as fallback when no real embedding exists for a card/query.
function pseudoEmbed(text, dim = 768) {
  let seed = crypto.createHash('sha256').update(text).digest();
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    seed   = crypto.createHash('sha256').update(seed).digest();
    out[i] = (seed.readUInt32BE(0) / 0xffffffff) * 2 - 1;
  }
  return Array.from(out);
}

// ── Cluster + area assignment ──────────────────────────────────────────────────
const CLUSTER_MAP = [
  { cluster: 'Context Engineering', patterns: [/ace.packet|startup.context|patch.card|sourceRef|atlas.seed|ace.context/i] },
  { cluster: 'Retrieval',           patterns: [/qdrant|turbovec|graphify|redis.cache|vector|embedding|rerank/i] },
  { cluster: 'Agent Workflow',      patterns: [/opencode|smoke.test|patch.promot|todo.track|recommend/i] },
  { cluster: 'Performance',         patterns: [/simdjson|messagepack|cuda|libtorch|hot.doc|cold.doc|bench/i] },
  { cluster: 'Legal Workspace',     patterns: [/evidence|case.summar|timeline|legal.doc|forensic/i] },
  { cluster: 'Infrastructure',      patterns: [/rabbitmq|postgres|redis|docker|startup|health.check/i] },
];

function assignCluster(text) {
  const t = (text || '').toLowerCase();
  for (const { cluster, patterns } of CLUSTER_MAP) {
    if (patterns.some(p => p.test(t))) return cluster;
  }
  return 'General';
}

function deriveArea(src) {
  const s = (src || '').replace(/\\/g, '/');
  return s.split('/').slice(0, 2).join('/') || 'misc';
}

function deriveFeatureStatus(card, signals) {
  const text = (card.text || '').toLowerCase();
  if (/\bwip\b|work.in.progress|not.yet.impl|TODO.*implement|stub|placeholder/i.test(text)) return 'missing';
  if (/\bbroken\b|\bfailing\b|\bdegraded\b|\bdisabled\b/i.test(text)) return 'degraded';
  if (/\bstale\b|out.of.date|outdated|>24h|needs.refresh/i.test(text)) return 'stale';
  if (signals.smokeTest >= 0.75 && signals.errorBoost < 0.3) return 'healthy';
  return 'active';
}

function deriveTags(card) {
  const tags = [];
  const text = ((card.title || '') + ' ' + (card.text || '')).toLowerCase();
  const src = (card.source || '').replace(/\\/g, '/');
  if (/qdrant|vector|embed/i.test(text)) tags.push('vector-search');
  if (/redis|cache/i.test(text)) tags.push('cache');
  if (/neo4j|graph/i.test(text)) tags.push('graph');
  if (/ollama|gemma|llm/i.test(text)) tags.push('inference');
  if (/error|fail|bug/i.test(text)) tags.push('error');
  if (/todo|fixme|wip/i.test(text)) tags.push('todo');
  if (/test|smoke|spec/i.test(text)) tags.push('test');
  if (/\.svelte$/.test(src)) tags.push('svelte');
  if (/\.ts$|\.mjs$/.test(src)) tags.push('typescript');
  if (/scripts\//.test(src)) tags.push('script');
  if (/api\//.test(src)) tags.push('api');
  return tags.slice(0, 6);
}

// ── Signal helpers ─────────────────────────────────────────────────────────────

/** sourceRef confidence: does the card source look like a real indexed path? */
function sourceRefConfidence(card) {
  const src = card.source || '';
  if (!src) return 0;
  // Penalise raw log / tmp paths
  if (/\.log$|\.tmp$|__snapshots__|node_modules/i.test(src)) return 0.1;
  // Docs / atlas → high confidence
  if (/docs\/|atlas|agents\.md|CLAUDE\.md/i.test(src)) return 1.0;
  // Source code
  if (/\.(ts|svelte|mjs|json|sql)$/.test(src)) return 0.85;
  return 0.5;
}

/** Error/build relevance: does this card mention errors, diagnostics, or build status? */
function errorRelevance(card) {
  const text = (card.text || '').toLowerCase();
  const hits = [
    /\berror\b/, /\bfail(ed|ure)?\b/, /\bdiagnostic/, /\bfix\b/, /\bbug\b/,
    /\bblocked?\b/, /\bbroken\b/, /svelte-check/, /tsgo/, /build status/,
  ].filter(r => r.test(text)).length;
  return Math.min(hits / 4, 1.0);
}

/** Recency: based on file mtime of the card JSON, scaled to 0-1 over 30 days. */
function recencyScore(cardPath) {
  try {
    const mtime = statSync(cardPath).mtimeMs;
    const ageMs = Date.now() - mtime;
    const maxMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    return Math.max(0, 1 - ageMs / maxMs);
  } catch {
    return 0;
  }
}

/** TODO priority: does the card mention TODO/FIXME/NEXT/P1/P2 items? */
function todoPriority(card) {
  const text = (card.text || '').toLowerCase();
  if (/\bp1\b|\bcritical\b|\bblocking\b/.test(text)) return 1.0;
  if (/\bp2\b|\bhigh priority\b/.test(text)) return 0.75;
  if (/\btodo\b|\bfixme\b|\bnext step\b|\bnext action\b/.test(text)) return 0.5;
  return 0;
}

/** Root importance: high-value root-level / architecture files. */
function rootImportance(card) {
  const src = (card.source || '').replace(/\\/g, '/');
  if (/CLAUDE\.md|AGENTS\.md|master_agents|feature-registry|codebase-atlas/i.test(src)) return 1.0;
  if (/architecture|design|spec|plan/i.test(src)) return 0.75;
  if (/^docs\/|^memory\//i.test(src)) return 0.6;
  return 0.2;
}

/** Smoke-test availability: does the card mention a runnable test/smoke/command? */
function smokeTestAvailability(card) {
  const text = card.text || '';
  if (/```bash|```sh|npm run|node scripts|npx /.test(text)) return 1.0;
  if (/smoke|healthcheck|test:/.test(text.toLowerCase())) return 0.75;
  return 0;
}

// ── Load embeddings cache (id → vector) ───────────────────────────────────────
async function loadEmbeddingCache() {
  const cache = new Map();
  const files = await fs.readdir(EMB_DIR).catch(() => []);
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    try {
      const j = JSON.parse(await fs.readFile(path.join(EMB_DIR, f), 'utf8'));
      if (j.id && j.vector) cache.set(j.id, j.vector);
    } catch { /* skip malformed */ }
  }
  return cache;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n── Rank Cards ────────────────────────────────────────────`);
  console.log(`  query : "${query}"`);
  console.log(`  top   : ${TOP}${DRY_RUN ? '  [dry-run]' : ''}`);

  const embCache = await loadEmbeddingCache();
  console.log(`  embeddings loaded: ${embCache.size}`);

  // Embed the query: real Ollama embed → pseudo-embed fallback
  const ollamaVec = await ollamaEmbed(query);
  const queryVec = ollamaVec ?? pseudoEmbed(query);
  console.log(`  query embed  : ${ollamaVec ? 'ollama (real)' : 'pseudo (fallback)'}`);

  const cardFiles = await fs.readdir(CARDS_DIR).catch(() => []);
  const jsonFiles = cardFiles.filter(f => /\.json$/.test(f));
  console.log(`  cards found: ${jsonFiles.length}`);

  const ranked = [];
  for (const f of jsonFiles) {
    const cardPath = path.join(CARDS_DIR, f);
    let card;
    try {
      card = JSON.parse(await fs.readFile(cardPath, 'utf8'));
    } catch { continue; }

    // Semantic score
    const cardVec = embCache.get(card.id) ?? pseudoEmbed(card.text || '');
    const semantic = (cosine(queryVec, cardVec) + 1) / 2; // normalise -1..1 → 0..1

    // Keyword boost: fraction of priority terms found in title+text
    const cardText = ((card.title || '') + ' ' + (card.text || '')).toLowerCase();
    const keywordBoost = PRIORITY_TERMS.filter(t => cardText.includes(t.toLowerCase())).length / PRIORITY_TERMS.length;

    const signals = {
      semantic,
      sourceRef:      sourceRefConfidence(card),
      errorBoost:     Math.min(errorRelevance(card) + keywordBoost * 0.3, 1.0),
      recency:        recencyScore(cardPath),
      todoBoost:      todoPriority(card),
      rootImportance: rootImportance(card),
      smokeTest:      smokeTestAvailability(card),
    };

    const score =
      W.semantic       * signals.semantic      +
      W.sourceRef      * signals.sourceRef     +
      W.errorBoost     * signals.errorBoost    +
      W.recency        * signals.recency       +
      W.todoBoost      * signals.todoBoost     +
      W.rootImportance * signals.rootImportance+
      W.smokeTest      * signals.smokeTest;

    // Derive summary: first 2 sentences of text
    const stripped = (card.text || '').replace(/```[\s\S]*?```/g, '').replace(/^#+\s+.*/gm, '').trim();
    const sentences = stripped.match(/[^.!?\n]{10,}[.!?]/g) || [];
    const summary = sentences.slice(0, 2).join(' ').slice(0, 280);

    const roundedSignals = {
      semantic:              Math.round(signals.semantic      * 1000) / 1000,
      recency:               Math.round(signals.recency       * 1000) / 1000,
      errorBoost:            Math.round(signals.errorBoost    * 1000) / 1000,
      todoBoost:             Math.round(signals.todoBoost     * 1000) / 1000,
      sourceRefConfidence:   Math.round(signals.sourceRef     * 1000) / 1000,
    };

    ranked.push({
      id:            card.id,
      title:         card.title,
      sourceRef:     card.source,
      area:          deriveArea(card.source),
      cluster:       assignCluster((card.title || '') + ' ' + (card.source || '')),
      tags:          deriveTags(card),
      featureStatus: deriveFeatureStatus(card, roundedSignals),
      score:         Math.round(score * 10000) / 10000,
      signals:       roundedSignals,
      summary,
      selected:      false,
      textLen:       (card.text || '').length,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, TOP);

  console.log(`\n  Top 5 results:`);
  for (const r of top.slice(0, 5)) {
    console.log(`    ${r.score.toFixed(4)}  ${r.title?.slice(0, 60).replace(/\n/g, ' ')}  [${r.sourceRef ?? ''}]`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    query,
    totalCards: jsonFiles.length,
    embeddingsCached: embCache.size,
    weights: W,
    ranked: top,
  };

  if (!DRY_RUN) {
    await fs.mkdir(TMP_DIR, { recursive: true });
    await fs.writeFile(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n  ✅ wrote ${OUT_REPORT}`);
  } else {
    console.log(`\n  dry-run: would write ${top.length} ranked entries to ${OUT_REPORT}`);
  }

  console.log(`──────────────────────────────────────────────────────────\n`);
}

main().catch(e => { console.error(e); process.exit(1); });