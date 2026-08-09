#!/usr/bin/env npx tsx
/**
 * One-off live verification for the newly-wired PageRankPromotionGate.
 * Run from sveltekit-frontend/ (module aliases require it):
 *   npx tsx scripts/atlas/verify-pagerank-promotion-gate.mts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PageRankPromotionGate } from '../../src/lib/server/graph/pagerank-promotion-gate.js';

const RUN_ID = '05d5c943-7655-4aae-b67a-701734828a47';
const GRAPH_SNAPSHOT_ID = '03f54954-be14-47d7-a32a-6207dc088afa';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const gate = new PageRankPromotionGate(pool);
  try {
    const result = await gate.validateRun(RUN_ID, GRAPH_SNAPSHOT_ID);
    console.log(JSON.stringify(result, null, 2));
    console.log(result.passed ? '\nPASS' : '\nFAIL');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('ERROR', err);
  process.exitCode = 1;
});
