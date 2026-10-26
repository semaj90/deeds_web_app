import { createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function blocked(reason, previous, current) {
  return {
    schema: 'atlas.workspace-snapshot-delta.v1',
    status: 'FULL_RECAPTURE_REQUIRED',
    reason,
    previousSnapshotRevision: previous?.snapshotRevision ?? null,
    currentSnapshotRevision: current?.snapshotRevision ?? null,
    changes: [],
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function indexSources(snapshot) {
  if (!Array.isArray(snapshot.sources)) throw new Error('SNAPSHOT_SOURCES_INVALID');
  const result = new Map();
  for (const row of snapshot.sources) {
    if (!row || typeof row.sourceIdentityKey !== 'string' || !row.sourceIdentityKey
      || typeof row.sourceRef !== 'string' || typeof row.sourceRevision !== 'string'
      || !/^sha256:[a-f0-9]{64}$/.test(row.sourceRevision)
      || typeof row.contentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(row.contentDigest)
      || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0) {
      throw new Error('SNAPSHOT_SOURCE_IDENTITY_INVALID');
    }
    if (result.has(row.sourceIdentityKey)) throw new Error('SNAPSHOT_SOURCE_IDENTITY_DUPLICATE');
    result.set(row.sourceIdentityKey, row);
  }
  return result;
}

export function compareVerifiedWorkspaceSnapshotsV1(previous, current) {
  if (!previous || !current
    || previous.schema !== 'atlas.workspace-source-snapshot-capture.v1'
    || current.schema !== 'atlas.workspace-source-snapshot-capture.v1'
    || previous.status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK'
    || current.status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK'
    || previous.canonicalAuthority !== false || current.canonicalAuthority !== false
    || previous.datastoreWritesPerformed !== false || current.datastoreWritesPerformed !== false) {
    return blocked('SNAPSHOT_RECEIPT_NOT_VERIFIED', previous, current);
  }
  if (previous.workspaceId !== current.workspaceId || previous.repositoryRoot !== current.repositoryRoot) {
    return blocked('WORKSPACE_IDENTITY_CHANGED', previous, current);
  }
  if (digest(previous.policy) !== digest(current.policy)) {
    return blocked('SOURCE_SELECTION_POLICY_CHANGED', previous, current);
  }
  const repositoryIdentity = (snapshot) => snapshot.repositories
    ?.map(({ relativePath, kind }) => [relativePath, kind])
    .sort(([a], [b]) => String(a).localeCompare(String(b), 'en'));
  if (!Array.isArray(previous.repositories) || !Array.isArray(current.repositories)
    || digest(repositoryIdentity(previous)) !== digest(repositoryIdentity(current))) {
    return blocked('REPOSITORY_SET_CHANGED', previous, current);
  }

  let before;
  let after;
  try {
    before = indexSources(previous);
    after = indexSources(current);
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'SNAPSHOT_SOURCE_INDEX_FAILED', previous, current);
  }

  const changes = [];
  for (const [identity, row] of before) {
    const next = after.get(identity);
    if (!next) {
      changes.push({ operation: 'DELETE', sourceIdentityKey: identity, sourceRef: row.sourceRef, previousSourceRevision: row.sourceRevision });
      continue;
    }
    if (row.sourceRef !== next.sourceRef) {
      changes.push({ operation: 'IDENTITY_PATH_CONFLICT', sourceIdentityKey: identity, previousSourceRef: row.sourceRef, sourceRef: next.sourceRef });
      continue;
    }
    if (row.sourceRevision !== next.sourceRevision || row.contentDigest !== next.contentDigest || row.byteLength !== next.byteLength) {
      changes.push({
        operation: 'MODIFY', sourceIdentityKey: identity, sourceRef: next.sourceRef,
        previousSourceRevision: row.sourceRevision, sourceRevision: next.sourceRevision,
        previousContentDigest: row.contentDigest, contentDigest: next.contentDigest,
        previousByteLength: row.byteLength, byteLength: next.byteLength,
      });
    }
  }
  for (const [identity, row] of after) {
    if (!before.has(identity)) changes.push({
      operation: 'ADD', sourceIdentityKey: identity, sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision, contentDigest: row.contentDigest, byteLength: row.byteLength,
    });
  }
  changes.sort((a, b) => a.sourceIdentityKey.localeCompare(b.sourceIdentityKey, 'en'));
  const identityConflicts = changes.filter((row) => row.operation === 'IDENTITY_PATH_CONFLICT');
  if (identityConflicts.length) return {
    ...blocked('SOURCE_IDENTITY_PATH_CONFLICT', previous, current),
    changes: identityConflicts,
  };
  return {
    schema: 'atlas.workspace-snapshot-delta.v1',
    status: 'SNAPSHOT_DELTA_VERIFIED_NOT_ADMITTED',
    previousSnapshotRevision: previous.snapshotRevision,
    currentSnapshotRevision: current.snapshotRevision,
    previousWorkspaceRevision: previous.workspaceRevision ?? null,
    currentWorkspaceRevision: current.workspaceRevision ?? null,
    sourceCountBefore: before.size,
    sourceCountAfter: after.size,
    changes,
    changedCount: changes.length,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
