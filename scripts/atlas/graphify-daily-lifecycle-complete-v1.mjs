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
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');
const RECEIPT_PATH = path.resolve(ROOT, 'docs/reports/graphify-daily-lifecycle-v1.json');

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const TERMINAL_AUTHORIZATION = 'AUTHORIZE_GRAPHIFY_POST_PHASE16_TERMINAL_RUN_V1';
const SNAPSHOT_TERMINAL_STATUS = process.env.ATLAS_GRAPHIFY_SNAPSHOT_TERMINAL_STATUS ?? 'COMPLETED';
const SNAPSHOT_TERMINAL_ERROR_CODE = process.env.ATLAS_GRAPHIFY_SNAPSHOT_TERMINAL_ERROR_CODE;

async function main() {
  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, 'utf8'));

  // Snapshot-native opener receipts belong to graphify_executions and the
  // repository-qualified membership_v2 owner. Keep this branch schema-gated
  // so legacy graphify_runs receipts retain their existing completion path.
  if (receipt.schema === 'atlas.graphify-daily-snapshot-native-open.v1') {
    if (process.env.ATLAS_GRAPHIFY_TERMINAL_AUTHORIZATION !== TERMINAL_AUTHORIZATION) {
      throw new Error(`GRAPHIFY_TERMINAL_AUTHORIZATION=${TERMINAL_AUTHORIZATION} is required`);
    }
    if (receipt.status !== 'SNAPSHOT_NATIVE_EXECUTION_OPENED' || !receipt.executionId) {
      throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_RECEIPT_NOT_COMPLETABLE:${JSON.stringify({ status: receipt.status, executionId: receipt.executionId })}`);
    }
    if (!['COMPLETED', 'FAILED'].includes(SNAPSHOT_TERMINAL_STATUS)) {
      throw new Error(`GRAPHIFY_SNAPSHOT_NATIVE_TERMINAL_STATUS_INVALID:${SNAPSHOT_TERMINAL_STATUS}`);
    }
    if (SNAPSHOT_TERMINAL_STATUS === 'FAILED' && !SNAPSHOT_TERMINAL_ERROR_CODE) {
      throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_FAILED_REQUIRES_ERROR_CODE');
    }
    if (SNAPSHOT_TERMINAL_STATUS === 'COMPLETED' && SNAPSHOT_TERMINAL_ERROR_CODE) {
      throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_COMPLETED_FORBIDS_ERROR_CODE');
    }
    const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    const client = await pool.connect();
    try {
      const { completeExecution } = await import(
        'file:///' + path.resolve(FRONTEND, 'src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.ts').replace(/\\/g, '/')
      );
      await completeExecution({ query: (text, values) => client.query(text, values) }, receipt.executionId, {
        status: SNAPSHOT_TERMINAL_STATUS,
        ...(SNAPSHOT_TERMINAL_ERROR_CODE ? { errorCode: SNAPSHOT_TERMINAL_ERROR_CODE } : {}),
      });
      const completedAt = new Date().toISOString();
      const receiptStatus = SNAPSHOT_TERMINAL_STATUS === 'FAILED'
        ? 'SNAPSHOT_NATIVE_EXECUTION_FAILED'
        : 'SNAPSHOT_NATIVE_EXECUTION_COMPLETED';
      writeFileSync(RECEIPT_PATH, JSON.stringify({
        ...receipt,
        status: receiptStatus,
        terminalStatus: SNAPSHOT_TERMINAL_STATUS,
        ...(SNAPSHOT_TERMINAL_ERROR_CODE ? { errorCode: SNAPSHOT_TERMINAL_ERROR_CODE } : {}),
        completedAt,
      }, null, 2) + '\n');
      console.log(JSON.stringify({ status: receiptStatus, executionId: receipt.executionId, terminalStatus: SNAPSHOT_TERMINAL_STATUS, completedAt, receiptPath: RECEIPT_PATH }));
      return;
    } finally {
      client.release();
      await pool.end();
    }
  }

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
