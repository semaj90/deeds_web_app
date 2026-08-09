#!/usr/bin/env npx tsx
/**
 * evaluate-community-taxonomy.mts — CLI entry point for Patch E's
 * community-taxonomy-policy.ts evaluator
 * (openspec/changes/parent-atlas-graph-analysis-contract).
 *
 * Produces the comparison table README point 10 asked for: community
 * quality by algorithm x relationship-semantics projection, instead of
 * tuning Leiden's resolution parameter on the undifferentiated combined
 * graph.
 *
 * Usage: npx tsx scripts/atlas/evaluate-community-taxonomy.mts
 * (run from sveltekit-frontend/ so $lib aliases resolve)
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { evaluateAllCommunityRuns } from '../../src/lib/server/graph/community-taxonomy-policy.js';

const db = new Pool({
  host: process.env.POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
});

async function main() {
  const results = await evaluateAllCommunityRuns(db);
  console.log(JSON.stringify(results, null, 2));
  console.log('\n--- Comparison table ---');
  console.log(
    'algorithm'.padEnd(9),
    'projection'.padEnd(20),
    'coverage'.padEnd(9),
    'modularity'.padEnd(11),
    'communities'.padEnd(12),
    'singletonRatio'.padEnd(15),
    'p50'.padEnd(6),
    'p95'.padEnd(6),
    'max',
  );
  for (const r of results) {
    const e = r.evaluation;
    console.log(
      r.algorithm.padEnd(9),
      r.projectionName.padEnd(20),
      e.coverage.toFixed(3).padEnd(9),
      e.modularity.toFixed(4).padEnd(11),
      String(e.communityCount).padEnd(12),
      e.singletonRatio.toFixed(3).padEnd(15),
      String(e.p50CommunitySize).padEnd(6),
      String(e.p95CommunitySize).padEnd(6),
      String(e.maxCommunitySize),
    );
  }
  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
