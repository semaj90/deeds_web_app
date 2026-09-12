#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planCollectionSnapshotRetention,
  planFullStorageSnapshotRetention,
  sortSnapshotsNewestFirst,
  summarizeSnapshotRetention,
} from './lib/qdrant-snapshot-retention-v1.mjs';

const snapshots = [
  { name: 'old.snapshot', size: 100, creation_time: '2026-09-01T00:00:00Z' },
  { name: 'new.snapshot', size: 300, creation_time: '2026-09-10T00:00:00Z' },
  { name: 'middle.snapshot', size: 200, creation_time: '2026-09-05T00:00:00Z' },
];

test('snapshots sort newest first deterministically', () => {
  assert.deepEqual(sortSnapshotsNewestFirst(snapshots).map((row) => row.name), [
    'new.snapshot',
    'middle.snapshot',
    'old.snapshot',
  ]);
});

test('current owner snapshots are all retained', () => {
  const plan = planCollectionSnapshotRetention({
    collectionName: 'codebase_chunks_768_v2',
    classification: { classification: 'CURRENT_OWNER' },
    snapshots,
  });
  assert.equal(plan.keepRequiredCount, 3);
  assert.equal(plan.reclaimCandidateCount, 0);
  assert.equal(plan.reclaimableBytesIfSeparatelyAuthorized, 0);
  assert.ok(plan.snapshots.every((row) => row.decision === 'KEEP_REQUIRED_CURRENT_OWNER'));
  assert.deepEqual(plan.deleteNow, []);
});

test('healthy migration rollback collection keeps newest and marks older as archival candidates', () => {
  const plan = planCollectionSnapshotRetention({
    collectionName: 'codebase_chunks_768',
    classification: { classification: 'MIGRATION_ROLLBACK' },
    snapshots,
    keepRollbackCount: 1,
    collectionHealthy: true,
  });
  assert.equal(plan.keepRequiredCount, 1);
  assert.equal(plan.reclaimCandidateCount, 2);
  assert.equal(plan.reclaimableBytesIfSeparatelyAuthorized, 300);
  assert.equal(plan.snapshots[0].decision, 'KEEP_REQUIRED_ROLLBACK');
  assert.equal(plan.snapshots[1].decision, 'ARCHIVE_THEN_RECLAIM_CANDIDATE');
  assert.equal(plan.snapshots[2].decision, 'ARCHIVE_THEN_RECLAIM_CANDIDATE');
  assert.equal(plan.deletionAuthorized, false);
});

test('unhealthy migration rollback collection fails closed', () => {
  const plan = planCollectionSnapshotRetention({
    collectionName: 'codebase_chunks_768',
    classification: { classification: 'MIGRATION_ROLLBACK' },
    snapshots,
    collectionHealthy: false,
  });
  assert.ok(plan.snapshots.every((row) => row.decision === 'REVIEW_REQUIRED'));
  assert.equal(plan.reclaimCandidateCount, 0);
});

test('routing/challenger collections retain latest but do not create delete-now actions', () => {
  const plan = planCollectionSnapshotRetention({
    collectionName: 'codebase_topology_64',
    classification: { classification: 'ROUTING_ONLY' },
    snapshots,
  });
  assert.equal(plan.snapshots[0].decision, 'KEEP_REQUIRED_LATEST_DERIVED');
  assert.ok(plan.snapshots.slice(1).every((row) => row.decision === 'REVIEW_AFTER_EVAL'));
  assert.deepEqual(plan.deleteNow, []);
});

test('full-storage snapshots are review-only', () => {
  const plan = planFullStorageSnapshotRetention(snapshots);
  assert.equal(plan.snapshotCount, 3);
  assert.equal(plan.totalBytes, 600);
  assert.ok(plan.snapshots.every((row) => row.decision === 'REVIEW_REQUIRED_FULL_STORAGE'));
  assert.equal(plan.reclaimableBytesIfSeparatelyAuthorized, 0);
});

test('summary exposes reclaimable bytes without authorizing deletion', () => {
  const legacy = planCollectionSnapshotRetention({
    collectionName: 'codebase_chunks_768',
    classification: { classification: 'MIGRATION_ROLLBACK' },
    snapshots,
    keepRollbackCount: 1,
    collectionHealthy: true,
  });
  const current = planCollectionSnapshotRetention({
    collectionName: 'codebase_chunks_768_v2',
    classification: { classification: 'CURRENT_OWNER' },
    snapshots: [{ name: 'v2.snapshot', size: 400, creation_time: '2026-09-10T00:00:00Z' }],
  });
  const full = planFullStorageSnapshotRetention([{ name: 'full.snapshot', size: 500 }]);
  const summary = summarizeSnapshotRetention([legacy, current], full);
  assert.equal(summary.collectionSnapshotBytes, 1000);
  assert.equal(summary.fullStorageSnapshotBytes, 500);
  assert.equal(summary.totalSnapshotBytesObserved, 1500);
  assert.equal(summary.reclaimableBytesIfSeparatelyAuthorized, 300);
  assert.deepEqual(summary.deleteNow, []);
  assert.equal(summary.deletionAuthorized, false);
});
