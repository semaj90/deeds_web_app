#!/usr/bin/env npx tsx
/**
 * run-pagerank-analysis.mts — CLI entry point for Patch C's PageRank adapter
 * (openspec/changes/parent-atlas-graph-analysis-contract).
 *
 * Runs neo4j-gds-client.ts's PageRank against the live 'codeTopology'
 * projection, resolves CodebaseFile.path -> atlas_packets.packet_key, and
 * writes graph_analysis_runs + graph_node_metrics rows.
 *
 * Usage: npx tsx scripts/atlas/run-pagerank-analysis.mts
 * (run from sveltekit-frontend/ so $lib aliases resolve inside neo4j-gds-client.ts)
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { runPageRankAnalysis } from '../../src/lib/server/graph/pagerank-analysis-adapter.js';

const db = new Pool({
  host: process.env.POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
});

async function main() {
  const result = await runPageRankAnalysis(db, { maxIterations: 20, dampingFactor: 0.85 });
  console.log(JSON.stringify({
    runId: result.run.runId,
    nodeCount: result.run.nodeCount,
    relationshipCount: result.run.relationshipCount,
    graphRevision: result.run.graphRevision,
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
