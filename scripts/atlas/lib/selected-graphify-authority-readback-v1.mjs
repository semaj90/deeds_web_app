export function verifySelectedGraphifyAuthorityReadbackV1(input) {
  const matches = input.rows.filter((row) =>
    row.execution_id === input.executionId
    && row.workspace_id === input.workspaceId
    && row.workspace_revision === input.workspaceRevision);
  if (matches.length !== 1) return false;
  const row = matches[0];
  return row.authority_state === 'SELECTED'
    && Boolean(row.selected_at)
    && typeof row.selected_by === 'string'
    && row.selected_by.trim().length > 0
    && typeof row.selection_receipt === 'string'
    && row.selection_receipt.trim().length > 0;
}
