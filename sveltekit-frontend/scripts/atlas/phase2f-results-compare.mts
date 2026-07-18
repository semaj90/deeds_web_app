#!/usr/bin/env node
/**
 * Phase 2F.1: Results Comparison Table
 *
 * Queries evaluation_results and prints a formatted comparison of all ablation configs.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase2f-results-compare.mts [--corpus <v>]
 */

import pg from 'pg';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const args = process.argv.slice(2);
const argCorpus = args.includes('--corpus') ? args[args.indexOf('--corpus') + 1] : undefined;

function fmt(v: number | null | undefined, decimals = 4): string {
  if (v === null || v === undefined || isNaN(Number(v))) return '  n/a ';
  return Number(v).toFixed(decimals).padStart(7);
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    const corpusClause = argCorpus ? `AND corpus_version = $1` : '';
    const params = argCorpus ? [argCorpus] : [];

    const { rows } = await pool.query(`
      SELECT
        ablation_config_name,
        ablation_id,
        COUNT(DISTINCT query_id)::int AS query_count,
        COUNT(*)::int AS result_count,
        AVG(CASE
          WHEN retrieval_rank <= 10 AND ground_truth_grade IS NOT NULL
          THEN ground_truth_grade::float / ln(retrieval_rank::float + 1)
          ELSE 0
        END) AS ndcg_10,
        AVG(CASE WHEN ground_truth_grade >= 1 THEN 1.0 / retrieval_rank ELSE NULL END) AS mrr,
        COUNT(CASE WHEN retrieval_rank <= 5 AND ground_truth_grade >= 1 THEN 1 END)::float /
          NULLIF(COUNT(CASE WHEN retrieval_rank <= 5 THEN 1 END), 0) AS p5,
        COUNT(CASE WHEN retrieval_rank <= 10 AND ground_truth_grade >= 1 THEN 1 END)::float /
          NULLIF(COUNT(CASE WHEN retrieval_rank <= 10 THEN 1 END), 0) AS p10,
        COUNT(CASE WHEN retrieval_rank <= 10 AND ground_truth_grade >= 1 THEN 1 END)::float /
          NULLIF(COUNT(CASE WHEN ground_truth_grade >= 1 THEN 1 END), 0) AS r10
      FROM evaluation_results
      WHERE ground_truth_grade IS NOT NULL
        ${corpusClause}
      GROUP BY ablation_config_name, ablation_id
      ORDER BY ablation_id
    `, params);

    if (rows.length === 0) {
      console.log('\nNo evaluation results found.');
      console.log('Run `npm run phase2f:evaluate` to populate evaluation_results.\n');
      return;
    }

    const best = rows.reduce((a: typeof rows[0], b: typeof rows[0]) =>
      (Number(a.ndcg_10 ?? 0) >= Number(b.ndcg_10 ?? 0) ? a : b));

    console.log('\n');
    console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│           Phase 2F.1 Ablation Comparison (from evaluation_results)          │');
    if (argCorpus) console.log(`│  Corpus: ${argCorpus.padEnd(68)}│`);
    console.log('├──────────────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┤');
    console.log('│ Ablation                 │ Queries │ NDCG@10 │   MRR   │   P@5   │  P@10   │');
    console.log('├──────────────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤');

    for (const r of rows) {
      const isBest = r === best;
      const star = isBest ? '★ ' : '  ';
      const name = (star + (r.ablation_config_name ?? 'unknown')).padEnd(26).slice(0, 26);
      const qc = String(r.query_count ?? 0).padStart(7);
      const ndcg = fmt(r.ndcg_10);
      const mrrV = fmt(r.mrr);
      const p5 = fmt(r.p5);
      const p10 = fmt(r.p10);
      console.log(`│ ${name}│${qc} │${ndcg} │${mrrV} │${p5} │${p10} │`);
    }

    console.log('├──────────────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┤');
    console.log(`│  Recall@10 breakdown:                                                      │`);
    console.log('├──────────────────────────┬─────────────────────────────────────────────────┤');
    console.log('│ Ablation                 │  R@10   │ Result count                          │');
    console.log('├──────────────────────────┼─────────────────────────────────────────────────┤');

    for (const r of rows) {
      const name = (r.ablation_config_name ?? 'unknown').padEnd(26).slice(0, 26);
      const r10 = fmt(r.r10);
      const rc = String(r.result_count ?? 0).padStart(8);
      console.log(`│ ${name}│${r10} │${rc} results                        │`);
    }

    console.log('└──────────────────────────┴─────────────────────────────────────────────────┘');
    console.log(`\n  ★ Best NDCG@10: ${best.ablation_config_name} (${Number(best.ndcg_10 ?? 0).toFixed(4)})`);
    console.log('    Recommendation: use this configuration for Phase 2F.2 production baseline.\n');

  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
