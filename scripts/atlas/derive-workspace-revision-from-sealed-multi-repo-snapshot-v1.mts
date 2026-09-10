#!/usr/bin/env node

/** Read-only derivation of a multi-repository workspace revision candidate. */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SNAPSHOT_DIR = resolve(ROOT, 'docs/reports/workspace-source-snapshots');
const REPORT = resolve(ROOT, 'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json');
const hash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;

const names = (await readdir(SNAPSHOT_DIR)).filter((name) => extname(name) === '.json');
const candidates = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(resolve(SNAPSHOT_DIR, name))).mtimeMs })));
const latest = candidates.sort((a, b) => b.mtime - a.mtime)[0];
if (!latest) throw new Error('NO_WORKSPACE_SNAPSHOT_MANIFEST');

const snapshotPath = resolve(SNAPSHOT_DIR, latest.name);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const readback = validateSnapshot(snapshot);
const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
const repositories = Array.isArray(snapshot.repositories) ? snapshot.repositories : [];
const sourceManifest = sources.map((source: any) => ({
  sourceIdentityKey: source.sourceIdentityKey ?? `${source.repositoryId}:${source.repositoryRelativePath}`,
  sourceRevision: source.sourceRevision,
  byteLength: source.byteLength,
}));
const repositoryManifest = repositories.map((repository: any) => ({
  repositoryId: repository.relativePath ? `repo:${repository.relativePath}` : 'repo:root',
  repositoryRevision: repository.head ?? null,
  sourceMembershipChecksum: repository.sourceMembershipChecksum ?? null,
  sourceContentChecksum: repository.sourceContentChecksum ?? null,
}));
const derivationInput = {
  derivationPolicyRevision: 'atlas.workspace-revision-from-sealed-multi-repo-snapshot.v1',
  snapshotPolicyRevision: snapshot.policy?.revision ?? null,
  inventoryPolicyRevision: snapshot.policy?.inventoryPolicyRevision ?? null,
  sourcePolicy: snapshot.policy?.sourcePolicy ?? null,
  repositoryManifest,
  sourceManifest,
};
const workspaceRevisionCandidate = hash(derivationInput);
const blockers: string[] = [];
if (readback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN') blockers.push('SNAPSHOT_READBACK_NOT_PROVEN');
if (sources.length === 0) blockers.push('SNAPSHOT_SOURCE_MANIFEST_EMPTY');
if (repositoryManifest.some((repository) => !repository.repositoryRevision)) blockers.push('NESTED_REPOSITORY_REVISION_MISSING');
if (sourceManifest.some((source) => !source.sourceIdentityKey || !source.sourceRevision)) blockers.push('SOURCE_MANIFEST_IDENTITY_OR_REVISION_MISSING');

const report = {
  schema: 'atlas.workspace-revision-from-sealed-multi-repo-snapshot.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_DERIVATION',
  status: blockers.length ? 'WORKSPACE_REVISION_CANDIDATE_BLOCKED' : 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION',
  proofLevel: blockers.length ? 'BLOCKED' : 'PARTIAL_PROVEN',
  authority: false,
  canonicalAuthority: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  workspaceRevision: null,
  workspaceRevisionCandidate,
  snapshotPath,
  snapshotRevision: snapshot.snapshotRevision ?? null,
  sourceMembershipChecksum: snapshot.sourceMembershipChecksum ?? null,
  sourceContentChecksum: snapshot.sourceContentChecksum ?? null,
  sourceCount: sources.length,
  repositoryCount: repositories.length,
  readback,
  derivationInputChecksum: hash(derivationInput),
  blockers,
  firstBlockingInvariant: blockers[0] ?? null,
  nextGate: 'WORKSPACE-REVISION-TOURNAMENT-ADMISSION-01',
  safeNextCommand: 'npx tsx scripts/atlas/derive-workspace-revision-from-sealed-multi-repo-snapshot-v1.mts',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: false, workspaceRevision: null, workspaceRevisionCandidate, sourceCount: sources.length, repositoryCount: repositories.length, reportPath: REPORT }, null, 2));
if (blockers.length) process.exitCode = 3;
