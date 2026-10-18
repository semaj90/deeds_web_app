export function classifyGraphifySourceBridgeV1({ manifestRows, graphifyRows, workspaceRevision }) {
  if (!Array.isArray(manifestRows) || !Array.isArray(graphifyRows)
    || typeof workspaceRevision !== 'string' || !workspaceRevision) {
    throw new Error('GRAPHIFY_SOURCE_BRIDGE_INPUT_INVALID');
  }

  const rowsByRef = new Map();
  for (const row of graphifyRows) {
    if (!row || typeof row.source_ref !== 'string') throw new Error('GRAPHIFY_SOURCE_BRIDGE_ROW_INVALID');
    const rows = rowsByRef.get(row.source_ref) ?? [];
    rows.push(row);
    rowsByRef.set(row.source_ref, rows);
  }

  return manifestRows.map((manifest) => {
    if (!manifest || typeof manifest.sourceRef !== 'string') throw new Error('GRAPHIFY_SOURCE_BRIDGE_MANIFEST_ROW_INVALID');
    const rows = rowsByRef.get(manifest.sourceRef) ?? [];
    const sourceRevisionRows = rows.filter((row) => row.code_source_revision === manifest.sourceRevision);
    const admittedRevisionRows = sourceRevisionRows.filter((row) => row.workspace_revision === workspaceRevision);
    const contentMatches = admittedRevisionRows.filter((row) => {
      const contentHash = String(row.content_hash ?? '').replace(/^sha256:/i, '').toLowerCase();
      const manifestDigest = String(manifest.contentDigest ?? '').replace(/^sha256:/i, '').toLowerCase();
      return contentHash === manifestDigest && Number(row.byte_length) === Number(manifest.byteLength);
    });

    let classification;
    if (rows.length === 0) classification = 'NO_GRAPHIFY_ROW';
    else if (sourceRevisionRows.length === 0) classification = 'SOURCE_REVISION_ROW_NOT_FOUND';
    else if (admittedRevisionRows.length === 0) classification = 'SOURCE_REVISION_ROW_OTHER_WORKSPACE';
    else if (contentMatches.length === 0) classification = 'ADMITTED_REVISION_CONTENT_MISMATCH';
    else if (contentMatches.length > 1) classification = 'DUPLICATE_EXACT_ADMITTED_ROWS';
    else classification = 'EXACT_ADMITTED_MATCH';

    return {
      sourceRef: manifest.sourceRef,
      classification,
      graphifyRowCount: rows.length,
      exactSourceRevisionRowCount: sourceRevisionRows.length,
      priorFirstSeenRunId: sourceRevisionRows.length === 1
        && typeof sourceRevisionRows[0].first_seen_run_id === 'string'
        ? sourceRevisionRows[0].first_seen_run_id
        : null,
      priorFirstSeenWorkspaceId: sourceRevisionRows.length === 1
        && typeof sourceRevisionRows[0].first_seen_workspace_id === 'string'
        ? sourceRevisionRows[0].first_seen_workspace_id
        : null,
      admittedWorkspaceRevisionRowCount: admittedRevisionRows.length,
      exactAdmittedMatchCount: contentMatches.length,
    };
  });
}
