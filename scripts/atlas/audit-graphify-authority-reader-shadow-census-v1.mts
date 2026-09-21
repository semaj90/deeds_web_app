#!/usr/bin/env node
/**
 * S01-02 — consolidated 8/8 Graphify authority reader shadow census. READ-ONLY.
 * Runs each known reader with its established baseline arguments (no --apply anywhere), reads the
 * `authorityShadow` block the reader itself emitted, and asserts legacy == authority == the expected execution
 * with the legacy boolean still the runtime owner. It adds NO authority-selection logic of its own.
 * Fails closed: a reader that exits non-zero, emits no observation, or disagrees is reported, never omitted.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadAuthorityShadowModuleV1 } from './lib/load-authority-shadow-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX_CLI = resolve(ROOT, 'sveltekit-frontend/node_modules/tsx/dist/cli.mjs');
const REPORT = resolve(ROOT, 'docs/reports/graphify-authority-reader-shadow-census-v1.json');
const EXPECTED_EXECUTION = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const EXPECTED_RUN_ID = '01a8d8fc-2507-4f39-868e-039039237b98';
const digest = (bytes: Buffer | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fileDigest = (rel: string) => (existsSync(resolve(ROOT, rel)) ? digest(readFileSync(resolve(ROOT, rel))) : null);

type Reader = {
  readerId: string; readerPath: string; invocationClass: string; args: string[];
  reportRel: string | null; inProcess?: boolean;
};

// Established baseline invocations. Nothing here passes --apply or --rollback-canary.
const READERS: Reader[] = [
  { readerId: 'binding-audit', readerPath: 'scripts/atlas/audit-graphify-workspace-snapshot-binding-v1.mts', invocationClass: 'tsx', args: [], reportRel: 'docs/reports/graphify-workspace-snapshot-binding-v1.json' },
  { readerId: 'repair-planner', readerPath: 'scripts/atlas/plan-current-source-authority-repair-v1.mts', invocationClass: 'tsx', args: [], reportRel: 'docs/reports/current-source-authority-repair-plan-v1.json' },
  { readerId: 'run-owner', readerPath: 'scripts/atlas/audit-current-graphify-run-owner-v1.mjs', invocationClass: 'node', args: [], reportRel: 'docs/reports/current-graphify-run-owner-v1.json' },
  { readerId: 'snapshot-authority', readerPath: 'scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts', invocationClass: 'tsx', args: ['--execution-id', EXPECTED_EXECUTION], reportRel: 'docs/reports/current-graphify-snapshot-authority-v1.json' },
  { readerId: 'source-bridge-reconciliation', readerPath: 'scripts/atlas/audit-current-graphify-source-bridge-reconciliation-v1.mjs', invocationClass: 'node', args: ['--execution-id', EXPECTED_EXECUTION], reportRel: 'docs/reports/current-graphify-source-bridge-reconciliation-v1.json' },
  { readerId: 'admission-panel', readerPath: 'sveltekit-frontend/src/lib/server/atlas/admission/workspace-admission-panel-v1.ts', invocationClass: 'BUILDER_WITH_LIVE_HELPER (panel unit suite + live shared-helper observation; the panel loader needs the SvelteKit runtime for its $lib DB import and cannot run standalone)', args: [], reportRel: null, inProcess: true },
  { readerId: 'source-owner-reconciliation', readerPath: 'scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs', invocationClass: 'node', args: [], reportRel: 'docs/reports/current-source-owner-reconciliation-v1.json' },
  { readerId: 'run-bridge-preflight', readerPath: 'scripts/atlas/apply-graphify-execution-run-bridge-v1.mjs', invocationClass: 'node (preflight, no --apply)', args: [`--execution-id=${EXPECTED_EXECUTION}`, `--run-id=${EXPECTED_RUN_ID}`], reportRel: 'docs/reports/graphify-execution-run-bridge-preflight-v1.json' },
];

// APPLY-evidence records that must be byte-identical before and after (rehearsal/preflight files are their own mutable reports).
const HISTORICAL_APPLY_RECORDS = ['docs/reports/current-graphify-execution-owner-decision-v1.json', 'docs/reports/graphify-execution-run-bridge-apply-v1.json'];

async function fingerprint(pool: pg.Pool) {
  const auth = await pool.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(row_to_json(a)::text, '|' ORDER BY execution_id), '')) AS h FROM public.graphify_execution_authority a`);
  const legacy = await pool.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(execution_id::text || ':' || workspace_revision, '|' ORDER BY execution_id), '')) AS h FROM public.graphify_executions WHERE canonical_authority IS TRUE`);
  const total = await pool.query(`SELECT count(*)::int AS n FROM public.graphify_executions`);
  return { authorityRows: auth.rows[0], legacyCanonicalRows: legacy.rows[0], executions: total.rows[0].n };
}

const observationsOf = (shadow: any): any[] => (Array.isArray(shadow?.observations) ? shadow.observations : shadow?.observation ? [shadow.observation] : []);

function judge(reader: Reader, exit: number | null, priorStatus: string | null, report: any | null, shadow: any) {
  const failures: string[] = [];
  if (exit !== 0) failures.push('PROCESS_EXIT_FAILURE');
  const observations = observationsOf(shadow);
  if (shadow?.error) failures.push(`SHADOW_ERROR:${shadow.error}`);
  if (observations.length === 0) failures.push('MISSING_SHADOW_OBSERVATION');
  const target = observations.filter((o) => o.legacyExecutionId === EXPECTED_EXECUTION || o.authorityExecutionId === EXPECTED_EXECUTION);
  if (observations.length > 0 && target.length === 0) failures.push('EXPECTED_EXECUTION_NOT_OBSERVED');
  const t = target[0] ?? null;
  if (target.length > 1) failures.push('AMBIGUOUS_TARGET_OBSERVATION');
  if (t) {
    if (t.legacyExecutionId !== EXPECTED_EXECUTION) failures.push('AMBIGUOUS_OR_MISSING_LEGACY_SELECTION');
    if (t.authorityExecutionId !== EXPECTED_EXECUTION) failures.push('AMBIGUOUS_OR_MISSING_AUTHORITY_SELECTION');
    if (t.parityStatus !== 'PARITY_PROVEN') failures.push(`PARITY_DISAGREEMENT:${t.parityStatus}`);
    if (t.authorityState !== 'LEGACY_IMPORTED') failures.push(`AUTHORITY_STATE:${t.authorityState}`);
    if (t.runtimeSelection !== t.legacyExecutionId || t.runtimeOwner !== 'LEGACY_CANONICAL_AUTHORITY') failures.push('RUNTIME_OWNER_NOT_LEGACY');
    if (t.mutationAuthorized !== false) failures.push('MUTATION_AUTHORIZED');
  }
  // Any other scope a reader observed must not be an actual disagreement (NO_SELECTION = nothing on either side).
  for (const o of observations) if (o !== t && !['PARITY_PROVEN', 'NO_SELECTION'].includes(o.parityStatus)) failures.push(`OTHER_SCOPE_DISAGREEMENT:${o.workspaceRevision}:${o.parityStatus}`);
  const decisionStatus = report?.status ?? report?.decisionStatus ?? null;
  if (priorStatus != null && decisionStatus != null && priorStatus !== decisionStatus) failures.push(`CHANGED_RUNTIME_DECISION:${priorStatus}->${decisionStatus}`);
  // A reader may report writes as a boolean or as a per-store map ({postgres,qdrant,neo4j,valkey,filesystem}); only non-filesystem stores are database writes.
  const rawWrites = report?.writesPerformed ?? report?.writes ?? null;
  const writesPerformed = rawWrites && typeof rawWrites === 'object'
    ? Object.entries(rawWrites).some(([k, v]) => k !== 'filesystem' && (v === true || (typeof v === 'number' && v > 0)))
    : (typeof rawWrites === 'boolean' ? rawWrites : null);
  if (writesPerformed === true) failures.push('READER_REPORTED_WRITES');
  return {
    readerId: reader.readerId, readerPath: reader.readerPath, invocationClass: reader.invocationClass, args: reader.args,
    exitCode: exit, observationCount: observations.length,
    legacyExecutionId: t?.legacyExecutionId ?? null, authorityExecutionId: t?.authorityExecutionId ?? null, authorityState: t?.authorityState ?? null,
    parityStatus: t?.parityStatus ?? null, runtimeSelection: t?.runtimeSelection ?? null, runtimeOwner: t?.runtimeOwner ?? shadow?.runtimeOwner ?? null,
    mutationAuthorized: t?.mutationAuthorized ?? null, readerCutover: false, writesPerformed: writesPerformed ?? 'NOT_REPORTED',
    evidenceClass: reader.inProcess ? 'BUILDER_WITH_LIVE_HELPER' : 'LIVE_READER_RUN',
    decisionStatus, priorDecisionStatus: priorStatus, failures, pass: failures.length === 0,
  };
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const before = { db: await fingerprint(pool), applyRecords: Object.fromEntries(HISTORICAL_APPLY_RECORDS.map((p) => [p, fileDigest(p)])) };

const results: any[] = [];
for (const reader of READERS) {
  const priorStatus = reader.reportRel && existsSync(resolve(ROOT, reader.reportRel)) ? (JSON.parse(readFileSync(resolve(ROOT, reader.reportRel), 'utf8')).status ?? null) : null;
  let exit: number | null = null;
  let report: any = null;
  let shadow: any = null;
  try {
    if (reader.inProcess) {
      // The panel loader cannot run outside SvelteKit ($lib DB import), so its evidence is the panel's own unit suite
      // (pass-through + never-changes-decision tests) plus a live observation from the SAME shared helper the loader calls.
      const vitest = spawnSync(process.execPath, [resolve(ROOT, 'sveltekit-frontend/node_modules/vitest/vitest.mjs'), 'run', 'tests/atlas/workspace-admission-panel-v1.test.ts'], { cwd: resolve(ROOT, 'sveltekit-frontend'), encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
      exit = vitest.status;
      const binding = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/graphify-workspace-snapshot-binding-v1.json'), 'utf8'));
      const admittedRevision = String(binding.admittedWorkspaceRevision);
      const scopeRow = (await pool.query(`SELECT DISTINCT workspace_id::text AS workspace_id FROM public.graphify_executions WHERE workspace_revision = $1`, [admittedRevision])).rows;
      const { loadAuthorityShadowV1 } = await loadAuthorityShadowModuleV1();
      shadow = { runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY', error: scopeRow.length === 1 ? null : `PANEL_SCOPE_NOT_UNIQUE:${scopeRow.length}`, observations: [] as any[] };
      if (scopeRow.length === 1) shadow.observations.push(await loadAuthorityShadowV1(pool as any, { workspaceId: scopeRow[0].workspace_id, workspaceRevision: admittedRevision }));
      report = { status: null, authorityShadow: shadow };
    } else {
      const command = reader.invocationClass === 'tsx' ? [TSX_CLI, resolve(ROOT, reader.readerPath), ...reader.args] : [resolve(ROOT, reader.readerPath), ...reader.args];
      const run = spawnSync(process.execPath, command, { cwd: ROOT, encoding: 'utf8', timeout: 900000, maxBuffer: 256 * 1024 * 1024 });
      exit = run.status;
      if (reader.reportRel && existsSync(resolve(ROOT, reader.reportRel))) {
        report = JSON.parse(readFileSync(resolve(ROOT, reader.reportRel), 'utf8'));
        shadow = report.authorityShadow;
      }
    }
  } catch (error) {
    exit = -1;
    report = { status: null };
    shadow = { error: error instanceof Error ? error.message : String(error), observations: [] };
  }
  results.push(judge(reader, exit, priorStatus, report, shadow));
}

const after = { db: await fingerprint(pool), applyRecords: Object.fromEntries(HISTORICAL_APPLY_RECORDS.map((p) => [p, fileDigest(p)])) };
await pool.end();

const count = (state: string) => results.filter((r) => r.parityStatus === state).length;
const dbUnchanged = JSON.stringify(before.db) === JSON.stringify(after.db);
const applyRecordsUnchanged = JSON.stringify(before.applyRecords) === JSON.stringify(after.applyRecords);
const criteria = {
  readerCount8: results.length === 8,
  allReadersObserved: results.every((r) => r.observationCount > 0),
  allLegacyEqualsAuthorityEqualsExpected: results.every((r) => r.legacyExecutionId === EXPECTED_EXECUTION && r.authorityExecutionId === EXPECTED_EXECUTION),
  authorityStateLegacyImportedAll: results.every((r) => r.authorityState === 'LEGACY_IMPORTED'),
  parityProven8: count('PARITY_PROVEN') === 8,
  mismatchCountZero: results.every((r) => !r.failures.some((f: string) => /DISAGREEMENT|MISMATCH|AMBIGUOUS/.test(f))),
  runtimeOwnerLegacyAll: results.every((r) => r.runtimeOwner === 'LEGACY_CANONICAL_AUTHORITY'),
  mutationAuthorizedFalseAll: results.every((r) => r.mutationAuthorized === false),
  readerCutoverFalse: results.every((r) => r.readerCutover === false),
  noReaderReportedWrites: results.every((r) => r.writesPerformed !== true),
  databaseFingerprintUnchanged: dbUnchanged,
  historicalApplyRecordsUnchanged: applyRecordsUnchanged,
  noReaderFailures: results.every((r) => r.pass),
};
const proven = Object.values(criteria).every(Boolean);
const body = {
  schema: 'atlas.graphify-authority-reader-shadow-census.v1',
  generatedAt: new Date().toISOString(),
  expectedExecutionId: EXPECTED_EXECUTION,
  status: proven ? 'GRAPHIFY_AUTHORITY_READER_SHADOW_02_PROVEN' : 'GRAPHIFY_AUTHORITY_READER_SHADOW_02_BLOCKED',
  runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY',
  readerCutover: false, mutationAuthorized: false,
  // Basis: every reader ran in its read-only mode (no --apply), and the authority table + canonical legacy rows + execution count fingerprint is unchanged.
  databaseWrites: dbUnchanged ? 0 : 'FINGERPRINT_CHANGED', persistentWrites: dbUnchanged && applyRecordsUnchanged ? 0 : 'INTEGRITY_CHECK_FAILED',
  sharedShadowImplementationCount: 1,
  evidenceClassCounts: { LIVE_READER_RUN: results.filter((r) => r.evidenceClass === 'LIVE_READER_RUN').length, BUILDER_WITH_LIVE_HELPER: results.filter((r) => r.evidenceClass === 'BUILDER_WITH_LIVE_HELPER').length },
  limitations: ['admission-panel: loader not runnable outside SvelteKit; evidence is its unit suite plus a live observation from the same shared helper, not a live loader run.'],
  criteria, readerCount: results.length, parityProven: count('PARITY_PROVEN'),
  readers: results,
  integrity: { before, after },
};
writeFileSync(REPORT, `${JSON.stringify({ ...body, receiptChecksum: digest(JSON.stringify(body)) }, null, 2)}\n`);
console.log(JSON.stringify({ status: body.status, criteria, failing: results.filter((r) => !r.pass).map((r) => ({ id: r.readerId, failures: r.failures })), reportPath: REPORT }, null, 2));
process.exitCode = proven ? 0 : 1;
