#!/usr/bin/env node

/**
 * CURRENT_WORKSPACE_LINEAGE — read-only scope reconciliation of the lineage-closure inputs.
 * Classifies each input receipt against one exact scope and emits a fresh receipt bound to
 * workspace revision, execution id, V2 source-membership checksum, and the applied repair root.
 * Never overwrites a historical receipt. Writes only its own report file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const workspaceRevision = arg('--workspace-revision');
const executionId = arg('--execution-id');
const repairRoot = arg('--repair-root-sha256');
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision ?? '')) throw new Error('EXPLICIT_WORKSPACE_REVISION_REQUIRED');
if (!/^[0-9a-f-]{36}$/.test(executionId ?? '')) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');
if (!/^[0-9a-f]{64}$/.test(repairRoot ?? '')) throw new Error('EXPLICIT_REPAIR_ROOT_SHA256_REQUIRED');

const reports = path.join(REPO_ROOT, 'docs/reports');
const sha256File = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// Applied repair evidence (the root directory name is the manifest root checksum).
const repairDir = path.join(reports, 'packet-source-revision-repair-v1', repairRoot);
const root = readJson(path.join(repairDir, 'root.json'));
const applyReceipts = fs.readdirSync(repairDir).filter((n) => /^apply-receipt-.*\.json$/.test(n)).map((n) => ({ name: n, ...readJson(path.join(repairDir, n)) }));
const completeApply = applyReceipts.filter((r) => r.status === 'SOURCE_AUTHORITY_APPLY_COMPLETE' && r.manifestRootSha256 === repairRoot && r.executionId === executionId && r.workspaceRevision === workspaceRevision && r.aborted !== true)
  .sort((a, b) => Number(b.name.match(/-(\d+)-/)?.[1] ?? 0) - Number(a.name.match(/-(\d+)-/)?.[1] ?? 0))[0] ?? null;
const appliedAtMs = completeApply ? Number(completeApply.name.match(/apply-receipt-(\d+)-/)?.[1]) : null;
if (root.executionId !== executionId || root.workspaceRevision !== workspaceRevision) throw new Error('REPAIR_ROOT_SCOPE_MISMATCH');

// Read-only V2 membership checksum for exactly this execution + workspace revision.
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const client = await pool.connect();
let membership;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result = await client.query(`
    SELECT count(*)::integer AS rows,
           encode(sha256(convert_to(string_agg(concat_ws('|', repository_id, source_ref, lower(code_source_revision::text), lower(content_hash::text)), E'\\n' ORDER BY repository_id, source_ref), 'UTF8')), 'hex') AS checksum
    FROM public.graphify_execution_file_membership_v2
    WHERE execution_id = $1::uuid AND workspace_revision::text = $2`, [executionId, workspaceRevision]);
  membership = result.rows[0];
  await client.query('ROLLBACK');
} finally {
  client.release();
  await pool.end();
}

const inputs = {
  sourceCohort: 'current-source-cohort-lineage-v1.json',
  executionOwner: 'current-graphify-execution-owner-decision-v1.json',
  packetChunkJoin: 'current-workspace-packet-chunk-join-v1.json',
  packetWriter: 'packet-writer-lineage-v1.json',
  packetRevisionOwner: 'packet-revision-owner-v1.json',
  packetIdentityReconciliation: 'current-packet-chunk-identity-reconciliation-v1.json',
  packetDigestBridge: 'current-packet-digest-bridge-v1.json',
  sourceOwner: 'current-source-owner-reconciliation-v1.json',
  sourceAuthorityRepairPlan: 'current-source-authority-repair-plan-v1.json',
  sourceEvidence: 'current-source-evidence-hydration-v1.json',
};

/** Every workspaceRevision / executionId value the receipt carries, wherever it appears. */
function collectScope(value, acc = { workspaceRevisions: new Set(), executionIds: new Set() }) {
  if (Array.isArray(value)) { for (const item of value) collectScope(item, acc); return acc; }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string') {
        if (/workspace_?revision|workspaceRevision/i.test(key) && /^sha256:[0-9a-f]{64}$/.test(item)) acc.workspaceRevisions.add(item);
        if (/execution_?id|executionId/i.test(key) && /^[0-9a-f-]{36}$/.test(item)) acc.executionIds.add(item);
      } else collectScope(item, acc);
    }
  }
  return acc;
}

/** Classification is derived, never hand-assigned. Order matters: the first matching rule wins. */
function classify(name, receipt, mtimeMs) {
  const scope = collectScope(receipt);
  const revisions = [...scope.workspaceRevisions];
  const executions = [...scope.executionIds];
  const declaresScope = revisions.length > 0 || executions.length > 0;
  const bindsExact = revisions.includes(workspaceRevision) && (executions.length === 0 || executions.includes(executionId));
  const foreignRevisions = revisions.filter((r) => r !== workspaceRevision);
  const foreignExecutions = executions.filter((e) => e !== executionId);
  const preApply = appliedAtMs != null && mtimeMs < appliedAtMs;
  const packetStateDerived = ['packetDigestBridge', 'sourceAuthorityRepairPlan'].includes(name); // counts describe pre-repair packet rows
  let classification; let reason;
  if (!declaresScope) {
    classification = 'UNRELATED'; reason = 'Carries no workspace-revision or execution binding; it cannot be compared to this scope and must not supply scope-bound counts.';
  } else if (!bindsExact) {
    classification = 'HISTORICAL_VALID_OTHER_SCOPE'; reason = 'Bound only to other workspace revisions/executions.';
  } else if (packetStateDerived && preApply) {
    classification = 'STALE'; reason = 'Same scope, but generated before the durable packet repair was applied; its packet-state counts describe the pre-repair rows.';
  } else if (foreignRevisions.length > 0 && name === 'sourceCohort') {
    classification = 'HISTORICAL_VALID_OTHER_SCOPE'; reason = 'Selects the current frame but its cohort rows are bound to other workspace revisions (currentWorkspaceMatched=0).';
  } else {
    classification = 'CURRENT_MATCHING_SCOPE'; reason = foreignRevisions.length || foreignExecutions.length
      ? 'Binds the exact scope; additional foreign scope identifiers appear only as listed candidates.'
      : 'Binds the exact workspace revision and execution.';
  }
  return { classification, reason, declaredWorkspaceRevisions: revisions, declaredExecutionIds: executions, generatedBeforeApply: preApply };
}

const inputRecords = Object.entries(inputs).map(([name, file]) => {
  const full = path.join(reports, file);
  const receipt = readJson(full);
  const stat = fs.statSync(full);
  return { name, path: `docs/reports/${file}`, sha256: sha256File(full), modifiedAt: stat.mtime.toISOString(), ...classify(name, receipt, stat.mtimeMs) };
});
// Derived-from-stale: an input is only tainted if it records a stale/other-scope input as its own source.
const closure = readJson(path.join(reports, 'current-lineage-closure-v1.json'));
const counts = (name) => inputRecords.find((r) => r.name === name);
const qualified = closure.funnel?.packetQualifiedRows ?? 0;
const funnelDiagnostics = [
  { field: 'workspaceSourceRows', value: closure.funnel?.workspaceSourceRows ?? null, inputs: ['sourceCohort'], usable: counts('sourceCohort').classification === 'CURRENT_MATCHING_SCOPE' },
  { field: 'astQualifiedRows', value: closure.funnel?.astQualifiedRows ?? null, inputs: ['sourceEvidence'], usable: counts('sourceEvidence').classification === 'CURRENT_MATCHING_SCOPE' },
  { field: 'packetQualifiedRows', value: qualified, inputs: ['packetChunkJoin'], usable: counts('packetChunkJoin').classification === 'CURRENT_MATCHING_SCOPE' },
  { field: 'packetChunkQualifiedRows', value: closure.funnel?.packetChunkQualifiedRows ?? null, inputs: ['packetChunkJoin'], usable: counts('packetChunkJoin').classification === 'CURRENT_MATCHING_SCOPE' },
].map((item) => ({ ...item, classification: item.usable ? 'CURRENT_MATCHING_SCOPE' : 'DERIVED_FROM_STALE_INPUT', note: item.usable ? null : `Sourced from an input that is not bound to the current scope (${item.inputs.join(', ')}); not comparable to scope-bound counts.` }));

const report = {
  schema: 'atlas.current-workspace-lineage-scope-closure.v1',
  mode: 'READ_ONLY',
  writesPerformed: false,
  historicalReceiptsOverwritten: false,
  scope: {
    repositoryId: 'repo:root',
    workspaceRevision,
    executionId,
    v2SourceMembership: { rows: membership.rows, checksum: `sha256:${membership.checksum}`, recipe: 'sha256 of repository_id|source_ref|code_source_revision|content_hash lines ordered by repository_id, source_ref' },
    appliedPacketRepair: {
      manifestRootSha256: repairRoot, entryCount: root.entryCount, accounting: root.accounting ?? null,
      applyReceipt: completeApply ? { name: completeApply.name, status: completeApply.status, committedPackets: completeApply.committedPackets, appliedAt: new Date(appliedAtMs).toISOString(), inverseRootSha256: completeApply.inverseRootSha256 } : null,
    },
  },
  inputs: inputRecords,
  funnelDiagnostics,
  measured: { packetQualifiedRows: qualified, packetChunkQualifiedRows: closure.funnel?.packetChunkQualifiedRows ?? 0 },
  gate: {
    name: 'CURRENT_WORKSPACE_LINEAGE',
    status: completeApply && qualified > 0 && inputRecords.find((r) => r.name === 'packetChunkJoin').classification === 'CURRENT_MATCHING_SCOPE'
      ? 'REVISION_QUALIFIED_PACKET_LINEAGE_MEASURED' : 'BLOCKED',
    criterion: 'measured revision-qualified packet lineage bound to the exact scope; no prescribed count',
    openScopeDiagnostics: funnelDiagnostics.filter((item) => !item.usable).map((item) => item.field),
  },
  generatedAt: new Date().toISOString(),
};
const out = path.join(reports, 'current-workspace-lineage-scope-closure-v1.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ gate: report.gate, measured: report.measured, membership: report.scope.v2SourceMembership, classifications: Object.fromEntries(inputRecords.map((r) => [r.name, r.classification])), funnelDiagnostics: funnelDiagnostics.map((d) => `${d.field}=${d.value}:${d.classification}`) }, null, 2));
