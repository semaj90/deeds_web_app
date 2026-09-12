/**
 * OBSERVATION-FEATURE-PLAN-AUTHORITY-01 -- READ ONLY.
 *
 * Checks whether the existing observation feature plan belongs to the selected
 * snapshot-native Graphify execution. It never materializes rows or changes a
 * canonical/projection store.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argValue = (name) => {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
};
const resolveArgPath = (name, fallback) => {
  const value = argValue(name);
  return value ? path.resolve(value) : fallback;
};
const receiptPath = resolveArgPath('receipt', path.join(root, 'docs/reports/graphify-snapshot-native-readback-v1.json'));
const planPath = resolveArgPath('plan', path.join(root, '.tmp/atlas/graphify-file-index-v1/observation-feature-projection-plan.jsonl'));
const reportPath = resolveArgPath('report', path.join(root, 'docs/reports/observation-feature-plan-authority-v1.json'));

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
if (!fs.existsSync(receiptPath)) throw new Error('SNAPSHOT_NATIVE_READBACK_RECEIPT_MISSING');
if (!fs.existsSync(planPath)) throw new Error('OBSERVATION_FEATURE_PLAN_MISSING');

const receipt = readJson(receiptPath);
if (receipt.status !== 'SNAPSHOT_NATIVE_READBACK_PROVEN') {
  throw new Error(`SNAPSHOT_NATIVE_READBACK_NOT_PROVEN:${receipt.status}`);
}
if (!receipt.executionId || !receipt.workspaceRevision) throw new Error('SNAPSHOT_RECEIPT_IDENTITY_INCOMPLETE');

const lines = fs.readFileSync(planPath, 'utf8').split(/\r?\n/).filter(Boolean);
const planRows = lines.map((line, index) => {
  try { return { line: index + 1, row: JSON.parse(line) }; }
  catch (error) { return { line: index + 1, row: null, parseError: error.message }; }
});

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-observation-feature-plan-authority-v1',
});
let membershipRows = [];
let error = null;
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    membershipRows = (await client.query(`
      SELECT source_ref::text AS source_ref,
             array_agg(DISTINCT code_source_revision::text ORDER BY code_source_revision::text)
               AS source_revisions
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND workspace_revision = $2::text
      GROUP BY source_ref
    `, [receipt.executionId, receipt.workspaceRevision])).rows;
    await client.query('ROLLBACK');
  } finally { client.release(); }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally { await pool.end(); }

const membershipBySource = new Map(membershipRows.map((row) => [row.source_ref, row.source_revisions ?? []]));
const invalid = [];
const exact = [];
for (const item of planRows) {
  if (!item.row) { invalid.push({ line: item.line, reason: 'INVALID_JSON' }); continue; }
  const row = item.row;
  const sourceRevision = typeof row.sourceRevision === 'string' ? row.sourceRevision.trim() : '';
  if (!row.packetKey) invalid.push({ line: item.line, reason: 'PACKET_KEY_MISSING' });
  if (!row.sourceRef) invalid.push({ line: item.line, reason: 'SOURCE_REF_MISSING' });
  if (!row.featureRevision) invalid.push({ line: item.line, reason: 'FEATURE_REVISION_MISSING' });
  if (!sourceRevision) invalid.push({ line: item.line, reason: 'SOURCE_REVISION_MISSING' });
  if (sourceRevision === 'workspace:0' || sourceRevision.endsWith('_PENDING')) {
    invalid.push({ line: item.line, reason: 'SOURCE_REVISION_PLACEHOLDER', sourceRevision });
  }
  const revisions = membershipBySource.get(row.sourceRef) ?? [];
  if (revisions.includes(sourceRevision)) exact.push(item.line);
  else invalid.push({
    line: item.line,
    reason: revisions.length ? 'SOURCE_REVISION_MISMATCH' : 'SOURCE_NOT_IN_SELECTED_EXECUTION',
    sourceRef: row.sourceRef ?? null,
    sourceRevision: sourceRevision || null,
    admittedRevisions: revisions,
  });
}

const reasonCounts = Object.fromEntries([...invalid.reduce((map, item) => {
  map.set(item.reason, (map.get(item.reason) ?? 0) + 1); return map;
}, new Map())].sort(([a], [b]) => a.localeCompare(b)));
const status = error ? 'PLAN_AUTHORITY_READBACK_ERROR'
  : invalid.length ? 'PLAN_AUTHORITY_BLOCKED' : 'PLAN_AUTHORITY_PROVEN';
const report = {
  schema: 'atlas.observation-feature-plan-authority.v1',
  generatedAt: new Date().toISOString(),
  gate: 'OBSERVATION-FEATURE-PLAN-AUTHORITY-01',
  status,
  selectedExecutionId: receipt.executionId,
  selectedWorkspaceRevision: receipt.workspaceRevision,
  planPath,
  planRowCount: planRows.length,
  selectedExecutionSourceCount: membershipRows.length,
  exactSourceRevisionRows: exact.length,
  invalidRowCount: invalid.length,
  reasonCounts,
  sampleInvalid: invalid.slice(0, 20),
  error,
  readOnly: true,
  writesPerformed: false,
  canonicalAuthorityChanged: false,
  nextGate: status === 'PLAN_AUTHORITY_PROVEN' ? 'REVIEW_FEATURE_PLAN_FOR_APPLY' : 'REGENERATE_PLAN_FROM_SELECTED_EXECUTION',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status, planRowCount: planRows.length, selectedExecutionSourceCount: membershipRows.length, exactSourceRevisionRows: exact.length, invalidRowCount: invalid.length, reasonCounts, reportPath, writesPerformed: false }, null, 2));
if (status !== 'PLAN_AUTHORITY_PROVEN') process.exitCode = 1;
