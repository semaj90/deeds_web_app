#!/usr/bin/env npx tsx
/** run-kcore-analysis.mts — CLI entry point for Patch G's k-core adapter. */
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
  const result = await runGraphAnalysis(db, { algorithm: 'kcore' });
  console.log(JSON.stringify({
    runId: result.run.runId,
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
