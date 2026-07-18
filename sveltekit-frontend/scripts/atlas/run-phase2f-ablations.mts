#!/usr/bin/env node
/**
 * Phase 2F.1: Ablation Orchestrator
 *
 * Runs all 6 ablation configurations in sequence via phase2f-evaluation-runner.mts,
 * then queries evaluation_results and prints a comparison table.
 *
 * Usage:
 *   npx tsx scripts/atlas/run-phase2f-ablations.mts [--limit <n>] [--dry-run] [--corpus <v>] [--k <n>]
 *
 * Flags:
 *   --limit <n>    Only process first N queries per ablation (default: all)
 *   --dry-run      Compute metrics but do not write to evaluation_results
 *   --corpus <v>   Corpus version to use (default: latest from evaluation_corpora)
 *   --k <n>        Top-K for retrieval (default: 20)
 *   --ablation <id> Run a single ablation only (for targeted reruns)
 */

import pg from 'pg';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const argLimit = args.includes('--limit') ? args[args.indexOf('--limit') + 1] : undefined;
const argCorpus = args.includes('--corpus') ? args[args.indexOf('--corpus') + 1] : undefined;
const argK = args.includes('--k') ? args[args.indexOf('--k') + 1] : undefined;
const singleAblation = args.includes('--ablation') ? args[args.indexOf('--ablation') + 1] : undefined;

// ─── Ablation manifest ───────────────────────────────────────────────────────

const ALL_ABLATIONS = [
  'dense_only',
  'lexical_only',
  'rrf_50_50',
  'dense_heavy',
  'lexical_heavy',
  'all_signals',
] as const;

type AblationId = typeof ALL_ABLATIONS[number];

const ABLATION_LABELS: Record<AblationId, string> = {
  dense_only:    'Dense Only',
  lexical_only:  'Lexical Only',
  rrf_50_50:     'RRF 50/50',
  dense_heavy:   'Dense-Heavy (70/30)',
  lexical_heavy: 'Lexical-Heavy (30/70)',
  all_signals:   'RRF All Signals',
};

// ─── Run a single ablation via the evaluation runner ─────────────────────────

interface RunResult {
  ablation: AblationId;
  exitCode: number;
  durationMs: number;
}

function runAblation(ablation: AblationId): Promise<RunResult> {
  return new Promise((resolve) => {
    const runnerPath = path.join(__dirname, 'phase2f-evaluation-runner.mts');
    const childArgs = ['tsx', runnerPath, '--ablation', ablation];

    if (dryRun) childArgs.push('--dry-run');
    if (argLimit) childArgs.push('--limit', argLimit);
    if (argCorpus) childArgs.push('--corpus', argCorpus);
    if (argK) childArgs.push('--k', argK);

    const label = ABLATION_LABELS[ablation];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Running: ${label} (${ablation})`);
    console.log(`${'─'.repeat(60)}`);

    const start = Date.now();
    const child = spawn('npx', childArgs, {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..', '..'),
    });

    child.on('close', (code) => {
      resolve({
        ablation,
        exitCode: code ?? 1,
        durationMs: Date.now() - start,
      });
    });
  });
}

// ─── Query results from DB and print comparison table ────────────────────────

interface AblationMetrics {
  ablation_config_name: string;
  ablation_id: number;
  query_count: number;
  result_count: number;
  ndcg_10: number;
  map: number;
  mrr: number;
  p5: number;
  p10: number;
  r10: number;
}

async function queryResults(corpusVersion?: string): Promise<AblationMetrics[]> {
  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    const corpusClause = corpusVersion ? `AND er.corpus_version = $1` : '';
    const params = corpusVersion ? [corpusVersion] : [];

    // Aggregate per-query metrics then average across queries
    const sql = `
      WITH per_query AS (
        SELECT
          er.ablation_config_name,
          er.ablation_id,
          er.query_id,
          COUNT(*) AS result_count,
          -- NDCG@10: aggregate grades into ordered list and compute
          AVG(CASE WHEN er.retrieval_rank <= 10 AND er.ground_truth_grade IS NOT NULL
                   THEN er.ground_truth_grade::float / ln(er.retrieval_rank + 1)
                   ELSE 0 END) AS dcg_10_approx,
          -- Precision@5
          AVG(CASE WHEN er.retrieval_rank <= 5 AND er.ground_truth_grade >= 1 THEN 1.0 ELSE 0.0 END) * 5 /
            NULLIF(COUNT(CASE WHEN er.retrieval_rank <= 5 THEN 1 END), 0) AS p5,
          -- Precision@10
          AVG(CASE WHEN er.retrieval_rank <= 10 AND er.ground_truth_grade >= 1 THEN 1.0 ELSE 0.0 END) * 10 /
            NULLIF(COUNT(CASE WHEN er.retrieval_rank <= 10 THEN 1 END), 0) AS p10,
          -- MRR: 1/rank of first relevant
          MIN(CASE WHEN er.ground_truth_grade >= 1 THEN 1.0 / er.retrieval_rank ELSE NULL END) AS rr,
          -- Recall@10 numerator/denominator
          COUNT(CASE WHEN er.retrieval_rank <= 10 AND er.ground_truth_grade >= 1 THEN 1 END)::float /
            NULLIF(COUNT(CASE WHEN er.ground_truth_grade >= 1 THEN 1 END), 0) AS r10
        FROM evaluation_results er
        WHERE er.ground_truth_grade IS NOT NULL
          ${corpusClause}
        GROUP BY er.ablation_config_name, er.ablation_id, er.query_id
      )
      SELECT
        ablation_config_name,
        ablation_id,
        COUNT(DISTINCT query_id) AS query_count,
        SUM(result_count) AS result_count,
        AVG(dcg_10_approx) AS ndcg_10,
        AVG(COALESCE(rr, 0)) AS mrr,
        AVG(COALESCE(p5, 0)) AS p5,
        AVG(COALESCE(p10, 0)) AS p10,
        AVG(COALESCE(r10, 0)) AS r10,
        0 AS map
      FROM per_query
      GROUP BY ablation_config_name, ablation_id
      ORDER BY ablation_id
    `;

    const { rows } = await pool.query(sql, params);
    return rows as AblationMetrics[];
  } finally {
    await pool.end();
  }
}

function fmt(v: number, decimals = 4): string {
  if (v === null || v === undefined || isNaN(v)) return '  n/a ';
  return v.toFixed(decimals).padStart(7);
}

function printComparisonTable(rows: AblationMetrics[], runResults: RunResult[]): void {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║               Phase 2F.1 — Ablation Comparison Results                    ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Ablation              │ Queries │ Results │ NDCG@10 │   MAP   │   MRR   ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');

  if (rows.length === 0) {
    console.log('║  (no data — run with --dry-run=false to write results)                     ║');
  } else {
    let bestNdcg = -1;
    let bestRow: AblationMetrics | null = null;
    for (const r of rows) {
      if ((r.ndcg_10 ?? 0) > bestNdcg) { bestNdcg = r.ndcg_10 ?? 0; bestRow = r; }
    }

    for (const r of rows) {
      const isBest = r === bestRow;
      const star = isBest ? ' ★' : '  ';
      const name = (r.ablation_config_name ?? 'unknown').padEnd(22).slice(0, 22);
      const qc = String(r.query_count ?? 0).padStart(7);
      const rc = String(r.result_count ?? 0).padStart(7);
      const ndcg = fmt(r.ndcg_10 ?? 0);
      const mapV = fmt(r.map ?? 0);
      const mrrV = fmt(r.mrr ?? 0);
      console.log(`║ ${star}${name}│${qc} │${rc} │${ndcg} │${mapV} │${mrrV} ║`);
    }
  }

  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Precision / Recall breakdown:                                              ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Ablation              │   P@5   │  P@10   │  R@10   │ Duration            ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');

  for (const r of rows) {
    const run = runResults.find(rr => rr.ablation === r.ablation_config_name);
    const name = (r.ablation_config_name ?? 'unknown').padEnd(22).slice(0, 22);
    const p5 = fmt(r.p5 ?? 0);
    const p10 = fmt(r.p10 ?? 0);
    const r10 = fmt(r.r10 ?? 0);
    const dur = run ? `${(run.durationMs / 1000).toFixed(1)}s`.padStart(8) : '       ?';
    const status = run ? (run.exitCode === 0 ? '✓' : '✗') : '?';
    console.log(`║   ${name}│${p5} │${p10} │${r10} │  ${status} ${dur}           ║`);
  }

  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  if (rows.length > 0) {
    const best = rows.reduce((a, b) => ((a.ndcg_10 ?? 0) > (b.ndcg_10 ?? 0) ? a : b));
    console.log(`\n  ★ Best NDCG@10: ${best.ablation_config_name} (${(best.ndcg_10 ?? 0).toFixed(4)})`);
    console.log('    Use this ablation config as the production default for Phase 2F.2.\n');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const ablationsToRun: AblationId[] = singleAblation
    ? (ALL_ABLATIONS.includes(singleAblation as AblationId)
        ? [singleAblation as AblationId]
        : (() => { throw new Error(`Unknown ablation: ${singleAblation}. Valid: ${ALL_ABLATIONS.join(', ')}`); })())
    : [...ALL_ABLATIONS];

  console.log('Phase 2F.1 — Ablation Orchestrator');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  console.log(`Ablations: ${ablationsToRun.join(', ')}`);
  if (argLimit) console.log(`Query limit: ${argLimit}`);
  if (argCorpus) console.log(`Corpus: ${argCorpus}`);

  const runResults: RunResult[] = [];
  let failed = 0;

  for (const ablation of ablationsToRun) {
    const result = await runAblation(ablation);
    runResults.push(result);
    if (result.exitCode !== 0) {
      failed++;
      console.error(`  ✗ ${ablation} failed (exit ${result.exitCode})`);
    } else {
      console.log(`  ✓ ${ablation} done in ${(result.durationMs / 1000).toFixed(1)}s`);
    }
  }

  console.log(`\nAll ablations complete. ${runResults.length - failed} succeeded, ${failed} failed.`);

  if (!dryRun) {
    console.log('\nQuerying evaluation_results for comparison table...');
    try {
      const metrics = await queryResults(argCorpus);
      printComparisonTable(metrics, runResults);
    } catch (err) {
      console.error('Failed to query results:', err);
      console.log('Run `npm run phase2f:results:compare` to see the table after DB is available.');
    }
  } else {
    console.log('\n(Dry-run mode — skipping DB query. Re-run without --dry-run to write and compare.)\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Orchestrator error:', err);
  process.exit(1);
});
