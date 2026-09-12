export const SNAPSHOT_RETENTION_DECISIONS = Object.freeze([
  'KEEP_REQUIRED_CURRENT_OWNER',
  'KEEP_REQUIRED_ROLLBACK',
  'KEEP_REQUIRED_LATEST_DERIVED',
  'ARCHIVE_THEN_RECLAIM_CANDIDATE',
  'REVIEW_AFTER_EVAL',
  'REVIEW_REQUIRED_FULL_STORAGE',
  'REVIEW_REQUIRED',
]);

function creationTimeMs(snapshot) {
  const value = snapshot?.creation_time ?? snapshot?.creationTime ?? null;
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function normalizeSnapshot(snapshot) {
  return {
    name: String(snapshot?.name ?? ''),
    size: Math.max(0, Number(snapshot?.size) || 0),
    creationTime: snapshot?.creation_time ?? snapshot?.creationTime ?? null,
    checksum: snapshot?.checksum ?? null,
  };
}

export function sortSnapshotsNewestFirst(snapshots) {
  return [...(snapshots ?? [])]
    .map(normalizeSnapshot)
    .sort((a, b) => {
      const timeDelta = creationTimeMs(b) - creationTimeMs(a);
      if (timeDelta !== 0) return timeDelta;
      return b.name.localeCompare(a.name);
    });
}

function keepLatest(rows, count, keepDecision, olderDecision) {
  const keepCount = Math.max(1, Number(count) || 1);
  return rows.map((snapshot, index) => ({
    ...snapshot,
    decision: index < keepCount ? keepDecision : olderDecision,
    deletionAuthorized: false,
    archivalAuthorized: false,
  }));
}

export function planCollectionSnapshotRetention({
  collectionName,
  classification,
  snapshots,
  keepRollbackCount = 1,
  collectionHealthy = true,
}) {
  const rows = sortSnapshotsNewestFirst(snapshots);
  const className = classification?.classification ?? 'REVIEW_REQUIRED';
  let planned;

  if (className === 'CURRENT_OWNER') {
    planned = rows.map((snapshot) => ({
      ...snapshot,
      decision: 'KEEP_REQUIRED_CURRENT_OWNER',
      deletionAuthorized: false,
      archivalAuthorized: false,
    }));
  } else if (className === 'MIGRATION_ROLLBACK' && collectionHealthy) {
    planned = keepLatest(
      rows,
      keepRollbackCount,
      'KEEP_REQUIRED_ROLLBACK',
      'ARCHIVE_THEN_RECLAIM_CANDIDATE',
    );
  } else if (className === 'ROUTING_ONLY' || className === 'CHALLENGER') {
    planned = keepLatest(
      rows,
      1,
      'KEEP_REQUIRED_LATEST_DERIVED',
      'REVIEW_AFTER_EVAL',
    );
  } else {
    planned = rows.map((snapshot) => ({
      ...snapshot,
      decision: 'REVIEW_REQUIRED',
      deletionAuthorized: false,
      archivalAuthorized: false,
    }));
  }

  const reclaimCandidates = planned.filter((snapshot) => snapshot.decision === 'ARCHIVE_THEN_RECLAIM_CANDIDATE');
  const reclaimableBytesIfSeparatelyAuthorized = reclaimCandidates.reduce((sum, snapshot) => sum + snapshot.size, 0);
  const keepRequiredBytes = planned
    .filter((snapshot) => snapshot.decision.startsWith('KEEP_REQUIRED'))
    .reduce((sum, snapshot) => sum + snapshot.size, 0);

  return {
    collectionName,
    classification: className,
    collectionHealthy: Boolean(collectionHealthy),
    snapshotCount: planned.length,
    snapshots: planned,
    keepRequiredCount: planned.filter((snapshot) => snapshot.decision.startsWith('KEEP_REQUIRED')).length,
    reclaimCandidateCount: reclaimCandidates.length,
    keepRequiredBytes,
    reclaimableBytesIfSeparatelyAuthorized,
    deleteNow: [],
    deletionAuthorized: false,
    archivalAuthorized: false,
  };
}

export function planFullStorageSnapshotRetention(snapshots) {
  const rows = sortSnapshotsNewestFirst(snapshots).map((snapshot) => ({
    ...snapshot,
    decision: 'REVIEW_REQUIRED_FULL_STORAGE',
    deletionAuthorized: false,
    archivalAuthorized: false,
  }));
  return {
    snapshotCount: rows.length,
    snapshots: rows,
    totalBytes: rows.reduce((sum, snapshot) => sum + snapshot.size, 0),
    reclaimableBytesIfSeparatelyAuthorized: 0,
    deleteNow: [],
    deletionAuthorized: false,
    archivalAuthorized: false,
  };
}

export function summarizeSnapshotRetention(collectionPlans, fullStoragePlan) {
  const plans = collectionPlans ?? [];
  const collectionSnapshotBytes = plans.reduce(
    (sum, plan) => sum + plan.snapshots.reduce((inner, snapshot) => inner + snapshot.size, 0),
    0,
  );
  const reclaimableBytesIfSeparatelyAuthorized = plans.reduce(
    (sum, plan) => sum + Number(plan.reclaimableBytesIfSeparatelyAuthorized || 0),
    0,
  );
  const reclaimCandidateCount = plans.reduce(
    (sum, plan) => sum + Number(plan.reclaimCandidateCount || 0),
    0,
  );

  return {
    collectionSnapshotBytes,
    fullStorageSnapshotBytes: Number(fullStoragePlan?.totalBytes || 0),
    totalSnapshotBytesObserved: collectionSnapshotBytes + Number(fullStoragePlan?.totalBytes || 0),
    reclaimCandidateCount,
    reclaimableBytesIfSeparatelyAuthorized,
    deleteNow: [],
    deletionAuthorized: false,
    archivalAuthorized: false,
  };
}
