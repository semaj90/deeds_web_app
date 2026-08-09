#!/usr/bin/env npx tsx
/**
 * run-cheirank-analysis.mts — CLI entry point for Patch F's CheiRank adapter
 * (openspec/changes/parent-atlas-graph-analysis-contract).
 *
 * Usage: npx tsx scripts/atlas/run-cheirank-analysis.mts
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
  const result = await runGraphAnalysis(db, { algorithm: 'cheirank' });
  console.log(JSON.stringify({
    runId: result.run.runId,
    algorithm: result.run.algorithm,
    projectionName: result.run.projectionName,
    status: result.run.status,
    nodeCount: result.run.nodeCount,
    relationshipCount: result.run.relationshipCount,
    metricsWritten: result.metricsWritten,
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
