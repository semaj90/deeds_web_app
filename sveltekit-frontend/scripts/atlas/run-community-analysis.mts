#!/usr/bin/env npx tsx
/**
 * run-community-analysis.mts — CLI entry point for Patch E's Louvain/Leiden
 * comparison across named projections
 * (openspec/changes/parent-atlas-graph-analysis-contract), via
 * graph-analysis-runner.ts's runGraphAnalysis() dispatcher.
 *
 * Usage: npx tsx scripts/atlas/run-community-analysis.mts <algorithm> <namedProjection>
 *   e.g. npx tsx scripts/atlas/run-community-analysis.mts louvain atlas_dependency_v1
 * (run from sveltekit-frontend/ so $lib aliases resolve)
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { runGraphAnalysis } from '../../src/lib/server/graph/graph-analysis-runner.js';
import type { NamedProjectionCandidate } from '../../src/lib/server/graph/graph-projection-manifest.js';

const algorithm = process.argv[2] as 'louvain' | 'leiden';
const namedProjection = process.argv[3] as NamedProjectionCandidate;

if (algorithm !== 'louvain' && algorithm !== 'leiden') {
  console.error('Usage: run-community-analysis.mts <louvain|leiden> <namedProjection>');
  process.exit(1);
}

const db = new Pool({
  host: process.env.POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
});

async function main() {
  const result = await runGraphAnalysis(db, { algorithm, namedProjection });
  console.log(JSON.stringify({
    runId: result.run.runId,
    algorithm: result.run.algorithm,
    projectionName: result.run.projectionName,
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
