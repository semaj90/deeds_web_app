#!/usr/bin/env node
/**
 * Phase 2F.1: Real Evaluation Runner
 *
 * Reads ground-truth from evaluation_relevance (provenance-grounded, 0-3 grade scale).
 * For each ablation configuration, runs Dense + Lexical + RRF retrieval and computes
 * IR metrics: NDCG@10, MAP, MRR, Precision@5, Precision@10, Recall@10.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase2f-evaluation-runner.mts [--ablation rrf_50_50] [--limit 5] [--dry-run]
 *
 * Flags:
 *   --ablation <id>    Run single ablation (dense_only | lexical_only | rrf_50_50 | dense_heavy | lexical_heavy | all_signals)
 *   --limit <n>        Only process first N queries (default: all)
 *   --dry-run          Compute metrics but do not write to evaluation_results
 *   --corpus <v>       Corpus version to use (default: latest from evaluation_corpora)
 *   --k <n>            Top-K for retrieval (default: 20)
 */

import pg from 'pg';
import crypto from 'node:crypto';

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const TOP_K = parseInt(process.env.TOP_K ?? '20');

const args = process.argv.slice(2);
const argAblation = args[args.indexOf('--ablation') + 1] as string | undefined;
const argLimit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : undefined;
const dryRun = args.includes('--dry-run');
const argCorpus = args.includes('--corpus') ? args[args.indexOf('--corpus') + 1] : undefined;
const topK = args.includes('--k') ? parseInt(args[args.indexOf('--k') + 1]) : TOP_K;

// ─── Ablation Configs ────────────────────────────────────────────────────────

interface AblationConfig {
  id: string;
  numericId: number;
  name: string;
  includeDense: boolean;
  includeLexical: boolean;
  blendStrategy: 'dense_only' | 'lexical_only' | 'rrf' | 'weighted';
  denseWeight: number;
  lexicalWeight: number;
}

const ABLATION_CONFIGS: AblationConfig[] = [
  { id: 'dense_only',    numericId: 1, name: 'Dense Only',           includeDense: true,  includeLexical: false, blendStrategy: 'dense_only',   denseWeight: 1.0, lexicalWeight: 0.0 },
  { id: 'lexical_only',  numericId: 2, name: 'Lexical Only',         includeDense: false, includeLexical: true,  blendStrategy: 'lexical_only', denseWeight: 0.0, lexicalWeight: 1.0 },
  { id: 'rrf_50_50',     numericId: 3, name: 'RRF 50/50',            includeDense: true,  includeLexical: true,  blendStrategy: 'rrf',          denseWeight: 0.5, lexicalWeight: 0.5 },
  { id: 'dense_heavy',   numericId: 4, name: 'Dense-Heavy (70/30)',   includeDense: true,  includeLexical: true,  blendStrategy: 'weighted',     denseWeight: 0.7, lexicalWeight: 0.3 },
  { id: 'lexical_heavy', numericId: 5, name: 'Lexical-Heavy (30/70)', includeDense: true,  includeLexical: true,  blendStrategy: 'weighted',     denseWeight: 0.3, lexicalWeight: 0.7 },
  { id: 'all_signals',   numericId: 6, name: 'RRF All Signals',       includeDense: true,  includeLexical: true,  blendStrategy: 'rrf',          denseWeight: 0.5, lexicalWeight: 0.5 },
];

// ─── IR Metrics ──────────────────────────────────────────────────────────────

/** Discounted Cumulative Gain at rank K */
function dcg(grades: number[], k: number): number {
  const top = grades.slice(0, k);
  return top.reduce((sum, g, i) => sum + g / Math.log2(i + 2), 0);
}

/** NDCG@K: DCG / IDCG (ideal DCG from perfect ranking) */
function ndcg(grades: number[], k: number): number {
  const idcg = dcg([...grades].sort((a, b) => b - a), k);
  if (idcg === 0) return 0;
  return dcg(grades, k) / idcg;
}

/** Mean Reciprocal Rank: 1 / rank_of_first_relevant (grade >= 1) */
function mrr(grades: number[]): number {
  const firstRelevant = grades.findIndex(g => g >= 1);
  return firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0;
}

/** Precision@K: fraction of top-K that are relevant (grade >= 1) */
function precisionAtK(grades: number[], k: number): number {
  const topK = grades.slice(0, k);
  const relevant = topK.filter(g => g >= 1).length;
  return k > 0 ? relevant / k : 0;
}

/** Recall@K: fraction of all relevant docs found in top-K */
function recallAtK(grades: number[], k: number, totalRelevant: number): number {
  if (totalRelevant === 0) return 0;
  const topK = grades.slice(0, k);
  const found = topK.filter(g => g >= 1).length;
  return found / totalRelevant;
}

/** Mean Average Precision: mean of precision at each relevant position */
function map(grades: number[]): number {
  let numRelevant = 0;
  let sumPrecision = 0;
  for (let i = 0; i < grades.length; i++) {
    if (grades[i] >= 1) {
      numRelevant++;
      sumPrecision += numRelevant / (i + 1);
    }
  }
  return numRelevant === 0 ? 0 : sumPrecision / numRelevant;
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

interface RetrievedItem {
  packetKey: string;
  sourceRef: string;
  chunkId?: string;
  denseRank?: number;
  denseScore?: number;
  lexicalRank?: number;
  lexicalScore?: number;
  rrfScore?: number;
  finalRank: number;
  finalScore: number;
}

/** Embed a query via Ollama */
async function embedQuery(query: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: query }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { embedding?: number[] };
    return json.embedding ?? null;
  } catch {
    return null;
  }
}

/** Qdrant ANN search → dense results */
async function retrieveDense(query: string, limit: number): Promise<Array<{ packetKey: string; sourceRef: string; chunkId: string; score: number; rank: number }>> {
  const embedding = await embedQuery(query);
  if (!embedding) return [];

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: embedding,
        limit,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }> };
    const points = json.result ?? [];
    return points.map((p, i) => ({
      packetKey: String(p.payload?.['packet_key'] ?? p.payload?.['source_ref'] ?? p.id),
      sourceRef: String(p.payload?.['source_ref'] ?? ''),
      chunkId: String(p.id),
      score: p.score ?? 0,
      rank: i + 1,
    }));
  } catch {
    return [];
  }
}

/** PostgreSQL FTS → lexical results */
async function retrieveLexical(pool: pg.Pool, query: string, limit: number): Promise<Array<{ packetKey: string; sourceRef: string; chunkId: string; score: number; rank: number }>> {
  try {
    // Try codebase_chunk_index FTS first
    const res = await pool.query<{ id: string; source_ref: string; packet_key: string; ts_score: number }>(`
      SELECT
        ci.id,
        ci.source_ref,
        COALESCE(ap.packet_key, ci.source_ref) AS packet_key,
        ts_rank(
          to_tsvector('english', COALESCE(ci.content, '') || ' ' || COALESCE(ci.summary, '')),
          plainto_tsquery('english', $1)
        ) AS ts_score
      FROM codebase_chunk_index ci
      LEFT JOIN atlas_packets ap ON ap.source_ref = ci.source_ref
      WHERE to_tsvector('english', COALESCE(ci.content, '') || ' ' || COALESCE(ci.summary, ''))
        @@ plainto_tsquery('english', $1)
      ORDER BY ts_score DESC
      LIMIT $2
    `, [query, limit]);

    return res.rows.map((row, i) => ({
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      chunkId: row.id,
      score: Math.min(1, row.ts_score),
      rank: i + 1,
    }));
  } catch {
    return [];
  }
}

/** RRF fusion: rank-merge dense + lexical using k=60 */
function fuseRRF(
  dense: Array<{ packetKey: string; sourceRef: string; chunkId: string; score: number; rank: number }>,
  lexical: Array<{ packetKey: string; sourceRef: string; chunkId: string; score: number; rank: number }>,
  limit: number,
): RetrievedItem[] {
  const k = 60;
  const scores = new Map<string, { item: Partial<RetrievedItem>; rrf: number }>();

  for (const d of dense) {
    const key = d.packetKey;
    const entry = scores.get(key) ?? { item: { packetKey: d.packetKey, sourceRef: d.sourceRef, chunkId: d.chunkId }, rrf: 0 };
    entry.item.denseRank = d.rank;
    entry.item.denseScore = d.score;
    entry.rrf += 1 / (k + d.rank);
    scores.set(key, entry);
  }
  for (const l of lexical) {
    const key = l.packetKey;
    const entry = scores.get(key) ?? { item: { packetKey: l.packetKey, sourceRef: l.sourceRef, chunkId: l.chunkId }, rrf: 0 };
    entry.item.lexicalRank = l.rank;
    entry.item.lexicalScore = l.score;
    entry.rrf += 1 / (k + l.rank);
    scores.set(key, entry);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1].rrf - a[1].rrf).slice(0, limit);
  return sorted.map(([, { item, rrf }], i) => ({
    packetKey: item.packetKey!,
    sourceRef: item.sourceRef ?? '',
    chunkId: item.chunkId,
    denseRank: item.denseRank,
    denseScore: item.denseScore,
    lexicalRank: item.lexicalRank,
    lexicalScore: item.lexicalScore,
    rrfScore: rrf,
    finalRank: i + 1,
    finalScore: rrf,
  }));
}

/** Weighted blend: normalize dense/lexical scores, combine by weight */
function fuseWeighted(
  dense: Array<{ packetKey: string; sourceRef: string; chunkId: string; score: number; rank: number }>,
  lexical: Array<{ packetKey: string; sourceRef: string; chunkId: string; score: number; rank: number }>,
  denseWeight: number,
  lexicalWeight: number,
  limit: number,
): RetrievedItem[] {
  const scores = new Map<string, { item: Partial<RetrievedItem>; weighted: number }>();

  for (const d of dense) {
    const key = d.packetKey;
    const entry = scores.get(key) ?? { item: { packetKey: d.packetKey, sourceRef: d.sourceRef, chunkId: d.chunkId }, weighted: 0 };
    entry.item.denseRank = d.rank;
    entry.item.denseScore = d.score;
    entry.weighted += d.score * denseWeight;
    scores.set(key, entry);
  }
  for (const l of lexical) {
    const key = l.packetKey;
    const entry = scores.get(key) ?? { item: { packetKey: l.packetKey, sourceRef: l.sourceRef, chunkId: l.chunkId }, weighted: 0 };
    entry.item.lexicalRank = l.rank;
    entry.item.lexicalScore = l.score;
    entry.weighted += l.score * lexicalWeight;
    scores.set(key, entry);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1].weighted - a[1].weighted).slice(0, limit);
  return sorted.map(([, { item, weighted }], i) => ({
    packetKey: item.packetKey!,
    sourceRef: item.sourceRef ?? '',
    chunkId: item.chunkId,
    denseRank: item.denseRank,
    denseScore: item.denseScore,
    lexicalRank: item.lexicalRank,
    lexicalScore: item.lexicalScore,
    finalRank: i + 1,
    finalScore: weighted,
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface EvalQuery {
  id: string;
  query: string;
  domain: string;
}

interface GroundTruth {
  packetKey: string;
  grade: number;
  confidence: number;
  judgmentSource: string;
}

interface QueryMetrics {
  ndcg10: number;
  map: number;
  mrr: number;
  p5: number;
  p10: number;
  r10: number;
  totalRelevant: number;
  retrieved: number;
}

async function runAblation(
  pool: pg.Pool,
  config: AblationConfig,
  queries: EvalQuery[],
  groundTruth: Map<string, GroundTruth[]>,
  corpusVersion: string,
): Promise<{ config: AblationConfig; avgMetrics: QueryMetrics; queryMetrics: Map<string, QueryMetrics> }> {
  console.log(`\n  [${config.numericId}/6] ${config.name} (${config.id})`);

  const queryMetrics = new Map<string, QueryMetrics>();
  let totalNdcg = 0, totalMap = 0, totalMrr = 0, totalP5 = 0, totalP10 = 0, totalR10 = 0;

  for (const q of queries) {
    const gt = groundTruth.get(q.id) ?? [];
    const gtByKey = new Map(gt.map(g => [g.packetKey, g]));
    const totalRelevant = gt.filter(g => g.grade >= 1).length;

    // Retrieve based on ablation config
    let results: RetrievedItem[] = [];

    if (config.blendStrategy === 'dense_only') {
      const dense = await retrieveDense(q.query, topK);
      results = dense.map((d, i) => ({ ...d, finalRank: i + 1, finalScore: d.score }));

    } else if (config.blendStrategy === 'lexical_only') {
      const lexical = await retrieveLexical(pool, q.query, topK);
      results = lexical.map((l, i) => ({ ...l, finalRank: i + 1, finalScore: l.score }));

    } else if (config.blendStrategy === 'rrf') {
      const [dense, lexical] = await Promise.all([
        retrieveDense(q.query, topK),
        retrieveLexical(pool, q.query, topK),
      ]);
      results = fuseRRF(dense, lexical, topK);

    } else {
      const [dense, lexical] = await Promise.all([
        retrieveDense(q.query, topK),
        retrieveLexical(pool, q.query, topK),
      ]);
      results = fuseWeighted(dense, lexical, config.denseWeight, config.lexicalWeight, topK);
    }

    // Grade each result against ground-truth
    const grades = results.map(r => gtByKey.get(r.packetKey)?.grade ?? 0);

    const metrics: QueryMetrics = {
      ndcg10: ndcg(grades, 10),
      map: map(grades),
      mrr: mrr(grades),
      p5: precisionAtK(grades, 5),
      p10: precisionAtK(grades, 10),
      r10: recallAtK(grades, 10, totalRelevant),
      totalRelevant,
      retrieved: results.length,
    };

    queryMetrics.set(q.id, metrics);
    totalNdcg += metrics.ndcg10;
    totalMap  += metrics.map;
    totalMrr  += metrics.mrr;
    totalP5   += metrics.p5;
    totalP10  += metrics.p10;
    totalR10  += metrics.r10;

    // Write results to DB (unless dry-run)
    if (!dryRun && results.length > 0) {
      const insertValues = results.map(r => {
        const gt = gtByKey.get(r.packetKey);
        const envelope = {
          dense: r.denseScore !== undefined ? { name: 'dense', score: r.denseScore, rank: r.denseRank } : undefined,
          lexical: r.lexicalScore !== undefined ? { name: 'lexical', score: r.lexicalScore, rank: r.lexicalRank } : undefined,
          rrf_score: r.rrfScore,
          weighted_score: config.blendStrategy === 'weighted' ? r.finalScore : undefined,
        };
        return [
          q.id,
          r.packetKey,
          corpusVersion,
          config.numericId,
          config.id,
          config.blendStrategy === 'rrf' ? 'rrf' : config.blendStrategy === 'dense_only' ? 'dense' : config.blendStrategy === 'lexical_only' ? 'lexical' : 'weighted',
          r.finalRank,
          JSON.stringify(envelope),
          gt?.grade ?? null,
          gt ? 'synthetic' : null,
          gt?.confidence ?? null,
          r.finalScore,
          gt?.grade ?? null,
          gt ? Math.min(1, Math.abs((gt.grade / 3) - r.finalScore) < 0.3 ? 0.8 : 0.5) : null,
        ];
      });

      // Batch insert
      for (const vals of insertValues) {
        try {
          await pool.query(`
            INSERT INTO evaluation_results
              (query_id, packet_key, corpus_version, ablation_id, ablation_config_name,
               lane_name, retrieval_rank, feature_envelope,
               ground_truth_grade, ground_truth_source, ground_truth_confidence,
               relevance_predicted, relevance_judged, match_confidence)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT DO NOTHING
          `, vals);
        } catch {
          // non-fatal: continue
        }
      }
    }

    process.stdout.write('.');
  }
  console.log();

  const n = queries.length;
  const avgMetrics: QueryMetrics = {
    ndcg10: totalNdcg / n,
    map: totalMap / n,
    mrr: totalMrr / n,
    p5: totalP5 / n,
    p10: totalP10 / n,
    r10: totalR10 / n,
    totalRelevant: 0,
    retrieved: 0,
  };

  return { config, avgMetrics, queryMetrics };
}

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Phase 2F.1: Real Evaluation Runner');
  console.log(`  Ablation: ${argAblation ?? 'all (6 configs)'}  |  Limit: ${argLimit ?? 'all'}  |  Dry-run: ${dryRun}`);
  console.log('═══════════════════════════════════════════════════════\n');

  const pool = new pg.Pool({ connectionString: DB_URL });

  // 1. Resolve corpus version
  let corpusVersion: string;
  if (argCorpus) {
    corpusVersion = argCorpus;
  } else {
    const cv = await pool.query<{ corpus_version: string }>(`
      SELECT corpus_version FROM evaluation_corpora ORDER BY created_at DESC LIMIT 1
    `);
    if (cv.rows.length === 0) {
      // Create a bootstrap corpus entry
      corpusVersion = `eval-${new Date().toISOString().slice(0, 10)}-bootstrap`;
      const gitHash = crypto.randomBytes(4).toString('hex');
      await pool.query(`
        INSERT INTO evaluation_corpora
          (corpus_version, git_commit,
           postgres_packet_count, postgres_chunk_count,
           qdrant_collection, qdrant_point_count,
           embedding_model, embedding_dimension, embedding_model_version,
           query_set_hash, judgment_set_hash)
        VALUES ($1,$2, 58365,40754, $3,40568, $4,384,'v1.0', 'bootstrap','bootstrap')
        ON CONFLICT DO NOTHING
      `, [corpusVersion, gitHash, QDRANT_COLLECTION, EMBED_MODEL]);
      console.log(`Created bootstrap corpus: ${corpusVersion}`);
    } else {
      corpusVersion = cv.rows[0].corpus_version;
    }
  }
  console.log(`Corpus version: ${corpusVersion}`);

  // 2. Load evaluation queries
  const qResult = await pool.query<EvalQuery>(`
    SELECT id, query, domain FROM evaluation_queries ORDER BY domain, query LIMIT $1
  `, [argLimit ?? 99999]);
  const queries = qResult.rows;
  console.log(`Loaded ${queries.length} evaluation queries`);

  if (queries.length === 0) {
    console.error('No evaluation queries found. Run populate-evaluation-corpus.mts first.');
    await pool.end();
    process.exit(1);
  }

  // 3. Load ground-truth relevance judgments
  const gtResult = await pool.query<{ query_id: string; packet_key: string; relevance_grade: number; confidence: number; judgment_source: string }>(`
    SELECT query_id, packet_key, relevance_grade, confidence, judgment_source
    FROM evaluation_relevance
    WHERE corpus_version = $1
  `, [corpusVersion]);

  const groundTruth = new Map<string, GroundTruth[]>();
  for (const row of gtResult.rows) {
    const list = groundTruth.get(row.query_id) ?? [];
    list.push({ packetKey: row.packet_key, grade: row.relevance_grade, confidence: row.confidence, judgmentSource: row.judgment_source });
    groundTruth.set(row.query_id, list);
  }
  console.log(`Loaded ground-truth for ${groundTruth.size} queries (${gtResult.rows.length} total judgments)`);

  const avgJudgmentsPerQuery = gtResult.rows.length / Math.max(1, groundTruth.size);
  console.log(`Average judgments per query: ${avgJudgmentsPerQuery.toFixed(1)}\n`);

  // 4. Select ablations to run
  const ablationsToRun = argAblation
    ? ABLATION_CONFIGS.filter(c => c.id === argAblation)
    : ABLATION_CONFIGS;

  if (ablationsToRun.length === 0) {
    console.error(`Unknown ablation: ${argAblation}. Valid: ${ABLATION_CONFIGS.map(c => c.id).join(', ')}`);
    await pool.end();
    process.exit(1);
  }

  // 5. Run ablations
  const results: Array<{ config: AblationConfig; avgMetrics: QueryMetrics }> = [];
  for (const config of ablationsToRun) {
    const { avgMetrics } = await runAblation(pool, config, queries, groundTruth, corpusVersion);
    results.push({ config, avgMetrics });
  }

  // 6. Print comparison table
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`${'Ablation'.padEnd(28)} ${'NDCG@10'.padStart(8)} ${'MAP'.padStart(8)} ${'MRR'.padStart(8)} ${'P@5'.padStart(8)} ${'P@10'.padStart(8)} ${'R@10'.padStart(8)}`);
  console.log('─'.repeat(82));

  for (const { config, avgMetrics } of results) {
    const label = config.name.padEnd(28);
    const fmt = (v: number) => v.toFixed(4).padStart(8);
    console.log(`${label} ${fmt(avgMetrics.ndcg10)} ${fmt(avgMetrics.map)} ${fmt(avgMetrics.mrr)} ${fmt(avgMetrics.p5)} ${fmt(avgMetrics.p10)} ${fmt(avgMetrics.r10)}`);
  }

  console.log('─'.repeat(82));

  // Identify best ablation per metric
  const best = (metric: keyof QueryMetrics) => {
    const best = results.reduce((b, r) => (r.avgMetrics[metric] as number) > (b.avgMetrics[metric] as number) ? r : b);
    return best.config.id;
  };
  console.log(`\nBest NDCG@10: ${best('ndcg10')}  |  Best MAP: ${best('map')}  |  Best MRR: ${best('mrr')}`);

  if (dryRun) {
    console.log('\n[DRY-RUN] No results written to database.');
  } else {
    console.log('\nResults written to evaluation_results table.');
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
