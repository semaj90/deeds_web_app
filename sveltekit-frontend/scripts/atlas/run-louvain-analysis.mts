#!/usr/bin/env npx tsx
/**
 * run-louvain-analysis.mts — CLI entry point for Patch D's Louvain adapter
 * (openspec/changes/parent-atlas-graph-analysis-contract), via
 * graph-analysis-runner.ts's runGraphAnalysis() dispatcher.
 *
 * Usage: npx tsx scripts/atlas/run-louvain-analysis.mts
 * (run from sveltekit-frontend/ so $lib aliases resolve)
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { runGraphAnalysis } from '../../src/lib/server/graph/graph-analysis-runner.js';

const db = new Pool({
  host: process.env.POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
});

async function main() {
  const result = await runGraphAnalysis(db, { algorithm: 'louvain' });
  console.log(JSON.stringify({
    runId: result.run.runId,
    status: result.run.status,
    nodeCount: result.run.nodeCount,
    relationshipCount: result.run.relationshipCount,
    communitiesWritten: result.communitiesWritten,
    unresolvedPacketKeys: result.unresolvedPacketKeys,
    skippedReason: result.skippedReason ?? null,
  }, null, 2));
  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
