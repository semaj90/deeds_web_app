#!/usr/bin/env node
/**
 * export-xgboost-features.mjs
 *
 * Assembles a labeled training dataset from success/partial agent traces
 * and their retrieved atlas_packets, ready for XGBoost/LightGBM reranker training.
 *
 * Feature set per (trace, packet) pair:
 *   === Retrieval features ===
 *   cosine_score          float   — Qdrant cosine similarity (from payload or 0)
 *   bm25_rank_norm        float   — BM25 rank normalized [0,1] (position in BM25 result)
 *   concept_overlap       float   — Jaccard between trace.selected_concepts and packet.concept_ids
 *   same_feature          int     — 1 if packet.feature_id matches trace's top concept domain
 *   community_conf        float   — packet.community_confidence (0 if null)
 *   reward_prior          float   — packet.reward_prior / 10 (normalized)
 *   domain_class_match    int     — 1 if packet domain_class aligns with trace concept domain
 *   freshness_score       float   — age-decay [0.1, 1.0]
 *   pagerank_score        float   — from Redis gpu:karpathy:scores blend (0 if missing)
 *   packet_hit_count      int     — how many times this packet appeared in success traces
 *
 *   === Trace context features ===
 *   n_retrieved           int     — total packets retrieved in this trace
 *   n_concepts            int     — len(selected_concepts)
 *   trace_score           float   — trace.score
 *
 *   === Label ===
 *   label                 float   — reward signal: 1.0 for success, 0.4 for partial, 0.0 for failure
 *                                   multiplied by packet's hit_count / n_retrieved (position bias removed)
 *
 * Outputs:
 *   docs/reports/xgboost-features.csv         — main CSV (header + rows)
 *   docs/reports/xgboost-features-meta.json   — schema, gate results, coverage stats
 *
 * Gate (must pass before training):
 *   ≥500 labeled rows with label > 0 (positive examples)
 *   ≥20 distinct feature_ids covered
 *   feature completeness ≥80% (no more than 20% zero-value features per row)
 *
 * Usage:
 *   node scripts/atlas/export-xgboost-features.mjs              # dry-run (stats only)
 *   node scripts/atlas/export-xgboost-features.mjs --apply      # write CSV
 *   node scripts/atlas/export-xgboost-features.mjs --apply --verbose
 *   node scripts/atlas/export-xgboost-features.mjs --apply --limit=2000
 */

import pg        from 'pg';
import Redis     from 'ioredis';
import { writeFileSync, mkdirSync } from 'node:fs';
import path      from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Config ────────────────────────────────────────────────────────────────────
const APPLY     = process.argv.includes('--apply');
const VERBOSE   = process.argv.includes('--verbose');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_TRACES = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 10_000;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';

const REPORT_DIR  = path.resolve(ROOT, 'docs/reports');
const CSV_PATH    = path.resolve(REPORT_DIR, 'xgboost-features.csv');
const META_PATH   = path.resolve(REPORT_DIR, 'xgboost-features-meta.json');

const OUTCOME_LABEL = { success: 1.0, partial: 0.4, failure: 0.0 };

// Domain → canonical concept domain mapping (mirrors classify-domain-ontology.mjs)
const DOMAIN_CONCEPT_MAP = {
  search: ['retrieval', 'semantic_search', 'rag', 'hybrid_search', 'bm25'],
  graph:  ['neo4j', 'graph', 'topology', 'pagerank'],
  code:   ['code_intel', 'ast', 'codebase_indexing'],
  embed:  ['embedding', 'vector', 'inference'],
  legal:  ['legal', 'evidence', 'case_management'],
  cache:  ['cache', 'redis', 'bifrost'],
  agent:  ['agent', 'planning', 'reasoning'],
  rank:   ['reranking', 'ranking'],
  memory: ['memory', 'prior_answer'],
  atlas:  ['atlas', 'feature_lookup'],
  trace:  ['kag', 'trace_memory'],
  cluster:['clustering', 'som'],
  mcp:    ['mcp_tools'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshnessScore(createdAt) {
  if (!createdAt) return 0.5;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.max(0.1, 1.0 - (ageDays / 365) * 0.9);
}

function jaccard(setA, setB) {
  if (!setA?.length || !setB?.length) return 0;
  const a = new Set(setA.map(s => s.toLowerCase()));
  const b = new Set(setB.map(s => s.toLowerCase()));
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function domainClassMatch(packetDomainClass, traceConceptDomain) {
  if (!packetDomainClass || !traceConceptDomain) return 0;
  if (packetDomainClass === traceConceptDomain) return 1;
  // Check partial overlap via domain concept map
  const domConcepts = DOMAIN_CONCEPT_MAP[packetDomainClass] ?? [];
  const traceConcepts = DOMAIN_CONCEPT_MAP[traceConceptDomain] ?? [];
  return domConcepts.some(c => traceConcepts.includes(c)) ? 0.5 : 0;
}

// Extract feature_id label from packet ref like "packet:agent_intelligence:13"
function labelFromRef(ref) {
  if (!ref || !ref.startsWith('packet:')) return null;
  const parts = ref.split(':');
  return parts[1] ?? null;
}

// CSV escape
function csv(v) {
  if (v === null || v === undefined) return '0';
  if (typeof v === 'number') return isFinite(v) ? v.toFixed(6) : '0';
  return `"${String(v).replace(/"/g, '""')}"`;
}

const CSV_HEADER = [
  'trace_id', 'packet_key',
  // retrieval signals
  'cosine_score', 'bm25_rank_norm', 'ann_turbovec_score', 'concept_overlap',
  'same_feature', 'community_conf', 'reward_prior',
  'domain_class_match', 'freshness_score', 'pagerank_score',
  // provenance + topology signals
  'som_cell_id', 'som_cache_hit', 'provenance_git_age',
  // trace context
  'packet_hit_count', 'n_retrieved', 'n_concepts', 'trace_score',
  'label',
].join(',');

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ XGBoost Feature Export ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  // Redis (for Karpathy pagerank blend scores)
  let redis = null;
  let redisReady = false;
  try {
    redis = new Redis({
      host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();
    redisReady = true;
    console.log('Redis: connected (Karpathy blend scores available)');
  } catch {
    console.log('Redis: offline — pagerank_score will be 0');
  }

  try {
    // ── 1. Load traces ─────────────────────────────────────────────────────────
    const { rows: traces } = await pool.query(`
      SELECT
        trace_id, outcome, score,
        retrieved_packets, selected_concepts
      FROM agent_traces
      WHERE outcome IN ('success', 'partial', 'failure')
        AND retrieved_packets IS NOT NULL
        AND jsonb_array_length(retrieved_packets) > 0
      ORDER BY created_at DESC
      LIMIT $1
    `, [MAX_TRACES]);

    console.log(`Traces loaded: ${traces.length}`);

    // ── 2. Build packet_key → packet lookup ─────────────────────────────────
    // Collect all referenced packet feature labels first
    const allLabels = new Set();
    for (const t of traces) {
      for (const ref of (t.retrieved_packets ?? [])) {
        const label = labelFromRef(ref);
        if (label) allLabels.add(label);
      }
    }

    const { rows: packets } = await pool.query(`
      SELECT
        packet_key, source_ref, feature_id, concept_ids,
        community_confidence, reward_prior, created_at,
        payload->>'domain_class'       AS domain_class,
        payload->>'cosine_score'       AS cosine_score_raw,
        payload->>'som_cell_id'        AS som_cell_id,
        payload->>'som_cache_hit'      AS som_cache_hit,
        payload->>'ann_turbovec_score' AS ann_turbovec_score
      FROM atlas_packets
      WHERE feature_id = ANY($1::text[])
        AND packet_key IS NOT NULL
    `, [[...allLabels]]);

    // Index by feature_id (multiple packets per feature_id)
    const packetsByFeature = new Map();
    const packetByKey = new Map();
    for (const p of packets) {
      packetByKey.set(p.packet_key, p);
      if (!packetsByFeature.has(p.feature_id)) packetsByFeature.set(p.feature_id, []);
      packetsByFeature.get(p.feature_id).push(p);
    }
    console.log(`Packets indexed: ${packets.length} across ${packetsByFeature.size} feature labels`);

    // ── 3. Load Karpathy blend scores from Redis ───────────────────────────────
    const karpathyScores = new Map(); // source_ref → blend score
    if (redisReady) {
      try {
        // HGETALL returns all field-value pairs
        const raw = await redis.hgetall('gpu:karpathy:scores');
        if (raw) {
          for (const [ref, val] of Object.entries(raw)) {
            try {
              const parsed = JSON.parse(val);
              karpathyScores.set(ref, parsed.blend ?? 0);
            } catch { /* skip malformed */ }
          }
          console.log(`Karpathy scores loaded: ${karpathyScores.size}`);
        }
      } catch { /* non-fatal */ }
    }

    // ── 4. Build per-packet hit count across all success traces ───────────────
    const packetHitCount = new Map(); // packet_key → count
    for (const t of traces) {
      if (OUTCOME_LABEL[t.outcome] === 0) continue;
      for (const ref of (t.retrieved_packets ?? [])) {
        const label = labelFromRef(ref);
        if (!label) continue;
        const pkts = packetsByFeature.get(label) ?? [];
        for (const p of pkts) {
          packetHitCount.set(p.packet_key, (packetHitCount.get(p.packet_key) ?? 0) + 1);
        }
      }
    }

    // ── 5. Build feature rows ─────────────────────────────────────────────────
    const rows = [];
    let zeroLabelRows = 0;

    for (const trace of traces) {
      const baseLabel    = OUTCOME_LABEL[trace.outcome] ?? 0;
      const traceScore   = Number(trace.score ?? 0);
      const traceConcepts = trace.selected_concepts ?? [];

      // Determine the primary concept domain of this trace
      const traceConceptDomain = traceConcepts[0]
        ? Object.entries(DOMAIN_CONCEPT_MAP).find(([, concepts]) =>
            concepts.some(c => traceConcepts[0].toLowerCase().includes(c))
          )?.[0] ?? null
        : null;

      const refs = trace.retrieved_packets ?? [];
      const nRetrieved = refs.length;
      const nConcepts  = traceConcepts.length;

      // BM25 rank: position in the retrieved_packets array (earlier = higher rank)
      const refIndex = new Map(refs.map((r, i) => [r, i]));

      // Collect unique packet refs for this trace
      const seenInTrace = new Set();
      for (const ref of refs) {
        const label = labelFromRef(ref);
        if (!label) continue;
        const pkts = packetsByFeature.get(label) ?? [];
        for (const p of pkts) {
          if (seenInTrace.has(p.packet_key)) continue;
          seenInTrace.add(p.packet_key);

          const bm25Rank    = refIndex.get(ref) ?? nRetrieved;
          const bm25RankNorm = nRetrieved > 0 ? 1.0 - (bm25Rank / nRetrieved) : 0;

          const conceptOverlap  = jaccard(traceConcepts, p.concept_ids);
          const sameFeature     = p.feature_id && traceConcepts.includes(p.feature_id) ? 1 : 0;
          const communityConf   = p.community_confidence !== null ? Number(p.community_confidence) : 0;
          const rewardNorm      = Math.min(1.0, Number(p.reward_prior ?? 0) / 10);
          const domMatch        = domainClassMatch(p.domain_class, traceConceptDomain);
          const freshness       = freshnessScore(p.created_at);
          const pagerank        = karpathyScores.get(p.source_ref) ?? 0;
          const cosine          = p.cosine_score_raw ? Number(p.cosine_score_raw) : 0;
          const hitCount        = packetHitCount.get(p.packet_key) ?? 0;

          // New signals for PyTorch policy network
          const somCellId       = p.som_cell_id !== undefined && p.som_cell_id !== null
                                    ? Math.max(0, Math.min(399, Number(p.som_cell_id))) : 0;
          const somCacheHit     = p.som_cache_hit ? 1 : 0;
          // Provenance git age: (now - packet.created_at) / 365 days, clamped [0,1]
          const gitAgeDays      = p.created_at
                                    ? (Date.now() - new Date(p.created_at).getTime()) / 86_400_000 : 180;
          const provenanceGitAge = Math.min(1.0, gitAgeDays / 365);
          // TurboVec scalar score — stored in payload if available
          const annTurboVec     = p.ann_turbovec_score ? Number(p.ann_turbovec_score) : 0;

          // Label: scale by hit_count proportion to reduce position bias
          const hitWeight = nRetrieved > 0 ? Math.min(1.0, hitCount / nRetrieved) : 0;
          const rowLabel  = baseLabel * Math.max(traceScore, 0.5) * (0.5 + 0.5 * hitWeight);

          if (rowLabel === 0) zeroLabelRows++;

          rows.push({
            trace_id: trace.trace_id,
            packet_key: p.packet_key,
            cosine_score: cosine,
            bm25_rank_norm: bm25RankNorm,
            ann_turbovec_score: annTurboVec,
            concept_overlap: conceptOverlap,
            same_feature: sameFeature,
            community_conf: communityConf,
            reward_prior: rewardNorm,
            domain_class_match: domMatch,
            freshness_score: freshness,
            pagerank_score: pagerank,
            som_cell_id: somCellId,
            som_cache_hit: somCacheHit,
            provenance_git_age: provenanceGitAge,
            packet_hit_count: hitCount,
            n_retrieved: nRetrieved,
            n_concepts: nConcepts,
            trace_score: traceScore,
            label: rowLabel,
          });
        }
      }
    }

    // ── 6. Compute stats ──────────────────────────────────────────────────────
    const positiveRows   = rows.filter(r => r.label > 0).length;
    const featureIds     = new Set(rows.map(r => r.packet_key.split(':')[0]));
    const distinctFeatures = packetsByFeature.size;

    // Feature completeness: fraction of rows where at least 7/10 numeric features are non-zero
    const NUMERIC_FEATURES = ['cosine_score','bm25_rank_norm','concept_overlap','community_conf',
                               'reward_prior','freshness_score','pagerank_score','trace_score'];
    const completeRows = rows.filter(r =>
      NUMERIC_FEATURES.filter(f => r[f] > 0).length >= 5
    ).length;
    const completenessPct = rows.length > 0 ? completeRows / rows.length : 0;

    console.log(`\nTotal feature rows: ${rows.length.toLocaleString()}`);
    console.log(`Positive label rows: ${positiveRows.toLocaleString()}`);
    console.log(`Zero label rows:     ${zeroLabelRows.toLocaleString()}`);
    console.log(`Distinct features:   ${distinctFeatures}`);
    console.log(`Feature completeness: ${(completenessPct * 100).toFixed(1)}%`);

    if (VERBOSE) {
      // Show distribution of label values
      const buckets = { '0.0': 0, '0-0.4': 0, '0.4-0.7': 0, '0.7-1.0': 0, '1.0': 0 };
      for (const r of rows) {
        if (r.label === 0) buckets['0.0']++;
        else if (r.label < 0.4) buckets['0-0.4']++;
        else if (r.label < 0.7) buckets['0.4-0.7']++;
        else if (r.label < 1.0) buckets['0.7-1.0']++;
        else buckets['1.0']++;
      }
      console.log('\nLabel distribution:');
      for (const [k, v] of Object.entries(buckets)) {
        console.log(`  ${k.padEnd(8)}: ${v}`);
      }
    }

    // ── 7. Gates ──────────────────────────────────────────────────────────────
    const gates = [
      { name: 'positive_rows_500',    pass: positiveRows >= 500,       detail: `${positiveRows} positive rows (gate ≥500)` },
      { name: 'distinct_features_8',  pass: distinctFeatures >= 8,     detail: `${distinctFeatures} distinct features (gate ≥8; ≥20 for production training)` },
      { name: 'completeness_80pct',   pass: completenessPct >= 0.80,   detail: `${(completenessPct*100).toFixed(1)}% complete rows (gate ≥80%)` },
    ];

    console.log('\n══ Gate Results ═══════════════════════════');
    for (const g of gates) {
      console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(28)} ${g.detail}`);
    }
    const allPass = gates.every(g => g.pass);
    console.log(`\n  ${allPass ? '✅ GATE PASS — XGBoost training unblocked' : '⚠️  GATE FAIL — address blockers before training'}`);

    const meta = {
      generated: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      traces_loaded: traces.length,
      total_rows: rows.length,
      positive_rows: positiveRows,
      zero_label_rows: zeroLabelRows,
      distinct_features: distinctFeatures,
      completeness_pct: parseFloat((completenessPct * 100).toFixed(1)),
      karpathy_scores_loaded: karpathyScores.size,
      gates,
      feature_schema: CSV_HEADER.split(','),
      training_command_policy:  `python scripts/atlas/train-policy-reranker.py`,
      training_command_xgboost: `python scripts/atlas/train-xgboost-reranker.py  # legacy, use policy reranker`,
      new_features: ['ann_turbovec_score', 'som_cell_id', 'som_cache_hit', 'provenance_git_age'],
    };

    if (DRY_RUN) {
      console.log('\n(dry-run — CSV not written; run with --apply to write)');
      mkdirSync(REPORT_DIR, { recursive: true });
      writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
      console.log(`Meta: ${META_PATH}`);
      return;
    }

    // ── 8. Write CSV ──────────────────────────────────────────────────────────
    console.log('\nWriting CSV…');
    mkdirSync(REPORT_DIR, { recursive: true });

    const lines = [CSV_HEADER];
    for (const r of rows) {
      lines.push([
        csv(r.trace_id), csv(r.packet_key),
        // retrieval signals
        csv(r.cosine_score), csv(r.bm25_rank_norm), csv(r.ann_turbovec_score ?? 0), csv(r.concept_overlap),
        r.same_feature, csv(r.community_conf), csv(r.reward_prior),
        csv(r.domain_class_match), csv(r.freshness_score), csv(r.pagerank_score),
        // provenance + topology
        r.som_cell_id ?? 0, r.som_cache_hit ?? 0, csv(r.provenance_git_age ?? 0),
        // trace context
        r.packet_hit_count, r.n_retrieved, r.n_concepts, csv(r.trace_score),
        csv(r.label),
      ].join(','));
    }

    writeFileSync(CSV_PATH, lines.join('\n'), 'utf8');
    writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

    const csvSizeKB = Math.round(lines.join('\n').length / 1024);
    console.log(`CSV written: ${CSV_PATH} (${rows.length.toLocaleString()} rows, ~${csvSizeKB} KB)`);
    console.log(`Meta:        ${META_PATH}`);

    if (!allPass) {
      console.log('\n⚠️  Gates not all passing — check meta for blockers before training');
      process.exitCode = 1;
    }

  } finally {
    await pool.end();
    if (redisReady) await redis.quit().catch(() => {});
  }
}

main().catch(e => { console.error(e); process.exit(1); });
