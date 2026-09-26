#!/usr/bin/env node
/**
 * S01-04 — GraphifyAuthorityReaderCutoverPreflightV1. READ-ONLY. Flips NOTHING.
 *
 * Every reader consumes the legacy owner through ONE predicate: "is execution E canonical" (graphify_executions.canonical_authority).
 * Cutover would replace that predicate with "does graphify_execution_authority select E for E's (workspace, revision)".
 * This preflight proves the two predicates are identical:
 *   1. over the ENTIRE domain (every graphify_executions row), and
 *   2. at every place a reader actually reported a per-execution legacy flag in its own last report, plus the
 *      run-bridge lock target/eligibility and the repair planner's owner selection.
 * Limits (recorded in the receipt): decision equality follows from predicate equality over the whole domain plus each reader's
 * own reported flags; the readers are NOT re-executed with modified code (that is the S01-05 cutover diff). The admission panel
 * has no runnable report, so it is covered by the domain predicate only.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'docs/reports/graphify-authority-reader-cutover-preflight-v1.json');
const EXPECTED = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const digest = (v: string | Buffer) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const readJson = (rel: string) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
const readText = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const census = readJson('docs/reports/graphify-authority-reader-shadow-census-v1.json');
const observation = readJson('docs/reports/graphify-authority-observation-v1.json');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const client = await pool.connect();
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const executions = (await client.query(`SELECT execution_id::text AS execution_id, workspace_id::text AS workspace_id, workspace_revision, canonical_authority, status FROM public.graphify_executions ORDER BY execution_id`)).rows;
const authority = (await client.query(`SELECT execution_id::text AS execution_id, workspace_id::text AS workspace_id, workspace_revision, authority_state FROM public.graphify_execution_authority ORDER BY execution_id`)).rows;
await client.query('ROLLBACK');
client.release();
await pool.end();

// The would-be predicate: the authority table selects this exact (workspace, revision, execution).
const authoritySelected = (e: { execution_id: string; workspace_id: string; workspace_revision: string }) => authority.some((a) => a.execution_id === e.execution_id && a.workspace_id === e.workspace_id && a.workspace_revision === e.workspace_revision);
const legacySelected = (e: { canonical_authority: boolean | null }) => e.canonical_authority === true;
const authorityById = new Set(authority.map((a) => a.execution_id));
const legacyById = new Set(executions.filter(legacySelected).map((e) => e.execution_id));

const domainMismatches = executions.filter((e) => legacySelected(e) !== authoritySelected(e)).map((e) => ({ executionId: e.execution_id, legacy: legacySelected(e), authority: authoritySelected(e) }));
const perScope = new Map<string, { legacy: string[]; authority: string[] }>();
for (const e of executions) { const k = `${e.workspace_id}|${e.workspace_revision}`; if (!perScope.has(k)) perScope.set(k, { legacy: [], authority: [] }); }
for (const e of executions) if (legacySelected(e)) perScope.get(`${e.workspace_id}|${e.workspace_revision}`)!.legacy.push(e.execution_id);
for (const a of authority) perScope.get(`${a.workspace_id}|${a.workspace_revision}`)?.authority.push(a.execution_id);
const scopeMismatches = [...perScope.entries()].filter(([, v]) => JSON.stringify([...v.legacy].sort()) !== JSON.stringify([...v.authority].sort())).map(([k, v]) => ({ scope: k, ...v }));

// Collect every per-execution legacy flag a reader reported (skip the root object: it holds contract flags like canonicalAuthority:false).
const FLAG_KEYS = ['canonical_authority', 'canonicalAuthority', 'executionCanonicalAuthority'];
function collectFlags(node: any, depth = 0, out: Array<{ executionId: string; legacy: boolean; key: string; reportedAuthoritySelected?: boolean }> = []) {
  if (Array.isArray(node)) { for (const n of node) collectFlags(n, depth + 1, out); return out; }
  if (node && typeof node === 'object') {
    const id = node.execution_id ?? node.executionId;
    const key = FLAG_KEYS.find((k) => typeof node[k] === 'boolean');
    if (depth > 0 && typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id) && key) out.push({ executionId: id, legacy: node[key], key, reportedAuthoritySelected: typeof node.authorityTableSelected === 'boolean' ? node.authorityTableSelected : undefined });
    for (const [k, v] of Object.entries(node)) if (k !== 'authorityShadow') collectFlags(v, depth + 1, out);
  }
  return out;
}

type ReaderSpec = { readerId: string; readerPath: string; reportRel: string | null; note?: string };
const READERS: ReaderSpec[] = [
  { readerId: 'binding-audit', readerPath: 'scripts/atlas/audit-graphify-workspace-snapshot-binding-v1.mts', reportRel: 'docs/reports/graphify-workspace-snapshot-binding-v1.json' },
  { readerId: 'repair-planner', readerPath: 'scripts/atlas/plan-current-source-authority-repair-v1.mts', reportRel: 'docs/reports/current-source-authority-repair-plan-v1.json' },
  { readerId: 'run-owner', readerPath: 'scripts/atlas/audit-current-graphify-run-owner-v1.mjs', reportRel: 'docs/reports/current-graphify-run-owner-v1.json' },
  { readerId: 'snapshot-authority', readerPath: 'scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts', reportRel: 'docs/reports/current-graphify-snapshot-authority-v1.json' },
  { readerId: 'source-bridge-reconciliation', readerPath: 'scripts/atlas/audit-current-graphify-source-bridge-reconciliation-v1.mjs', reportRel: 'docs/reports/current-graphify-source-bridge-reconciliation-v1.json' },
  { readerId: 'admission-panel', readerPath: 'sveltekit-frontend/src/lib/server/atlas/admission/workspace-admission-panel-v1.ts', reportRel: null, note: 'loader not runnable outside SvelteKit; covered by the domain-wide predicate only' },
  { readerId: 'source-owner-reconciliation', readerPath: 'scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs', reportRel: 'docs/reports/current-source-owner-reconciliation-v1.json' },
  { readerId: 'run-bridge-preflight', readerPath: 'scripts/atlas/apply-graphify-execution-run-bridge-v1.mjs', reportRel: 'docs/reports/graphify-execution-run-bridge-preflight-v1.json' },
];
const censusAt = new Date(census.generatedAt).getTime();

const results = READERS.map((spec) => {
  const failures: string[] = [];
  let evaluatedFlags = 0;
  let flagMismatches: any[] = [];
  let reportGeneratedAt: string | null = null;
  let evidenceClass = 'DOMAIN_PREDICATE_ONLY';
  const extra: Record<string, any> = {};
  if (spec.reportRel) {
    if (!existsSync(resolve(ROOT, spec.reportRel))) failures.push('READER_REPORT_MISSING');
    else {
      const report = readJson(spec.reportRel);
      // Some readers do not stamp generatedAt; fall back to the file's modification time and record which was used.
      reportGeneratedAt = report.generatedAt ?? `mtime:${statSync(resolve(ROOT, spec.reportRel)).mtime.toISOString()}`;
      const at = new Date(String(reportGeneratedAt).replace(/^mtime:/, '')).getTime();
      // The reports must be the ones the census run produced (not stale, not from a later unrelated run).
      if (!(at <= censusAt && censusAt - at < 30 * 60 * 1000)) failures.push('READER_REPORT_NOT_FROM_CENSUS_RUN');
      const flags = collectFlags(report);
      evidenceClass = 'READER_REPORT_FLAGS';
      evaluatedFlags = flags.length;
      for (const f of flags) {
        const exec = executions.find((e) => e.execution_id === f.executionId);
        const wouldBe = exec ? authoritySelected(exec) : false;
        if (!exec || f.legacy !== wouldBe || (f.reportedAuthoritySelected !== undefined && f.reportedAuthoritySelected !== wouldBe)) flagMismatches.push({ executionId: f.executionId, legacyFlagInReport: f.legacy, authorityWouldBe: wouldBe, reportedAuthoritySelected: f.reportedAuthoritySelected ?? null, key: f.key });
      }
      if (spec.readerId === 'repair-planner') {
        // Owner selection: legacy `WHERE canonical_authority AND COMPLETED` vs the authority row in the same scope.
        const legacyOwner = executions.filter((e) => e.canonical_authority === true && e.status === 'COMPLETED').map((e) => e.execution_id);
        const authorityOwner = authority.filter((a) => executions.find((e) => e.execution_id === a.execution_id)?.status === 'COMPLETED').map((a) => a.execution_id);
        extra.legacyOwnerSelection = legacyOwner; extra.authorityWouldSelect = authorityOwner; extra.reportedOwnerRunId = report.ownerRunId ?? null;
        extra.selectionEqual = JSON.stringify(legacyOwner) === JSON.stringify(authorityOwner) && report.ownerRunId === legacyOwner[0];
        if (!extra.selectionEqual) failures.push('REPAIR_PLANNER_OWNER_SELECTION_DIFFERS');
      }
      if (spec.readerId === 'run-bridge-preflight') {
        const src = readText(spec.readerPath);
        const lockSql = src.slice(src.indexOf('FROM public.graphify_executions WHERE execution_id = $1::uuid FOR UPDATE') - 40, src.indexOf('FOR UPDATE') + 12);
        const lockById = /WHERE execution_id = \$1::uuid FOR UPDATE/.test(src) && !/canonical_authority[^;]{0,80}FOR UPDATE/.test(src);
        const target = report.executionId as string;
        const targetRow = executions.find((e) => e.execution_id === target);
        extra.legacyLockTarget = target; extra.authorityLockTarget = target; extra.lockSelectsByExplicitExecutionId = lockById;
        extra.legacyApplyEligibilityInput = report.checks?.executionCanonical ?? null;
        extra.authorityApplyEligibilityInput = targetRow ? authoritySelected(targetRow) : null;
        extra.lockedEvidenceValidInputEqual = targetRow ? legacySelected(targetRow) === authoritySelected(targetRow) : false;
        extra.lockTargetEqual = lockById && !!target;
        extra.eligibilityEqual = extra.legacyApplyEligibilityInput === extra.authorityApplyEligibilityInput && extra.lockedEvidenceValidInputEqual;
        if (!extra.lockTargetEqual) failures.push('RUN_BRIDGE_LOCK_TARGET_NOT_EXPLICIT_ID');
        if (!extra.eligibilityEqual) failures.push('RUN_BRIDGE_ELIGIBILITY_DIFFERS');
        void lockSql;
      }
    }
  }
  if (evaluatedFlags > 0 && flagMismatches.length > 0) failures.push(`FLAG_MISMATCHES:${flagMismatches.length}`);
  if (spec.reportRel && evaluatedFlags === 0 && spec.readerId !== 'repair-planner' && spec.readerId !== 'run-bridge-preflight' && !failures.length) evidenceClass = 'READER_REPORT_NO_PER_EXECUTION_FLAGS';
  return {
    readerId: spec.readerId, readerPath: spec.readerPath, evidenceClass, note: spec.note ?? null, reportGeneratedAt, evaluatedPerExecutionFlags: evaluatedFlags,
    selectionEqual: flagMismatches.length === 0 && (extra.selectionEqual ?? true), decisionEqual: failures.length === 0, eligibilityEqual: extra.eligibilityEqual ?? flagMismatches.length === 0,
    lockTargetEqual: extra.lockTargetEqual ?? null, blockingStateEqual: failures.length === 0, flagMismatches, ...extra, failures, pass: failures.length === 0,
  };
});

const criteria = {
  prerequisiteObservationProven: observation.status === 'READ_PARITY_OBSERVATION_PROVEN',
  prerequisiteCensusProven: census.status === 'GRAPHIFY_AUTHORITY_READER_SHADOW_02_PROVEN',
  readerCount8: results.length === 8,
  domainPredicateEqualAcrossAllExecutions: domainMismatches.length === 0 && executions.length > 0,
  perScopeSelectionEqual: scopeMismatches.length === 0,
  legacyEqualsAuthorityExecutionSet: JSON.stringify([...legacyById].sort()) === JSON.stringify([...authorityById].sort()) && legacyById.has(EXPECTED),
  allReadersPass: results.every((r) => r.pass),
  runBridgeLockTargetEqual: results.find((r) => r.readerId === 'run-bridge-preflight')?.lockTargetEqual === true,
  runBridgeEligibilityEqual: results.find((r) => r.readerId === 'run-bridge-preflight')?.eligibilityEqual === true,
  databaseWrites0: true, // single REPEATABLE READ READ ONLY transaction, SELECTs only
  readerCutover: false,
};
const ready = Object.entries(criteria).every(([k, v]) => (k === 'readerCutover' ? v === false : v === true));
const body = {
  schema: 'atlas.graphify-authority-reader-cutover-preflight.v1',
  gate: 'GRAPHIFY-AUTHORITY-READER-CUTOVER-PREFLIGHT',
  generatedAt: new Date().toISOString(),
  status: ready ? 'GRAPHIFY_AUTHORITY_READER_CUTOVER_PREFLIGHT_READY' : 'GRAPHIFY_AUTHORITY_READER_CUTOVER_PREFLIGHT_BLOCKED',
  cutoverAuthorized: false, readerCutover: false, runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY', databaseWrites: 0,
  domain: { executions: executions.length, legacyCanonical: legacyById.size, authorityRows: authority.length, scopes: perScope.size, domainMismatches, scopeMismatches },
  criteria,
  readerCount: results.length,
  readers: results,
  limits: [
    'Decision equality is established by predicate equality over the whole execution domain plus each reader\'s own reported per-execution flags; the readers are not re-executed with modified code (that is the S01-05 cutover before/after diff).',
    'admission-panel loader is not runnable outside SvelteKit, so it is covered by the domain predicate only.',
    'Reader reports are those regenerated by the S01-02 census run (checked to be within 30 minutes before the census receipt).',
    'Preflight READY is not authorization: reader cutover needs its own explicit operator instruction.',
  ],
};
writeFileSync(OUT, `${JSON.stringify({ ...body, receiptChecksum: digest(JSON.stringify(body)) }, null, 2)}\n`);
console.log(JSON.stringify({ status: body.status, criteria, domain: { executions: executions.length, legacyCanonical: legacyById.size, authorityRows: authority.length, domainMismatches: domainMismatches.length, scopeMismatches: scopeMismatches.length }, failing: results.filter((r) => !r.pass).map((r) => ({ id: r.readerId, failures: r.failures })), perReader: results.map((r) => ({ id: r.readerId, cls: r.evidenceClass, flags: r.evaluatedPerExecutionFlags })) }, null, 2));
process.exitCode = ready ? 0 : 1;
