/**
 * Owner-decision transaction body for Graphify canonical execution selection.
 * The authority table (`graphify_execution_authority`) is the owner; `graphify_executions.canonical_authority` is only kept
 * in step as the legacy compatibility field until readers cut over. Caller owns BEGIN/COMMIT/ROLLBACK; `db` is a pg client.
 * A SELECTED row requires real operator provenance (selected_by + selection_receipt); nothing here invents either.
 */
const FINISHED = ['COMPLETED', 'COMPLETED_REUSED'];

export async function applyGraphifyOwnerDecisionV1(db, { chosenExecutionId, selectedBy, selectionReceipt }) {
  if (!selectedBy || !String(selectedBy).trim()) throw new Error('SELECTION_PROVENANCE_REQUIRED:selected_by');
  if (!selectionReceipt || !String(selectionReceipt).trim()) throw new Error('SELECTION_PROVENANCE_REQUIRED:selection_receipt');

  const chosen = (await db.query(
    `select execution_id::text as execution_id, workspace_id::text as workspace_id, workspace_revision, status
       from public.graphify_executions where execution_id = $1::uuid for update`,
    [chosenExecutionId],
  )).rows[0];
  if (!chosen) throw new Error(`EXECUTION_ID_NOT_FOUND_AT_APPLY_TIME:${chosenExecutionId}`);
  if (!FINISHED.includes(chosen.status)) throw new Error(`EXECUTION_NOT_COMPLETED:${chosen.status}`);

  const before = (await db.query(
    `select execution_id::text as execution_id, authority_state from public.graphify_execution_authority where workspace_id = $1::uuid and workspace_revision = $2`,
    [chosen.workspace_id, chosen.workspace_revision],
  )).rows;

  // 1. demote every other legacy-canonical execution of this revision (never leave two true at once)
  await db.query(
    `update public.graphify_executions set canonical_authority = false
      where workspace_id = $1::uuid and workspace_revision = $2 and canonical_authority is true and execution_id <> $3::uuid`,
    [chosen.workspace_id, chosen.workspace_revision, chosenExecutionId],
  );
  // 2. the owner: one authority row per revision (composite FK guarantees the execution belongs to this revision)
  await db.query(
    `insert into public.graphify_execution_authority
       (workspace_id, workspace_revision, execution_id, authority_state, selected_at, selected_by, selection_receipt, imported_at, import_receipt)
     values ($1::uuid, $2, $3::uuid, 'SELECTED', now(), $4, $5, null, null)
     on conflict (workspace_id, workspace_revision) do update
       set execution_id = excluded.execution_id, authority_state = 'SELECTED', selected_at = excluded.selected_at,
           selected_by = excluded.selected_by, selection_receipt = excluded.selection_receipt, imported_at = null, import_receipt = null`,
    [chosen.workspace_id, chosen.workspace_revision, chosenExecutionId, String(selectedBy).trim(), String(selectionReceipt).trim()],
  );
  // 3. legacy compatibility field follows the owner
  const promoted = await db.query(
    `update public.graphify_executions set canonical_authority = true where execution_id = $1::uuid returning execution_id::text`,
    [chosenExecutionId],
  );
  if (promoted.rowCount !== 1) throw new Error(`EXECUTION_ID_NOT_FOUND_AT_APPLY_TIME:${chosenExecutionId}`);

  const legacy = (await db.query(
    `select execution_id::text as execution_id from public.graphify_executions
      where workspace_id = $1::uuid and workspace_revision = $2 and canonical_authority is true`,
    [chosen.workspace_id, chosen.workspace_revision],
  )).rows;
  const authority = (await db.query(
    `select execution_id::text as execution_id, authority_state, selected_by, selection_receipt, imported_at, import_receipt
       from public.graphify_execution_authority where workspace_id = $1::uuid and workspace_revision = $2`,
    [chosen.workspace_id, chosen.workspace_revision],
  )).rows;
  const ok = legacy.length === 1 && legacy[0].execution_id === chosenExecutionId
    && authority.length === 1 && authority[0].execution_id === chosenExecutionId && authority[0].authority_state === 'SELECTED'
    && authority[0].selected_by === String(selectedBy).trim() && authority[0].imported_at === null && authority[0].import_receipt === null;
  if (!ok) throw new Error('OWNER_DECISION_READBACK_MISMATCH');
  return { workspaceId: chosen.workspace_id, workspaceRevision: chosen.workspace_revision, previousAuthority: before, legacy, authority };
}
