#!/usr/bin/env tsx
/**
 * Pre-admission owner for atlas_workspace_source_bindings (admitted workspace revision).
 *
 * Read-only by default: builds the candidate binding rows for the admitted revision and writes a
 * plan to .tmp/atlas. Rows are keyed by the admitted derivation revision; the checksum comes from
 * buildWorkspaceSourceBindingsV1 (the single checksum owner). The database is read only to learn
 * which sources already have an atlas_source_refs row (the foreign-key precondition).
 *
 * Write gate: --apply requires --confirm CANONICAL_SOURCE_BINDING_WRITE. The write path is not
 * enabled in this step and refuses even with both flags.
 *
 * Args accept both "--flag value" and "--flag=value".
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '$lib/server/atlas/identity/workspace-source-binding-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const PRODUCER_REVISION = 'atlas.bind-admitted-workspace-sources.v1';
const REPOSITORY_ID = 'deeds-web-app';
const CONFIRM_PHRASE = 'CANONICAL_SOURCE_BINDING_WRITE';
const ROOT_KEY_PREFIX = 'repo:root:';

function argument(name: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`MISSING_VALUE_FOR_${name}`);
  return value;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

const apply = process.argv.includes('--apply');
const confirm = argument('--confirm');
if (apply && confirm !== CONFIRM_PHRASE) throw new Error('APPLY_REQUIRES_CONFIRM_CANONICAL_SOURCE_BINDING_WRITE');
if (apply) throw new Error('APPLY_NOT_ENABLED_IN_THIS_STEP');

const reportRelative = argument('--report') ?? '.tmp/atlas/workspace-source-binding-dryrun-c636.json';
const reportPath = path.resolve(REPO_ROOT, reportRelative);
if (!reportPath.startsWith(`${path.resolve(REPO_ROOT, '.tmp', 'atlas')}${path.sep}`)) {
  throw new Error('REPORT_MUST_BE_UNDER_REPO_TMP_ATLAS');
}

// 1. Admitted revision and selection (must agree with the hygiene selection).
const admission = JSON.parse(readFileSync(path.resolve(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('ADMISSION_NOT_ADMITTED');
}
const admittedRevision: string = admission.workspaceRevision;

const hygiene = JSON.parse(readFileSync(path.resolve(REPO_ROOT, '.tmp/atlas/graphify-daily-selection-hygiene-v1.json'), 'utf8'));
if (hygiene.status !== 'SOURCE_INVENTORY_HYGIENE_PASS' || (hygiene.blockers ?? []).length !== 0) throw new Error('HYGIENE_NOT_PASS');
if (hygiene.sourceSelectionChecksum !== admission.sourceSelectionChecksum || hygiene.canonicalSourceCount !== admission.sourceCount) {
  throw new Error('SELECTION_MISMATCH_WITH_ADMISSION');
}

// 2a. Table precondition: the binding table must exist with exactly the columns this owner writes.
const EXPECTED_COLUMNS = [
  'repo_id', 'workspace_revision', 'canonical_source_ref', 'source_revision', 'content_digest', 'byte_length',
  'source_manifest_ordinal', 'git_blob_oid', 'tracked_at_base_commit', 'dirty_relative_to_base',
  'producer_revision', 'binding_checksum', 'observed_at',
];
const columnRows = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-tAc',
  "select column_name from information_schema.columns where table_schema='public' and table_name='atlas_workspace_source_bindings' order by ordinal_position",
], { encoding: 'utf8' });
const liveColumns = columnRows.split('\n').map((line) => line.trim()).filter(Boolean);
const tableOk = liveColumns.length > 0 && EXPECTED_COLUMNS.every((column) => liveColumns.includes(column));

// 2. Foreign-key precondition: which bare root paths already have an atlas_source_refs row.
const refRows = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-tAc',
  `select source_ref_key from atlas_source_refs where repo_id='${REPOSITORY_ID}'`,
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const existingRefs = new Set(refRows.split('\n').map((line) => line.trim()).filter(Boolean));

// 3. Git baseline and dirty state for the root repository (read-only).
const baseCommitOid = git(['rev-parse', 'HEAD']).trim();
const baseTreeOid = git(['rev-parse', 'HEAD^{tree}']).trim();
const gitHeadRef = git(['symbolic-ref', '--short', '-q', 'HEAD']).trim() || null;
const trackedBlob = new Map<string, string>();
for (const entry of git(['ls-tree', '-r', 'HEAD', '-z']).split('\0').filter(Boolean)) {
  const [meta, filePath] = entry.split('\t');
  const [, type, oid] = meta.split(' ');
  if (type === 'blob') trackedBlob.set(filePath, oid);
}
const dirtyPaths = new Set<string>();
const statusTokens = git(['status', '--porcelain=v1', '-z']).split('\0').filter(Boolean);
for (let i = 0; i < statusTokens.length; i++) {
  const token = statusTokens[i];
  const code = token.slice(0, 2);
  dirtyPaths.add(token.slice(3));
  if (code.includes('R') || code.includes('C')) i++;
}

// 4. Root sources in the admitted selection that already have a source-ref row.
const rootCanonical = hygiene.canonicalSources.filter((source: { sourceIdentityKey: string }) =>
  source.sourceIdentityKey.startsWith(ROOT_KEY_PREFIX));
const matched = rootCanonical.filter((source: { sourceIdentityKey: string }) =>
  existingRefs.has(source.sourceIdentityKey.slice(ROOT_KEY_PREFIX.length)));
const deferredMissing = rootCanonical.length - matched.length;

const entries = matched.map((source: { sourceIdentityKey: string; sourceRevision: string; contentDigest: string; byteLength: number }) => {
  const sourceRef = source.sourceIdentityKey.slice(ROOT_KEY_PREFIX.length);
  const tracked = trackedBlob.has(sourceRef);
  return {
    sourceRef,
    sourceRevision: source.sourceRevision,
    contentDigest: source.contentDigest,
    byteLength: source.byteLength,
    gitBlobOid: tracked ? trackedBlob.get(sourceRef)! : null,
  };
});

// 5. Build the record over this cohort, then key it by the admitted derivation revision. The record's
//    own revision (its manifest digest) is kept in the receipt so the difference is explicit.
const built = buildWorkspaceRevisionRecordV1({
  repositoryId: REPOSITORY_ID,
  gitObjectFormat: 'sha1',
  baseCommitOid,
  baseTreeOid,
  gitHeadRef,
  dirty: dirtyPaths.size > 0,
  entries,
  generatedAt: new Date().toISOString(),
  producerRevision: PRODUCER_REVISION,
});
const trackedAtBaseCommit = new Map<string, boolean>();
const dirtyRelativeToBaseCommit = new Map<string, boolean>();
for (const entry of built.entries) {
  const tracked = trackedBlob.has(entry.sourceRef);
  trackedAtBaseCommit.set(entry.sourceRef, tracked);
  dirtyRelativeToBaseCommit.set(entry.sourceRef, !tracked || dirtyPaths.has(entry.sourceRef));
}
const bindings = buildWorkspaceSourceBindingsV1({
  record: { ...built.record, workspaceRevision: admittedRevision, workspaceRevisionBasis: 'ADMITTED_DERIVATION' as const },
  entries: built.entries,
  trackedAtBaseCommit,
  dirtyRelativeToBaseCommit,
  producerRevision: PRODUCER_REVISION,
});

const rows = bindings.map((binding) => ({
  repo_id: REPOSITORY_ID,
  workspace_revision: binding.workspaceRevision,
  canonical_source_ref: binding.sourceRef,
  source_revision: binding.sourceRevision,
  content_digest: binding.contentDigest,
  byte_length: binding.byteLength,
  source_manifest_ordinal: binding.sourceManifestOrdinal,
  git_blob_oid: binding.gitBlobOid,
  tracked_at_base_commit: binding.trackedAtBaseCommit,
  dirty_relative_to_base: binding.dirtyRelativeToBaseCommit,
  producer_revision: binding.producerRevision,
  binding_checksum: binding.checksum,
}));
const checksumShapeOk = rows.every((row) => /^[a-f0-9]{64}$/.test(row.binding_checksum));
const revisionOk = rows.every((row) => row.workspace_revision === admittedRevision);

const plan = {
  schema: 'atlas.workspace-source-binding-dryrun.v1',
  generatedAt: new Date().toISOString(),
  mode: 'DRY_RUN',
  status: tableOk && checksumShapeOk && revisionOk ? 'BINDING_DRY_RUN_READY_NOT_WRITTEN' : 'BINDING_DRY_RUN_BLOCKED',
  dbWritesPerformed: false,
  tableOk,
  tableColumnCount: liveColumns.length,
  targetWorkspaceRevision: admittedRevision,
  recordManifestRevisionNotUsed: built.record.workspaceRevision,
  selectionChecksum: hygiene.sourceSelectionChecksum,
  coverageMode: 'PARTIAL_EXISTING_SOURCE_REFS_ONLY',
  canonicalSourceCount: hygiene.canonicalSourceCount,
  rootCanonicalCount: rootCanonical.length,
  rootMatchedCount: matched.length,
  deferredMissingSourceRefs: deferredMissing,
  rowCount: rows.length,
  checksumShapeOk,
  revisionOk,
  gitBaseline: { repositoryId: REPOSITORY_ID, baseCommitOid, baseTreeOid, gitHeadRef, dirtyPathCount: dirtyPaths.size },
  sampleRows: rows.slice(0, 5),
  nextGate: 'OPERATOR_AUTHORIZATION_REQUIRED_FOR_CANONICAL_SOURCE_BINDING_WRITE',
  applyPhrase: CONFIRM_PHRASE,
};

mkdirSync(path.dirname(reportPath), { recursive: true });
// Full candidate rows (one JSON object per line) for review and rehearsal. Still a read-only artifact.
const rowsRelative = reportRelative.replace(/\.json$/, '-rows.jsonl');
writeFileSync(path.resolve(REPO_ROOT, rowsRelative), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
writeFileSync(reportPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
console.log(JSON.stringify({
  status: plan.status,
  rowCount: plan.rowCount,
  rootMatchedCount: plan.rootMatchedCount,
  deferredMissingSourceRefs: plan.deferredMissingSourceRefs,
  checksumShapeOk,
  revisionOk,
  dbWritesPerformed: false,
  report: path.relative(REPO_ROOT, reportPath),
}, null, 2));
