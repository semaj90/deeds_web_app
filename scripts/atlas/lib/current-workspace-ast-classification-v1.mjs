export const AST_LINEAGE_CLASSES_V1 = Object.freeze([
  'AST_REVISION_QUALIFIED',
  'AST_REVISION_MISSING',
  'AST_SOURCE_MISMATCH',
  'AST_WORKSPACE_MISMATCH',
  'AST_EVIDENCE_ABSENT',
  'AST_STALE_OTHER_REVISION',
  'AST_WORKSPACE_BINDING_MISSING',
]);

export function classifyCurrentAstSourceV1(row) {
  if (row.astRows === 0) return 'AST_EVIDENCE_ABSENT';
  if (row.workspaceMatch && row.revisionMatch && row.contentHashMatch) return 'AST_REVISION_QUALIFIED';
  if (row.workspaceMismatch && !row.workspaceMatch) return 'AST_WORKSPACE_MISMATCH';
  if (row.workspaceBindingMissing && !row.workspaceMatch) return 'AST_WORKSPACE_BINDING_MISSING';
  if (row.workspaceMatch && row.revisionMatch) return 'AST_SOURCE_MISMATCH';
  if (row.workspaceMatch && row.hasOtherRevision) return 'AST_STALE_OTHER_REVISION';
  if (row.revisionMissing) return 'AST_REVISION_MISSING';
  if (row.workspaceMatch) return 'AST_SOURCE_MISMATCH';
  return 'AST_WORKSPACE_MISMATCH';
}
