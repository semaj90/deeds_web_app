#!/usr/bin/env node

/** Read-only comparison of the sealed multi-repository snapshot and Graphify origin. */
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SNAPSHOT_DIR = resolve(ROOT, 'docs/reports/workspace-source-snapshots');
const REPORT = resolve(ROOT, 'docs/reports/graphify-source-population-delta-v1.json');
const names = (await readdir(SNAPSHOT_DIR)).filter((name) => name.endsWith('.json'));
const latest = (await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(resolve(SNAPSHOT_DIR, name))).mtimeMs })))).sort((a, b) => b.mtime - a.mtime)[0];
if (!latest) throw new Error('NO_WORKSPACE_SNAPSHOT_MANIFEST');
const snapshotPath = resolve(SNAPSHOT_DIR, latest.name);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const originPath = resolve(ROOT, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
const origin = JSON.parse(await readFile(originPath, 'utf8'));
const snapshotRows = snapshot.sources ?? [];
const originRows = origin.sourceBindings ?? [];
const snapshotKey = (row) => row.sourceIdentityKey ?? `${row.repositoryId ?? 'repo:root'}:${row.repositoryRelativePath ?? row.sourceRef}`;
const originKey = (row) => row.sourceIdentityKey ?? `${row.repositoryId ?? 'repo:root'}:${row.repositoryRelativePath ?? row.sourceRef}`;
const snapshotByKey = new Map(snapshotRows.map((row) => [snapshotKey(row), row]));
const originByKey = new Map(originRows.map((row) => [originKey(row), row]));
const onlySnapshot = [...snapshotByKey.keys()].filter((key) => !originByKey.has(key)).sort();
const onlyOrigin = [...originByKey.keys()].filter((key) => !snapshotByKey.has(key)).sort();
const nestedOnlySnapshot = onlySnapshot.filter((key) => snapshotByKey.get(key)?.repositoryPath);
const report = {
  schema: 'atlas.graphify-source-population-delta.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: onlySnapshot.length === 0 && onlyOrigin.length === 0 ? 'POPULATION_PARITY_PROVEN' : 'NESTED_REPOSITORY_BINDING_MISMATCH',
  proofLevel: 'PARTIAL_PROVEN', authority: false, writesPerformed: false, datastoreWritesPerformed: false,
  snapshotPath, originPath, snapshotRevision: snapshot.snapshotRevision ?? null, originWorkspaceRevision: origin.workspaceRevision ?? null,
  counts: { snapshot: snapshotByKey.size, origin: originByKey.size, onlySnapshot: onlySnapshot.length, onlyOrigin: onlyOrigin.length, nestedOnlySnapshot: nestedOnlySnapshot.length },
  classification: { nestedRepositoryOnly: nestedOnlySnapshot.length, rootPolicyDifference: onlySnapshot.length - nestedOnlySnapshot.length, unknown: onlyOrigin.length },
  samples: { onlySnapshot: onlySnapshot.slice(0, 25), onlyOrigin: onlyOrigin.slice(0, 25) },
  firstBlockingInvariant: onlySnapshot.length || onlyOrigin.length ? 'GRAPHIFY_ORIGIN_DOES_NOT_COVER_SNAPSHOT_POPULATION' : null,
  nextGate: 'NESTED-REPOSITORY-SOURCE-BINDING-01', safeNextCommand: 'npx tsx scripts/atlas/audit-graphify-lifecycle-entrypoint-v1.mts',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: false, counts: report.counts, firstBlockingInvariant: report.firstBlockingInvariant, reportPath: REPORT }, null, 2));
