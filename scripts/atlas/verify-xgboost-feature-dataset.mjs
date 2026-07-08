#!/usr/bin/env node
/**
 * Smoke test 5: XGBoost feature dataset readiness
 *
 * Verifies that atlas_packets has the stable features XGBoost needs:
 *   bm25_score, cosine_score / qdrant_point_id, pagerank,
 *   som_index, domain_class (domain_confidence), summary length (quality proxy)
 *
 * Outputs a sample feature row and coverage stats.
 * Does NOT train XGBoost — just validates data readiness.
 *
 * Usage:
 *   node scripts/atlas/verify-xgboost-feature-dataset.mjs
 *   node scripts/atlas/verify-xgboost-feature-dataset.mjs --export features.jsonl
 */

import pg from 'pg';
import fs from 'node:fs';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const exportPath = (() => {
  const idx = process.argv.indexOf('--export');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

let exitCode = 0;

function check(label, coverage, total, threshold = 0.01) {
  const pct = total > 0 ? coverage / total : 0;
  const ok = pct >= threshold;
  const icon = ok ? '✅' : (threshold < 0.5 ? '⚠️ ' : '❌');
  console.log(`  ${icon} ${label}: ${coverage}/${total} (${(pct * 100).toFixed(1)}%)`);
  if (!ok && threshold >= 0.5) exitCode = 1;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Smoke Test 5: XGBoost Feature Dataset Readiness                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  let client;
  try {
    client = await pgPool.connect();

    const res = await client.query(`
      SELECT
        COUNT(*)                                                           AS total,
        COUNT(bm25_score)                                                  AS with_bm25,
        COUNT(qdrant_point_id)                                             AS with_qdrant_id,
        COUNT(som_index)                                                   AS with_som_index,
        COUNT(pagerank)                                                    AS with_pagerank,
        COUNT(domain_class)                                                AS with_domain,
        COUNT(community_id)                                                AS with_community,
        COUNT(CASE WHEN summary IS NOT NULL AND length(summary) > 30
                   THEN 1 END)                                             AS with_good_summary,
        -- Rows with enough features to train on (need at least bm25 + domain)
        COUNT(CASE WHEN bm25_score IS NOT NULL AND domain_class IS NOT NULL
                   THEN 1 END)                                             AS trainable_rows
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const r = res.rows[0];
    const total = Number(r.total);

    console.log(`  Total addressable packets: ${total}\n`);
    console.log('  Feature coverage:');
    check('bm25_score', Number(r.with_bm25), total, 0.01);
    check('qdrant_point_id (cosine proxy)', Number(r.with_qdrant_id), total, 0.01);
    check('som_index', Number(r.with_som_index), total, 0.01);
    check('pagerank', Number(r.with_pagerank), total, 0.01);
    check('domain_class (required)', Number(r.with_domain), total, 0.50);
    check('community_id', Number(r.with_community), total, 0.01);
    check('summary quality (len > 30)', Number(r.with_good_summary), total, 0.01);

    const trainable = Number(r.trainable_rows);
    console.log(`\n  Trainable rows (bm25 + domain): ${trainable} (${(trainable / total * 100).toFixed(1)}%)`);
    if (trainable < 100) {
      console.log('  ⚠️  Too few trainable rows — complete bm25_score backfill first');
      console.log('     node scripts/atlas/backfill-bm25-scores.mjs --apply');
    }

    // Sample feature row
    const sample = await client.query(`
      SELECT
        source_ref,
        COALESCE(bm25_score, 0)::float               AS bm25_score,
        COALESCE(bm25_score, 0)::float               AS cosine_score,
        COALESCE(pagerank, 0)::float                 AS pagerank,
        COALESCE(som_index, -1)::int                 AS som_index,
        COALESCE(community_confidence, 0)::float     AS domain_confidence,
        CASE WHEN summary IS NOT NULL AND length(summary) > 30
             THEN LEAST(length(summary)::float / 500.0, 1.0)
             ELSE 0 END                              AS summary_quality,
        NULL::int                                    AS accepted_reward
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND bm25_score IS NOT NULL
        AND domain_class IS NOT NULL
      LIMIT 5
    `);

    if (sample.rows.length > 0) {
      console.log('\n  Sample feature rows:');
      for (const row of sample.rows) {
        console.log(`    ${JSON.stringify(row, null, 0)}`);
      }

      if (exportPath) {
        const exportRes = await client.query(`
          SELECT
            source_ref,
            packet_key,
            COALESCE(bm25_score, 0)::float               AS bm25_score,
            COALESCE(bm25_score, 0)::float               AS cosine_score,
            COALESCE(pagerank, 0)::float                 AS pagerank,
            COALESCE(som_index, -1)::int                 AS som_index,
            COALESCE(community_confidence, 0)::float     AS domain_confidence,
            CASE WHEN summary IS NOT NULL AND length(summary) > 30
                 THEN LEAST(length(summary)::float / 500.0, 1.0)
                 ELSE 0 END                              AS summary_quality,
            NULL::int                                    AS accepted_reward
          FROM atlas_packets
          WHERE packet_key IS NOT NULL
            AND bm25_score IS NOT NULL
            AND domain_class IS NOT NULL
          LIMIT 10000
        `);
        const lines = exportRes.rows.map(r => JSON.stringify(r)).join('\n');
        fs.writeFileSync(exportPath, lines + '\n');
        console.log(`\n  ✅ Exported ${exportRes.rows.length} feature rows to ${exportPath}`);
      }
    }

    console.log('\n  Required before training:');
    if (Number(r.with_pagerank) === 0) {
      console.log('    node scripts/atlas/compute-pagerank-neo4j.mjs --apply');
    }
    if (Number(r.with_som_index) === 0) {
      console.log('    node scripts/atlas/backfill-som-coordinates.mjs --apply');
    }
    console.log('  Then: node scripts/sidecars/start-xgboost-reranker.mjs');

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    exitCode = 1;
  } finally {
    client?.release();
    await pgPool.end();
  }

  console.log(`\n  Result: ${exitCode === 0 ? '✅ PASS' : '❌ FAIL'}\n`);
  process.exit(exitCode);
}

main();
