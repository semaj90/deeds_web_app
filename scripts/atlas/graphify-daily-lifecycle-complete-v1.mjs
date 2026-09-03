#!/usr/bin/env node
// GRAPHIFY-OPEN-CLOSE-LIVE-WIRING-01 (2026-09-03): second half of the real open->bind->complete
// lifecycle. Reads the receipt written by graphify-daily-lifecycle-open-v1.mjs (run_id +
// workspace_id of the row that script opened+bound) and closes exactly that row
// (RUNNING -> COMPLETED) via the proven completeGraphifyRunV2 primitive. Fails closed: if the
// receipt is missing, stale (already COMPLETED), or the row no longer matches
// (run_id, workspace_id, status='RUNNING'), this exits non-zero rather than fabricating success --
// per completeGraphifyRunInTransactionV2's own existing fail-closed contract.
//
// Invoked via `npx tsx` for the same reason as the open script (dynamic-importing a .ts writer
// module from plain `node` fails on this repo's toolchain).
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');
const RECEIPT_PATH = path.resolve(ROOT, 'docs/reports/graphify-daily-lifecycle-v1.json');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, 'utf8'));
  if (receipt.status !== 'RUNNING' || !receipt.runId || !receipt.workspaceId) {
    throw new Error(`GRAPHIFY_DAILY_LIFECYCLE_RECEIPT_NOT_COMPLETABLE:${JSON.stringify({ status: receipt.status, runId: receipt.runId })}`);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const client = await pool.connect();
  try {
    const { completeGraphifyRunV2 } = await import(
      'file:///' + path.resolve(FRONTEND, 'src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts').replace(/\\/g, '/')
    );
    const wrappedClient = { query: (text, values) => client.query(text, values) };

    const completed = await completeGraphifyRunV2({
      client: wrappedClient,
      runId: receipt.runId,
      workspaceId: receipt.workspaceId,
    });
    console.log(JSON.stringify({ step: 'completed', runId: completed.runId, status: completed.status, completedAt: completed.completedAt }));

    writeFileSync(RECEIPT_PATH, JSON.stringify({
      ...receipt,
      status: 'COMPLETED',
      completedAt: completed.completedAt,
    }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'LIFECYCLE_COMPLETE', runId: completed.runId, receiptPath: RECEIPT_PATH }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`GRAPHIFY_DAILY_LIFECYCLE_COMPLETE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
