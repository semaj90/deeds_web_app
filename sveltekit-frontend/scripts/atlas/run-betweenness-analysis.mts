#!/usr/bin/env npx tsx
/**
 * run-betweenness-analysis.mts — CLI entry point for Patch H's betweenness adapter.
 *
 * Runs in sampled mode by default (samplingSize=1000) rather than exact —
 * per the Patch H pre-flight plan's explicit cost warning, exact betweenness
 * (Brandes' algorithm, O(V*E)) is substantially more expensive than
 * PageRank/k-core at ~58K nodes and must not be run blind. Pass
 * --exact to run the exact variant instead (distinct algorithmRevision,
 * not a silent fallback).
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { runBetweennessAnalysis } from '../../src/lib/server/graph/betweenness-analysis-adapter.js';

const db = new Pool({
  host: process.env.POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
});

const EXACT = process.argv.includes('--exact');

async function main() {
  const t0 = Date.now();
  const result = await runBetweennessAnalysis(db, EXACT ? {} : { samplingSize: 1000, samplingSeed: 42 });
  console.log(JSON.stringify({
    mode: EXACT ? 'exact' : 'sampled(k=1000,seed=42)',
    elapsedMs: Date.now() - t0,
    runId: result.run.runId,
    status: result.run.status,
    algorithmRevision: result.run.algorithmRevision,
    parameterRevision: result.run.parameterRevision,
    nodeCount: result.run.nodeCount,
    relationshipCount: result.run.relationshipCount,
    metricsWritten: result.metricsWritten,
    unresolvedPacketKeys: result.unresolvedPacketKeys,
  }, null, 2));
  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
