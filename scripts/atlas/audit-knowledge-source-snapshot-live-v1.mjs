#!/usr/bin/env node

/**
 * Read-only KNOW-09 adapter.
 *
 * Binds the already admitted workspace snapshot to two observations:
 *   1. the current worktree bytes; and
 *   2. the latest source-authority repair receipt.
 *
 * This script never re-admits a workspace, updates source bindings, or writes
 * canonical data. A mismatch is evidence that the NLP/OKF lane must remain
 * derived-only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.ATLAS_REPO_ROOT ?? process.cwd());
const args = process.argv.slice(2);
const valueFor = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
};
const admissionPath = path.resolve(ROOT, valueFor('--admission', 'docs/reports/workspace-revision-tournament-admission-v1.json'));
const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
const snapshotPath = path.resolve(ROOT, valueFor('--snapshot', path.join('docs/reports/workspace-source-snapshots', `${String(admission.snapshotRevision).replace(/^sha256:/, '')}.json`)));
const registryPath = path.resolve(ROOT, valueFor('--registry', 'docs/reports/current-source-selection-input-v1.json'));
const repairPath = path.resolve(ROOT, valueFor('--repair-plan', 'docs/reports/current-source-authority-repair-plan-v1.json'));
const reportPath = path.resolve(ROOT, valueFor('--report', process.env.ATLAS_KNOWLEDGE_SOURCE_SNAPSHOT_REPORT ?? '.tmp/knowledge-source-snapshot-live-v1.json'));

const stableJson = (value) => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.keys(item).sort().reduce((out, key) => { out[key] = item[key]; return out; }, {});
});
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const digest = (value) => `sha256:${sha256(value)}`;
const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
const normalizeDigest = (value) => String(value ?? '').trim().replace(/^sha256:/i, '').toLowerCase();
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(String(value ?? ''));

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const admissionWorkspaceRevision = String(admission.workspaceRevision ?? '');
if (!validRevision(admissionWorkspaceRevision)) throw new Error('KNOWLEDGE_SNAPSHOT_ADMISSION_WORKSPACE_REVISION_INVALID');

const snapshot = loadJson(snapshotPath);
const registry = loadJson(registryPath);
const repair = loadJson(repairPath);
const sources = (snapshot.sources ?? [])
  .filter((row) => row.repositoryId === 'repo:root')
  .map((row) => ({
    sourceRef: normalizeRef(row.sourceRef ?? row.repositoryRelativePath),
    sourceRevision: String(row.sourceRevision ?? ''),
    sourceContentChecksum: normalizeDigest(row.contentDigest ?? row.sourceContentChecksum),
    byteLength: Number(row.byteLength),
  }))
  .filter((row) => row.sourceRef && validRevision(row.sourceRevision) && /^[0-9a-f]{64}$/.test(row.sourceContentChecksum));

const registryRows = Array.isArray(registry.bindings)
  ? registry.bindings
  : (Array.isArray(registry.rows) ? registry.rows : []);
const observedRegistry = new Map();
for (const row of registryRows) {
  const sourceRef = normalizeRef(row.sourceRef ?? row.source_ref);
  const sourceRevision = String(row.sourceRevision ?? row.code_source_revision ?? row.currentSourceRevision ?? '');
  const sourceContentChecksum = normalizeDigest(row.sourceContentChecksum ?? row.content_hash ?? row.currentContentDigest);
  const workspaceRevision = String(row.workspaceRevision ?? row.workspace_revision ?? registry.workspaceRevision ?? '');
  if (!sourceRef || !validRevision(sourceRevision) || !/^[0-9a-f]{64}$/.test(sourceContentChecksum)) continue;
  observedRegistry.set(sourceRef, {
    sourceRef,
    sourceRevision,
    workspaceRevision,
    sourceInventoryRevision: String(registry.sourceRefSetChecksum ?? registry.workspaceRevisionRecordChecksum ?? repair.planIdentity ?? 'unknown'),
    sourceContentChecksum,
  });
}

const expectedByRef = new Map(sources.map((row) => [row.sourceRef, row]));
const currentEntries = [];
const missingWorktree = [];
const worktreeMismatches = [];
for (const source of sources) {
  const absolute = path.resolve(ROOT, source.sourceRef);
  try {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) {
      missingWorktree.push(source.sourceRef);
      continue;
    }
    const bytes = fs.readFileSync(absolute);
    const currentDigest = sha256(bytes);
    currentEntries.push({ sourceRef: source.sourceRef, kind: 'FILE', executable: Boolean(stat.mode & 0o111), contentChecksum: currentDigest, symlinkTarget: null });
    if (currentDigest !== source.sourceContentChecksum || bytes.byteLength !== source.byteLength) {
      worktreeMismatches.push({ sourceRef: source.sourceRef, expected: source.sourceContentChecksum, observed: currentDigest, expectedBytes: source.byteLength, observedBytes: bytes.byteLength });
    }
  } catch {
    missingWorktree.push(source.sourceRef);
  }
}

const expectedEntries = sources.map((source) => ({ sourceRef: source.sourceRef, kind: 'FILE', executable: false, contentChecksum: source.sourceContentChecksum, symlinkTarget: null }));
const fingerprint = (entries) => digest(stableJson({ schema: 'atlas.raw-worktree-fingerprint.v1', entries: [...entries].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)) }));
const expectedFingerprint = fingerprint(expectedEntries);
const observedFingerprint = currentEntries.length === sources.length ? fingerprint(currentEntries) : null;
const issues = [];
for (const source of sources) {
  const observed = observedRegistry.get(source.sourceRef);
  if (!observed) issues.push({ sourceRef: source.sourceRef, kind: 'SOURCE_REGISTRY_MISSING' });
  else {
    if (observed.workspaceRevision !== admissionWorkspaceRevision) issues.push({ sourceRef: source.sourceRef, kind: 'WORKSPACE_REVISION_MISMATCH' });
    if (observed.sourceRevision !== source.sourceRevision) issues.push({ sourceRef: source.sourceRef, kind: 'SOURCE_REVISION_MISMATCH' });
    if (observed.sourceContentChecksum !== source.sourceContentChecksum) issues.push({ sourceRef: source.sourceRef, kind: 'SOURCE_CONTENT_CHECKSUM_MISMATCH' });
  }
}
for (const sourceRef of missingWorktree) issues.push({ sourceRef, kind: 'WORKTREE_SOURCE_MISSING' });
for (const row of worktreeMismatches) issues.push({ sourceRef: row.sourceRef, kind: 'WORKTREE_CONTENT_MISMATCH' });
issues.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef) || a.kind.localeCompare(b.kind));

const registryMatches = sources.filter((source) => {
  const observed = observedRegistry.get(source.sourceRef);
  return observed?.workspaceRevision === admissionWorkspaceRevision
    && observed.sourceRevision === source.sourceRevision
    && observed.sourceContentChecksum === source.sourceContentChecksum;
}).length;
const worktreeParity = missingWorktree.length === 0 && worktreeMismatches.length === 0 && observedFingerprint === expectedFingerprint;
const sourceRegistryParity = registryMatches === sources.length && issues.every((issue) => !issue.kind.startsWith('SOURCE_') && !issue.kind.startsWith('WORKSPACE_'));
const status = sourceRegistryParity && worktreeParity ? 'PROVEN' : 'BLOCKED';
const topLevel = (sourceRef) => sourceRef.split('/')[0] || '(root)';
const driftRows = [
  ...worktreeMismatches.map((row) => ({ sourceRef: row.sourceRef, kind: 'CONTENT_MISMATCH' })),
  ...missingWorktree.map((sourceRef) => ({ sourceRef, kind: 'SOURCE_MISSING' })),
];
const driftByTopLevel = driftRows.reduce((out, row) => {
  const key = topLevel(row.sourceRef);
  out[key] = out[key] ?? { contentMismatch: 0, sourceMissing: 0, total: 0 };
  out[key][row.kind === 'CONTENT_MISMATCH' ? 'contentMismatch' : 'sourceMissing'] += 1;
  out[key].total += 1;
  return out;
}, {});
const body = {
  schema: 'atlas.knowledge-source-snapshot-live-audit.v1',
  mode: 'READ_ONLY',
  admissionPath,
  snapshotPath,
  registryPath,
  repairPlanPath: repairPath,
  workspaceRevision: admissionWorkspaceRevision,
  snapshotRevision: String(admission.snapshotRevision ?? ''),
  sourceCount: sources.length,
  registryObservationCount: observedRegistry.size,
  registryStatus: registry.status ?? null,
  registryWorkspaceRevision: registry.workspaceRevision ?? null,
  repairPlanWorkspaceRevision: repair.currentWorkspaceRevision ?? null,
  exactRegistryMatches: registryMatches,
  expectedRawWorktreeFingerprint: expectedFingerprint,
  observedRawWorktreeFingerprint: observedFingerprint,
  sourceRegistryParity,
  worktreeFingerprintParity: worktreeParity,
  missingWorktreeCount: missingWorktree.length,
  worktreeMismatchCount: worktreeMismatches.length,
  driftByTopLevel,
  missingWorktreeRefs: missingWorktree,
  worktreeMismatchRefs: worktreeMismatches.map((row) => row.sourceRef),
  worktreeMismatchSamples: worktreeMismatches.slice(0, 100),
  issues: issues.slice(0, 500),
  issueCount: issues.length,
  status,
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: status === 'PROVEN' ? 'KNOW-10-PAGE-REPLAY' : 'KNOW-09-SOURCE-AUTHORITY-RECONCILIATION',
};
const report = { ...body, generatedAt: new Date().toISOString(), receiptChecksum: digest(stableJson(body)) };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, sourceCount: report.sourceCount, exactRegistryMatches: report.exactRegistryMatches, worktreeFingerprintParity: report.worktreeFingerprintParity, issueCount: report.issueCount, writesPerformed: false, reportPath }, null, 2));
