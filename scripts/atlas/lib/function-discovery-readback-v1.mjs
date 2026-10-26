export function summarizeFunctionDiscoveryReadbackV1(candidates, rows, workspaceRevision) {
  const candidateMap = new Map(candidates.map((candidate) => [candidate.symbolVersionId, candidate]));
  const canonicalReadbackVerified = candidates.length > 0
    && candidateMap.size === candidates.length
    && rows.length === candidates.length
    && new Set(rows.map((row) => row.symbol_version_id)).size === rows.length
    && rows.every((row) => row.canonical_workspace_revision === workspaceRevision
      && row.registry_status === 'active'
      && /^sha256:[a-f0-9]{64}$/.test(row.canonical_source_revision ?? '')
      && candidateMap.get(row.symbol_version_id)?.sourceRevision === row.canonical_source_revision);
  const projectionRevisionDifferenceCount = rows.filter((row) =>
    row.projection_source_revision !== row.canonical_source_revision
    || row.projection_workspace_revision !== row.canonical_workspace_revision).length;
  return {
    canonicalReadbackVerified,
    projectionRevisionDifferenceCount,
    projectionReadbackVerified: canonicalReadbackVerified && projectionRevisionDifferenceCount === 0,
  };
}
