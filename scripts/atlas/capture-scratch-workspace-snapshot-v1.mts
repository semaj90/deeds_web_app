#!/usr/bin/env tsx
// Scratch-only stable workspace snapshot capture plus byte readback. Admits nothing,
// writes no database rows, and writes only exclusive files under .tmp/atlas/workspace-snapshot-scratch-v1/.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureStableSnapshot, validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const runId = `scratch-snapshot-${stamp}`;
const workspaceId = `scratch-ns7-${stamp}`;
const outDir = path.join(root, '.tmp/atlas/workspace-snapshot-scratch-v1', runId);
mkdirSync(outDir, { recursive: true });
const digestCachePath = path.join(outDir, 'digest-cache.json');

const scans: Array<{ reused: number; rehashed: number }> = [];
const snapshot = captureStableSnapshot(root, workspaceId, {
  digestCachePath,
  onDigestStats: (stats) => scans.push(...stats),
});
writeFileSync(path.join(outDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });

const readback = validateSnapshot(snapshot, { sourceReadRoot: root, digestCachePath: undefined });
writeFileSync(path.join(outDir, 'readback.json'), JSON.stringify(readback, null, 2) + '\n', { flag: 'wx' });

const summary = {
  runId,
  workspaceId,
  admitted: false,
  databaseWrites: 0,
  snapshotRevision: (snapshot as { snapshotRevision?: string }).snapshotRevision,
  captureAttempts: (snapshot as { captureAttempts?: number }).captureAttempts,
  transientDriftObserved: (snapshot as { transientDriftObserved?: boolean }).transientDriftObserved,
  readback,
  scanStats: scans,
  outDir: path.posix.join('.tmp/atlas/workspace-snapshot-scratch-v1', runId),
};
writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ runId, snapshotRevision: summary.snapshotRevision, readbackStatus: (readback as { status?: string }).status ?? 'see readback.json', outDir: summary.outDir }, null, 2));
