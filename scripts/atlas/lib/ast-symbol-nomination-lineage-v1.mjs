const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/i;

export function resolveAstSymbolNominationLineageV1({
  sourceRevision,
  workspaceRevision = null,
  snapshotSource = null,
  bindAdmittedSnapshot = false,
}) {
  const observed = typeof sourceRevision === 'string' ? sourceRevision.trim() : '';
  if (!SHA256_REVISION.test(observed)) {
    return { status: 'INVALID_SOURCE_REVISION', sourceRevision: null, workspaceRevision: null };
  }

  if (!bindAdmittedSnapshot) {
    return { status: 'SOURCE_ONLY_PROPOSAL', sourceRevision: observed, workspaceRevision: null };
  }

  const workspace = typeof workspaceRevision === 'string' ? workspaceRevision.trim() : '';
  if (!SHA256_REVISION.test(workspace)) {
    return { status: 'INVALID_WORKSPACE_REVISION', sourceRevision: observed, workspaceRevision: null };
  }
  if (!snapshotSource || typeof snapshotSource !== 'object') {
    return { status: 'SNAPSHOT_SOURCE_UNAVAILABLE', sourceRevision: observed, workspaceRevision: null };
  }
  const boundSourceRevision = typeof snapshotSource.sourceRevision === 'string'
    ? snapshotSource.sourceRevision.trim()
    : '';
  if (!SHA256_REVISION.test(boundSourceRevision) || boundSourceRevision !== observed) {
    return { status: 'SOURCE_REVISION_MISMATCH', sourceRevision: observed, workspaceRevision: null };
  }

  return { status: 'SNAPSHOT_BOUND', sourceRevision: observed, workspaceRevision: workspace };
}
