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
 *   ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_OWNER_DECISION=1 node scripts/atlas/apply-current-graphify-execution-owner-decision-v1.mjs --execution-id <uuid> --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const root = REPO_ROOT;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const AUTHORIZED = process.env.ATLAS_AUTHORIZE_GRAPHIFY_EXECUTION_OWNER_DECISION === '1';
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
  mode: APPLY && AUTHORIZED ? 'APPLY' : 'DRY_RUN',
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

  if (APPLY && AUTHORIZED) {
    await pool.query('BEGIN');
    try {
      // Demote every other candidate sharing this workspace_revision first, so at most one
      // execution ever carries canonical_authority=true for this admitted revision.
      await pool.query(
        `update public.graphify_executions
            set canonical_authority = false
          where execution_id = any($1::uuid[]) and execution_id != $2::uuid`,
        [candidateExecutionIds, CHOSEN_EXECUTION_ID],
      );
      const updateResult = await pool.query(
        `update public.graphify_executions
            set canonical_authority = true
          where execution_id = $1::uuid
          returning execution_id::text, canonical_authority`,
        [CHOSEN_EXECUTION_ID],
      );
      if (updateResult.rowCount !== 1) throw new Error(`EXECUTION_ID_NOT_FOUND_AT_APPLY_TIME:${CHOSEN_EXECUTION_ID}`);
      await pool.query('COMMIT');
      report.writesPerformed = true;
    } catch (caught) {
      await pool.query('ROLLBACK');
      throw caught;
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
