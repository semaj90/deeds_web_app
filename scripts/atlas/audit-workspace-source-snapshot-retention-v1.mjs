#!/usr/bin/env node
/**
 * Read-only census of materialized WorkspaceSnapshotV1 directories.
 * This reports retention candidates; it never removes snapshots or partials.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const materializedRoot = path.join(root, '.tmp', 'workspace-source-snapshots');
const admissionPath = path.join(root, 'docs', 'reports', 'workspace-revision-tournament-admission-v1.json');
const reportPath = path.join(root, 'docs', 'reports', 'workspace-source-snapshot-retention-v1.json');

function directoryBytes(directory) {
  let bytes = 0;
  let files = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = directoryBytes(entryPath);
      bytes += nested.bytes;
      files += nested.files;
    } else if (entry.isFile()) {
      bytes += fs.statSync(entryPath).size;
      files += 1;
    }
  }
  return { bytes, files };
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

const admission = readJson(admissionPath) ?? {};
const admittedRevision = admission.snapshotRevision ?? null;
const entries = fs.existsSync(materializedRoot)
  ? fs.readdirSync(materializedRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];

const snapshots = entries.map((entry) => {
  const directory = path.join(materializedRoot, entry.name);
  const marker = readJson(path.join(directory, '.materialization.json'));
  const size = directoryBytes(directory);
  const partial = entry.name.includes('.partial');
  const complete = !partial && marker?.schema === 'atlas.workspace-source-materialization.v1';
  return {
    directory: path.relative(root, directory).replaceAll('\\', '/'),
    directoryName: entry.name,
    snapshotRevision: marker?.snapshotRevision ?? (partial ? null : `sha256:${entry.name}`),
    sourceCount: marker?.sourceCount ?? null,
    complete,
    partial,
    bytes: size.bytes,
    gib: Number((size.bytes / 1024 ** 3).toFixed(3)),
    files: size.files,
  };
});

const complete = snapshots.filter((snapshot) => snapshot.complete);
const revisionCounts = new Map();
for (const snapshot of complete) revisionCounts.set(snapshot.snapshotRevision, (revisionCounts.get(snapshot.snapshotRevision) ?? 0) + 1);
const duplicateRevisionGroups = [...revisionCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([snapshotRevision, count]) => ({ snapshotRevision, count }));
const deletionCandidates = complete
  .filter((snapshot) => snapshot.snapshotRevision !== admittedRevision)
  .map((snapshot) => ({ ...snapshot, reason: 'HISTORICAL_REVISION_REVIEW_ONLY' }));

const report = {
  schema: 'atlas.workspace-source-snapshot-retention.v1',
  gate: 'WORKSPACE-SNAPSHOT-RETENTION-CENSUS-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  admittedSnapshotRevision: admittedRevision,
  snapshotDirectoryCount: snapshots.length,
  completeSnapshotCount: complete.length,
  partialDirectoryCount: snapshots.filter((snapshot) => snapshot.partial).length,
  totalBytes: snapshots.reduce((total, snapshot) => total + snapshot.bytes, 0),
  totalGiB: Number((snapshots.reduce((total, snapshot) => total + snapshot.bytes, 0) / 1024 ** 3).toFixed(3)),
  duplicateRevisionGroups,
  snapshots,
  deletionCandidates,
  writesPerformed: false,
  status: duplicateRevisionGroups.length === 0 ? 'RETENTION_CENSUS_COMPLETE_NO_SAME_REVISION_DUPLICATES' : 'SAME_REVISION_DUPLICATES_DETECTED',
  nextGate: 'EXPLICIT_SNAPSHOT-RETENTION-CLEANUP-AUTHORIZATION',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
