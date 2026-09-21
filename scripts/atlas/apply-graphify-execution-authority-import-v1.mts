#!/usr/bin/env node
/**
 * GRAPHIFY-EXECUTION-IDENTITY-MODEL-02B apply runner + receipt owner.
 *
 * Default = REHEARSAL: runs 02B inside a transaction with an obviously non-real receipt, reads back, ROLLS BACK. Writes only a plan report.
 * `--apply --authorization "apply 02B"` = the ONLY mutating path. The authorization text must be the operator's exact words.
 *
 * Receipt ownership (this file is the owner):
 *   1. read preconditions, 2. write the immutable receipt file docs/reports/graphify-execution-authority-import-receipt-v1.json
 *   (schema atlas.graphify-execution-authority-import-receipt.v1: pre-state, sha256 of the 02B SQL file, authorization text, timestamp),
 *   3. receiptId = "sha256:" + sha256(receipt file bytes) -> set as atlas.import_receipt, 4. run 02B + readback in ONE transaction,
 *   5. write the post-apply readback to a SEPARATE file (the receipt itself is never modified after step 2).
 * Refuses to apply if the authority table is not empty, a receipt file already exists, or preconditions fail.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const SQL_PATH = path.join(REPO_ROOT, 'sveltekit-frontend/drizzle/manual/20260921b_graphify_execution_authority_legacy_import_DRAFT.sql');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs/reports/graphify-execution-authority-import-receipt-v1.json');
const POST_PATH = path.join(REPO_ROOT, 'docs/reports/graphify-execution-authority-import-postapply-v1.json');
const PLAN_PATH = path.join(REPO_ROOT, 'docs/reports/graphify-execution-authority-import-rehearsal-v1.json');
const REQUIRED_AUTHORIZATION = 'apply 02B';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const authorization = args.includes('--authorization') ? args[args.indexOf('--authorization') + 1] : undefined;
const sha256 = (buf: Buffer | string) => crypto.createHash('sha256').update(buf).digest('hex');

if (apply && authorization !== REQUIRED_AUTHORIZATION) {
  console.error(`REFUSED: --apply requires --authorization "${REQUIRED_AUTHORIZATION}" (the operator's exact words).`);
  process.exit(2);
}

const sql = fs.readFileSync(SQL_PATH);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const client = await pool.connect();

async function readState() {
  const legacy = (await client.query(`SELECT execution_id::text AS execution_id, workspace_id::text AS workspace_id, workspace_revision, status FROM public.graphify_executions WHERE canonical_authority IS TRUE`)).rows;
  const authority = (await client.query(`SELECT execution_id::text AS execution_id, authority_state, selected_at, selected_by, selection_receipt, imported_at, import_receipt FROM public.graphify_execution_authority`)).rows;
  return { legacy, authority };
}

const blockers: string[] = [];
let exitCode = 0;
try {
  const pre = await readState();
  if (pre.authority.length !== 0) blockers.push(`AUTHORITY_TABLE_NOT_EMPTY:${pre.authority.length}`);
  if (pre.legacy.length !== 1) blockers.push(`LEGACY_CANONICAL_ROWS_NOT_ONE:${pre.legacy.length}`);
  if (pre.legacy[0] && !['COMPLETED', 'COMPLETED_REUSED'].includes(pre.legacy[0].status)) blockers.push(`LEGACY_CANONICAL_NOT_COMPLETED:${pre.legacy[0].status}`);
  if (apply && fs.existsSync(RECEIPT_PATH)) blockers.push('RECEIPT_FILE_ALREADY_EXISTS');

  const base = { sqlFile: path.relative(REPO_ROOT, SQL_PATH), sqlSha256: `sha256:${sha256(sql)}`, preState: pre, blockers };

  if (blockers.length > 0) {
    fs.writeFileSync(PLAN_PATH, `${JSON.stringify({ schema: 'atlas.graphify-execution-authority-import-rehearsal.v1', mode: 'BLOCKED', ...base, writesPerformed: false }, null, 2)}\n`);
    console.error(`BLOCKED: ${blockers.join(', ')}`);
    exitCode = 1;
  } else if (!apply) {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('atlas.import_receipt', 'REHEARSAL-NOT-A-RECEIPT', true)`);
    await client.query(sql.toString('utf8'));
    const inTx = await readState();
    await client.query('ROLLBACK');
    const after = await readState();
    const row = inTx.authority[0];
    const ok = inTx.authority.length === 1 && row.authority_state === 'LEGACY_IMPORTED' && row.execution_id === pre.legacy[0].execution_id
      && row.selected_at === null && row.selected_by === null && row.selection_receipt === null && after.authority.length === 0;
    fs.writeFileSync(PLAN_PATH, `${JSON.stringify({
      schema: 'atlas.graphify-execution-authority-import-rehearsal.v1', generatedAt: new Date().toISOString(), mode: 'REHEARSAL_ROLLED_BACK', ...base,
      inTransaction: inTx.authority, afterRollbackAuthorityRows: after.authority.length, rehearsalOk: ok, writesPerformed: false,
    }, null, 2)}\n`);
    console.log(JSON.stringify({ mode: 'REHEARSAL_ROLLED_BACK', rehearsalOk: ok, inTransactionRows: inTx.authority.length, afterRollbackAuthorityRows: after.authority.length }));
    if (!ok) exitCode = 1;
  } else {
    const receipt = {
      schema: 'atlas.graphify-execution-authority-import-receipt.v1', generatedAt: new Date().toISOString(),
      operatorAuthorization: authorization, ...base,
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    fs.writeFileSync(RECEIPT_PATH, receiptBytes, { flag: 'wx' });
    const receiptId = `sha256:${sha256(receiptBytes)}`;
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('atlas.import_receipt', $1, true)`, [receiptId]);
      await client.query(sql.toString('utf8'));
      const inTx = await readState();
      const row = inTx.authority[0];
      if (!(inTx.authority.length === 1 && row.authority_state === 'LEGACY_IMPORTED' && row.execution_id === pre.legacy[0].execution_id && row.selected_by === null && row.import_receipt === receiptId)) {
        throw new Error('POST_IMPORT_READBACK_MISMATCH');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
    const post = await readState();
    fs.writeFileSync(POST_PATH, `${JSON.stringify({ schema: 'atlas.graphify-execution-authority-import-postapply.v1', generatedAt: new Date().toISOString(), receiptId, receiptFile: path.relative(REPO_ROOT, RECEIPT_PATH), postState: post, applied: true }, null, 2)}\n`);
    console.log(JSON.stringify({ mode: 'APPLIED', receiptId, authorityRows: post.authority.length }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
process.exit(exitCode);
