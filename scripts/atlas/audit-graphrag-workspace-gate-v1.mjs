/** Read-only exact-revision census for the GraphRAG proposal route. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { values } = parseArgs({ options: { output: { type: 'string' } } });
if (!values.output) throw new Error('OUTPUT_PATH_REQUIRED');
const output = path.resolve(REPO_ROOT, values.output);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const admissionRef = 'docs/reports/workspace-revision-tournament-admission-v1.json';
const admissionBytes = await readFile(path.join(REPO_ROOT, admissionRef));
const admission = JSON.parse(admissionBytes);
const revision = admission.workspaceRevision;
if (!/^sha256:[a-f0-9]{64}$/.test(revision ?? '')) throw new Error('WORKSPACE_REVISION_REQUIRED');
const pin = process.env.ATLAS_ADMITTED_WORKSPACE_REVISION?.trim();
const report = {
  schema: 'atlas.graphrag-workspace-gate-readback.v1',
  command: ['node', ...process.argv.slice(1)],
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: REPO_ROOT }).trim(),
  observedAt: new Date().toISOString(),
  admission: {
    path: admissionRef,
    sha256: sha256(admissionBytes),
    workspaceRevision: revision,
    snapshotRevision: admission.snapshotRevision ?? null,
    scope: admission.approval?.scope ?? null,
    graphifyExecutionAuthorized: admission.graphifyExecutionAuthorized === true,
  },
  shellOperatorPin: !pin ? 'ABSENT' : pin === revision ? 'MATCHES_RECEIPT' : 'DIFFERS_FROM_RECEIPT',
  canonicalAuthority: false,
  writesPerformed: false,
  liveAuthorizationProven: false,
};
try {
  const scratch = path.join(REPO_ROOT, '.tmp/atlas/workspace-snapshot-scratch-v1');
  const latest = (await readdir(scratch)).filter((name) => name.startsWith('scratch-snapshot-')).sort().at(-1);
  if (!latest) throw new Error('NO_SCRATCH_CAPTURE');
  const capture = JSON.parse(await readFile(path.join(scratch, latest, 'summary.json')));
  report.latestScratchReadback = {
    snapshotRevision: capture.snapshotRevision ?? null,
    matchesAdmission: !!capture.snapshotRevision && capture.snapshotRevision === admission.snapshotRevision,
    status: capture.readback?.status ?? null,
    exactMatches: capture.readback?.exactMatches ?? null,
    sourceCount: capture.readback?.sourceCount ?? null,
    violationCount: Array.isArray(capture.readback?.violations) ? capture.readback.violations.length : null,
  };
} catch (error) {
  report.latestScratchReadback = { status: 'UNAVAILABLE', error: error.code ?? error.message };
}

const require = createRequire(path.join(REPO_ROOT, 'sveltekit-frontend/package.json'));
const { Client } = require('pg');
const client = new Client({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  connectionTimeoutMillis: 5000,
  statement_timeout: 7000,
});
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const { rows: [counts] } = await client.query(`
    SELECT current_setting('transaction_read_only')::boolean AS read_only,
      (SELECT count(*)::int FROM public.atlas_workspace_source_bindings WHERE workspace_revision = $1) AS source_bindings,
      (SELECT count(*)::int FROM public.graphify_executions WHERE workspace_revision = $1) AS graphify_executions,
      (SELECT count(*)::int FROM public.atlas_actor_workspace_source_grants_v1 WHERE workspace_revision = $1) AS grant_rows,
      (SELECT count(*)::int FROM public.atlas_actor_workspace_source_grants_v1
        WHERE workspace_revision = $1 AND status = 'GRANTED' AND revoked_at IS NULL
          AND issued_at <= CURRENT_TIMESTAMP AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ) AS active_grant_rows`, [revision]);
  if (counts.read_only !== true) throw new Error('READ_ONLY_TRANSACTION_NOT_CONFIRMED');
  report.pg18 = counts;
  await client.query('ROLLBACK');
  report.blockers = [];
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
    report.blockers.push('WORKSPACE_ADMISSION_RECEIPT_INVALID');
  }
  if (report.shellOperatorPin !== 'MATCHES_RECEIPT') report.blockers.push('SHELL_OPERATOR_PIN_NOT_BOUND');
  if (!report.latestScratchReadback.matchesAdmission) report.blockers.push('SNAPSHOT_READBACK_NOT_BOUND_TO_ADMISSION');
  if (report.latestScratchReadback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN'
    || !(report.latestScratchReadback.sourceCount > 0)
    || report.latestScratchReadback.exactMatches !== report.latestScratchReadback.sourceCount
    || report.latestScratchReadback.violationCount !== 0) {
    report.blockers.push('SNAPSHOT_BYTE_READBACK_INCOMPLETE');
  }
  if (counts.source_bindings === 0) report.blockers.push('NO_EXACT_REVISION_SOURCE_BINDINGS');
  if (counts.active_grant_rows === 0) report.blockers.push('NO_ACTIVE_GRANTS_FOR_REVISION');
  report.status = report.blockers.length ? 'BLOCKED' : 'EXACT_SOURCE_ACTOR_CHECK_REQUIRED';
} catch (error) {
  report.status = 'READBACK_FAILED';
  report.error = { type: error.name, code: error.code ?? null };
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
const serialized = JSON.stringify(report, null, 2) + '\n';
await writeFile(output, serialized, { flag: 'wx' });
const digest = sha256(serialized);
await writeFile(output + '.sha256', `${digest}  ${path.basename(output)}\n`, { flag: 'wx' });
console.log(`${report.status} ${output} sha256:${digest}`);
