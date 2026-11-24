/** Classify one source binding against an explicitly admitted workspace revision. */
export function classifyWorkspaceSourceBindingV1({ expected, bindings, workspaceRevision }) {
  const rows = (Array.isArray(bindings) ? bindings : []).filter(
    (row) => String(row.canonical_source_ref ?? '').replaceAll('\\', '/') === expected.sourceRef,
  );
  const currentRows = rows.filter((row) => String(row.workspace_revision ?? '') === workspaceRevision);
  if (currentRows.length > 1) return 'AMBIGUOUS';
  if (currentRows.length === 0) return rows.length > 0 ? 'WRONG_WORKSPACE_REVISION' : 'WORKSPACE_IDENTITY_ONLY';

  const actual = currentRows[0];
  if (String(actual.source_revision ?? '').trim() !== expected.sourceRevision) return 'SOURCE_CONTENT_MISMATCH';
  const actualDigest = String(actual.content_digest ?? '').trim().toLowerCase().replace(/^sha256:/, '');
  if (actualDigest !== expected.contentDigest) return 'SOURCE_CONTENT_MISMATCH';
  return 'REVISION_BOUND';
}
