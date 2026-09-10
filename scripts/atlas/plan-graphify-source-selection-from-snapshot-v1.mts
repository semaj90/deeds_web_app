#!/usr/bin/env node

/** Read-only adapter from WorkspaceSnapshotV1 to Graphify source bindings. */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json');
const hash = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const jsonHash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const normalize = (value: unknown) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
// WorkspaceSnapshotV1 seals the already-canonical source order. Reordering
// here would produce a different checksum for the same admitted membership.
const refsChecksum = (refs: string[]) => hash(JSON.stringify(refs));
function argument(name: string) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function latestManifest() {
  const directory = resolve(ROOT, 'docs/reports/workspace-source-snapshots');
  const names = (await readdir(directory)).filter((name) => extname(name) === '.json');
  const entries = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(resolve(directory, name))).mtimeMs })));
  const latest = entries.sort((a, b) => b.mtime - a.mtime)[0];
  if (!latest) throw new Error('NO_WORKSPACE_SNAPSHOT_MANIFEST');
  return resolve(directory, latest.name);
}

const manifestPath = resolve(ROOT, argument('--manifest') ?? process.argv[2] ?? await latestManifest());
const snapshot = JSON.parse(await readFile(manifestPath, 'utf8'));
const snapshotReadback = validateSnapshot(snapshot);
const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
const bindings = sources.map((source: any) => ({
  repositoryId: normalize(source.repositoryId),
  repositoryRelativePath: normalize(source.repositoryRelativePath ?? source.sourceRef),
  sourceRef: normalize(source.sourceRef),
  codeSourceRevision: source.sourceRevision,
  contentHash: source.contentDigest,
  byteLength: source.byteLength,
}));
const sourceRefs = bindings.map((binding, index) => sources[index].sourceIdentityKey ?? `${sources[index].repositoryId}:${sources[index].repositoryRelativePath}`);
const duplicateRefs = sourceRefs.filter((ref, index) => sourceRefs.indexOf(ref) !== index);
// WorkspaceSnapshotV1 seals membership over sorted repository-qualified keys.
// Preserve the same canonical ordering here; source presentation order is not
// an authority input and must not create a false selection mismatch.
const sourceSelectionChecksum = refsChecksum([...sourceRefs].sort());
const sourceManifest = sources.map((source: any) => ({
  sourceIdentityKey: source.sourceIdentityKey ?? `${source.repositoryId}:${source.repositoryRelativePath}`,
  sourceRevision: source.sourceRevision,
  byteLength: source.byteLength,
}));
const repositoryManifest = (Array.isArray(snapshot.repositories) ? snapshot.repositories : []).map((repository: any) => ({
  repositoryId: repository.relativePath ? `repo:${repository.relativePath}` : 'repo:root',
  repositoryRevision: repository.head ?? null,
  sourceMembershipChecksum: repository.sourceMembershipChecksum ?? null,
  sourceContentChecksum: repository.sourceContentChecksum ?? null,
}));
const workspaceRevisionCandidate = jsonHash({
  derivationPolicyRevision: 'atlas.workspace-revision-from-sealed-multi-repo-snapshot.v1',
  snapshotPolicyRevision: snapshot.policy?.revision ?? null,
  inventoryPolicyRevision: snapshot.policy?.inventoryPolicyRevision ?? null,
  sourcePolicy: snapshot.policy?.sourcePolicy ?? null,
  repositoryManifest,
  sourceManifest,
});
const valid = snapshotReadback.status === 'SNAPSHOT_BYTES_READBACK_PROVEN' && bindings.length > 0 && duplicateRefs.length === 0 && sourceSelectionChecksum === snapshot.sourceMembershipChecksum;
const report = {
  schema: 'atlas.graphify-source-selection-plan.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_PLAN',
  status: valid ? 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED' : 'SOURCE_SELECTION_PLAN_BLOCKED', proofLevel: valid ? 'PARTIAL_PROVEN' : 'BLOCKED',
  authority: false, workspaceRevision: null, workspaceRevisionCandidate,
  writesPerformed: false, datastoreWritesPerformed: false,
  manifestPath, snapshotRevision: snapshot.snapshotRevision ?? null, snapshotReadback, workspaceId: snapshot.workspaceId ?? null,
  sourceCount: bindings.length, sourceSelectionChecksum, snapshotMembershipChecksum: snapshot.sourceMembershipChecksum ?? null,
  duplicateRefs: [...new Set(duplicateRefs)].sort(), bindings,
  admission: { graphifyExecutionId: null, workspaceRevision: null, requiresTournamentOrSourceAuthority: true, canCallRecordSourceSelectionStage: false },
  nextGate: 'GRAPHIFY-SNAPSHOT-CONSUMPTION-AUTHORIZATION-01', safeNextCommand: 'npm run atlas:graphify:snapshot-binding:audit',
  producerRevision: 'atlas.graphify-source-selection-plan.v1',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: false, workspaceRevision: null, sourceCount: bindings.length, sourceSelectionChecksum, reportPath: REPORT }, null, 2));
if (!valid) process.exitCode = 3;
