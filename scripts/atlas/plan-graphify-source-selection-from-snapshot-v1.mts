#!/usr/bin/env node
/** Read-only adapter from WorkspaceSnapshotV1 to Graphify source bindings. */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';
import { normalizeInventoryPath, sourceIdentityKey } from './lib/canonical-source-inventory-hygiene-v1.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json');
const HYGIENE = resolve(ROOT, 'docs/reports/canonical-source-inventory-hygiene-v1.json');
const hash = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const jsonHash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const normalize = normalizeInventoryPath;
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
const hygienePath = resolve(ROOT, argument('--hygiene') ?? HYGIENE);
const snapshot = JSON.parse(await readFile(manifestPath, 'utf8'));
const hygiene = JSON.parse(await readFile(hygienePath, 'utf8'));
const snapshotReadback = validateSnapshot(snapshot);
const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
const canonicalKeys = new Set(
  Array.isArray(hygiene.canonicalSources)
    ? hygiene.canonicalSources.map((entry: any) => String(entry.sourceIdentityKey ?? ''))
    : [],
);
const canonicalSources = sources.filter((source: any) => canonicalKeys.has(sourceIdentityKey(source)));
const bindings = canonicalSources.map((source: any) => ({
  repositoryId: normalize(source.repositoryId),
  repositoryRelativePath: normalize(source.repositoryRelativePath ?? source.sourceRef),
  sourceRef: normalize(source.sourceRef),
  codeSourceRevision: source.sourceRevision,
  contentHash: source.contentDigest,
  byteLength: source.byteLength,
}));
const sourceRefs = canonicalSources.map((source: any) => sourceIdentityKey(source));
const duplicateRefs = sourceRefs.filter((ref, index) => sourceRefs.indexOf(ref) !== index);
const sourceSelectionChecksum = hash(JSON.stringify([...sourceRefs].sort()));
const sourceManifest = canonicalSources.map((source: any) => ({
  sourceIdentityKey: sourceIdentityKey(source),
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
  sourceManifest: sources.map((source: any) => ({
    sourceIdentityKey: sourceIdentityKey(source),
    sourceRevision: source.sourceRevision,
    byteLength: source.byteLength,
  })),
});
const recurrencePreventionProven = hygiene.recurrencePrevented === true
  && hygiene.writerUsesSharedExclusionPolicy === true
  && hygiene.recurrenceExclusionProof?.pass === true;
const knownJunkExcluded = hygiene.knownJunkMatches?.target === 0
  && hygiene.knownJunkMatches?.pythonRuntime === 0
  && hygiene.knownJunkMatches?.backup === 0
  && hygiene.knownJunkMatches?.generatedBuild === 0
  && hygiene.knownJunkMatches?.worktreeDuplicate === 0;
const hygieneMatchesSnapshot = hygiene.status === 'SOURCE_INVENTORY_HYGIENE_PASS'
  && hygiene.snapshotRevision === snapshot.snapshotRevision
  && hygiene.snapshotMembershipChecksum === snapshot.sourceMembershipChecksum
  && hygiene.candidatePathCount === sources.length
  && recurrencePreventionProven
  && knownJunkExcluded;
const valid = snapshotReadback.status === 'SNAPSHOT_BYTES_READBACK_PROVEN'
  && bindings.length > 0
  && duplicateRefs.length === 0
  && hygieneMatchesSnapshot
  && sourceSelectionChecksum === hygiene.sourceSelectionChecksum
  && bindings.length === hygiene.canonicalSourceCount;
const report = {
  schema: 'atlas.graphify-source-selection-plan.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_PLAN',
  status: valid ? 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED' : 'SOURCE_SELECTION_PLAN_BLOCKED', proofLevel: valid ? 'PARTIAL_PROVEN' : 'BLOCKED',
  authority: false, workspaceRevision: null, workspaceRevisionCandidate,
  writesPerformed: false, datastoreWritesPerformed: false,
  manifestPath, hygienePath, snapshotRevision: snapshot.snapshotRevision ?? null, snapshotReadback, workspaceId: snapshot.workspaceId ?? null,
  snapshotSourceCount: sources.length, sourceCount: bindings.length, sourceSelectionChecksum,
  snapshotMembershipChecksum: snapshot.sourceMembershipChecksum ?? null,
  sourceInventoryRevision: hygiene.inventoryRevision ?? null,
  sourceInventoryChecksum: hygiene.sourceInventoryChecksum ?? null,
  sourceInventoryWriterRevisionChecksum: hygiene.writerRevisionChecksum ?? null,
  sourceInventoryWriterExclusionPolicyRevision: hygiene.writerExclusionPolicyRevision ?? null,
  sourceInventoryWriterExclusionPolicyChecksum: hygiene.writerExclusionPolicyChecksum ?? null,
  sourceInventoryHygieneStatus: hygiene.status ?? null,
  recurrencePreventionProven,
  knownJunkExcluded,
  duplicateRefs: [...new Set(duplicateRefs)].sort(), bindings,
  admission: { graphifyExecutionId: null, workspaceRevision: null, requiresTournamentOrSourceAuthority: true, canCallRecordSourceSelectionStage: false },
  blockers: valid ? [] : [
    ...(snapshotReadback.status === 'SNAPSHOT_BYTES_READBACK_PROVEN' ? [] : ['SNAPSHOT_BYTES_READBACK_NOT_PROVEN']),
    ...(hygieneMatchesSnapshot ? [] : ['SOURCE_INVENTORY_HYGIENE_NOT_BOUND_TO_SNAPSHOT']),
    ...(recurrencePreventionProven ? [] : ['SOURCE_INVENTORY_RECURRENCE_PREVENTION_NOT_PROVEN']),
    ...(knownJunkExcluded ? [] : ['KNOWN_JUNK_REMAINS_IN_CANONICAL_SOURCE_SELECTION']),
    ...(bindings.length > 0 ? [] : ['CANONICAL_SOURCE_SELECTION_EMPTY']),
    ...(duplicateRefs.length === 0 ? [] : ['DUPLICATE_CANONICAL_SOURCE_IDENTITIES']),
    ...(sourceSelectionChecksum === hygiene.sourceSelectionChecksum ? [] : ['SOURCE_SELECTION_CHECKSUM_MISMATCH']),
    ...(bindings.length === hygiene.canonicalSourceCount ? [] : ['CANONICAL_SOURCE_COUNT_MISMATCH']),
  ],
  nextGate: valid ? 'WORKSPACE-REVISION-TOURNAMENT-SOURCE-AUTHORITY-01' : 'SOURCE-INVENTORY-HYGIENE-01', safeNextCommand: 'npm run atlas:graphify:snapshot-binding:audit',
  producerRevision: 'atlas.graphify-source-selection-plan.v2',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: false, workspaceRevision: null, sourceCount: bindings.length, snapshotSourceCount: sources.length, sourceSelectionChecksum, sourceInventoryChecksum: report.sourceInventoryChecksum, recurrencePreventionProven, reportPath: REPORT }, null, 2));
if (!valid) process.exitCode = 3;
