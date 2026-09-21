#!/usr/bin/env node

/**
 * Apply an EXPLICIT human authority decision for Gate 0A
 * (GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02): flips `graphify_executions.canonical_authority`
 * to `true` for exactly one operator-chosen execution_id, and confirms every other
 * candidate execution sharing the same workspace_revision stays `false`.
 *
 * This script is intentionally inert unless ALL of the following are supplied:
 *   --execution-id <uuid>          the execution_id the operator has explicitly chosen
 *   --apply                        without this flag, runs read-only dry-run only
 *   ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_OWNER_DECISION=1   dedicated authorization env var
 *
 * It does NOT decide which execution_id to use. That decision is Gate 0A's own explicit
 * output requirement (`recommendation.type: EQUIVALENT_EXECUTIONS_REQUIRE_EXPLICIT_AUTHORITY`,
 * `requiresExplicitAuthorityDecision: true`) -- see
 * docs/reports/current-graphify-execution-owner-resolution-v1.json for the two candidate
 * execution_ids and their (byte-identical) evidence checksums this decision is based on.
 *
 * Pre-apply invariant checked before any write: the chosen execution_id must be one of the
 * candidates the read-only resolution script (plan-current-graphify-execution-owner-resolution-v1.mjs)
 * already classified as DUPLICATE_EQUIVALENT_EXECUTIONS with allEquivalent:true -- this script
 * refuses to promote an execution that hasn't been through that read-only proof.
 *
 * Usage:
 *   node scripts/atlas/apply-current-graphify-execution-owner-decision-v1.mjs --execution-id <uuid>              # dry-run
 *   node scripts/atlas/apply-current-graphify-execution-owner-decision-v1.mjs --execution-id <uuid> --rehearse    # real tx body, ROLLED BACK
 * The owner is graphify_execution_authority (post-02B); canonical_authority is kept in step as the legacy field. --apply also needs
 * --selected-by <operator> --selection-receipt <real receipt id>.
 *   ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_OWNER_DECISION=1 node scripts/atlas/apply-current-graphify-execution-owner-decision-v1.mjs --execution-id <uuid> --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { applyGraphifyOwnerDecisionV1 } from './lib/graphify-owner-decision-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const root = REPO_ROOT;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const AUTHORIZED = process.env.ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_OWNER_DECISION === '1';
const REHEARSE = args.includes('--rehearse');
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const SELECTED_BY = argValue('--selected-by');
const SELECTION_RECEIPT = argValue('--selection-receipt');
const execArgIndex = args.indexOf('--execution-id');
const CHOSEN_EXECUTION_ID = execArgIndex >= 0 ? args[execArgIndex + 1] : null;

const resolutionPath = path.join(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const reportPath = path.join(root, 'docs/reports/current-graphify-execution-owner-decision-v1.json');

if (!CHOSEN_EXECUTION_ID) {
  throw new Error(
    'EXECUTION_ID_REQUIRED: this script never picks an execution_id itself. ' +
      'Read docs/reports/current-graphify-execution-owner-resolution-v1.json, have an ' +
      'operator explicitly choose one of `candidateExecutionIds`, then pass it via --execution-id.',
  );
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(CHOSEN_EXECUTION_ID)) {
  throw new Error(`INVALID_EXECUTION_ID_FORMAT:${CHOSEN_EXECUTION_ID}`);
}

if (!fs.existsSync(resolutionPath)) {
  throw new Error('GATE_0A_RESOLUTION_REPORT_MISSING: run plan-current-graphify-execution-owner-resolution-v1.mjs first');
}
const resolution = JSON.parse(fs.readFileSync(resolutionPath, 'utf8'));
if (resolution.status !== 'DUPLICATE_EQUIVALENT_EXECUTIONS' || resolution.equivalence?.allEquivalent !== true) {
  throw new Error(
    `GATE_0A_NOT_EQUIVALENT: resolution status is "${resolution.status}", not the proven-equivalent ` +
      'case this apply script was built for. A genuinely divergent case needs separate review, not this path.',
  );
}
const candidateExecutionIds = (resolution.candidates ?? []).map((c) => c.execution_id);
if (!candidateExecutionIds.includes(CHOSEN_EXECUTION_ID)) {
  throw new Error(
    `EXECUTION_ID_NOT_A_PROVEN_CANDIDATE:${CHOSEN_EXECUTION_ID}. ` +
      `Must be one of: ${JSON.stringify(candidateExecutionIds)}`,
  );
}

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 2,
  statement_timeout: 30_000,
  application_name: 'apply-current-graphify-execution-owner-decision-v1',
});

const report = {
  schema: 'atlas.current-graphify-execution-owner-decision.v1',
  generatedAt: new Date().toISOString(),
  gate: 'GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02',
  mode: APPLY && AUTHORIZED ? 'APPLY' : REHEARSE ? 'REHEARSAL_ROLLED_BACK' : 'DRY_RUN',
  authorityTableOwner: 'graphify_execution_authority',
  chosenExecutionId: CHOSEN_EXECUTION_ID,
  otherCandidateExecutionIds: candidateExecutionIds.filter((id) => id !== CHOSEN_EXECUTION_ID),
  authorizedEnvVarPresent: AUTHORIZED,
  applyFlagPresent: APPLY,
  writesPerformed: false,
  before: null,
  after: null,
  readbackVerified: false,
};

try {
  const before = await pool.query(
    `select execution_id::text, canonical_authority, workspace_revision::text
       from public.graphify_executions
      where execution_id = any($1::uuid[])`,
    [candidateExecutionIds],
  );
  report.before = before.rows;

  if (REHEARSE && !(APPLY && AUTHORIZED)) {
    // Rehearsal: run the real transaction body with obviously non-real provenance, then ROLL BACK. Nothing persists.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rehearsal = await applyGraphifyOwnerDecisionV1(client, { chosenExecutionId: CHOSEN_EXECUTION_ID, selectedBy: 'REHEARSAL', selectionReceipt: 'REHEARSAL-NOT-A-RECEIPT' });
      report.rehearsal = { legacy: rehearsal.legacy, authority: rehearsal.authority, previousAuthority: rehearsal.previousAuthority };
      report.readbackVerified = true;
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  if (APPLY && AUTHORIZED) {
    if (!SELECTED_BY || !SELECTION_RECEIPT) {
      throw new Error('SELECTION_PROVENANCE_REQUIRED: pass --selected-by <operator> and --selection-receipt <real receipt id>; this script never invents either.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        report.applied = await applyGraphifyOwnerDecisionV1(client, { chosenExecutionId: CHOSEN_EXECUTION_ID, selectedBy: SELECTED_BY, selectionReceipt: SELECTION_RECEIPT });
        await client.query('COMMIT');
        report.writesPerformed = true;
      } catch (caught) {
        await client.query('ROLLBACK');
        throw caught;
      }
    } finally {
      client.release();
    }

    const after = await pool.query(
      `select execution_id::text, canonical_authority, workspace_revision::text
         from public.graphify_executions
        where execution_id = any($1::uuid[])`,
      [candidateExecutionIds],
    );
    report.after = after.rows;
    report.readbackVerified =
      after.rows.find((r) => r.execution_id === CHOSEN_EXECUTION_ID)?.canonical_authority === true &&
      after.rows.filter((r) => r.execution_id !== CHOSEN_EXECUTION_ID).every((r) => r.canonical_authority === false);
  }
} finally {
  await pool.end();
}

report.reportChecksum = createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(
  { mode: report.mode, chosenExecutionId: CHOSEN_EXECUTION_ID, writesPerformed: report.writesPerformed, readbackVerified: report.readbackVerified, reportPath: 'docs/reports/current-graphify-execution-owner-decision-v1.json' },
  null,
  2,
));
