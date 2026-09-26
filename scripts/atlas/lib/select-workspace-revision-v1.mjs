const WORKSPACE_REVISION = /^sha256:[0-9a-f]{64}$/i;

/** Select only a revision present in the canonical binding census. */
export function selectWorkspaceRevisionV1(requestedRevision, availableRevisions) {
  const available = [...new Set(availableRevisions.map((value) => String(value ?? '').trim()).filter(Boolean))];
  const requested = String(requestedRevision ?? '').trim();

  if (requested) {
    if (!WORKSPACE_REVISION.test(requested)) {
      throw new Error('CANARY_CURRENT_WORKSPACE_REVISION_REQUIRED');
    }
    if (!available.includes(requested)) {
      throw new Error('CANARY_REQUESTED_WORKSPACE_REVISION_NOT_BOUND');
    }
    return requested;
  }

  if (available.length !== 1 || !WORKSPACE_REVISION.test(available[0] ?? '')) {
    throw new Error('CANARY_CURRENT_WORKSPACE_REVISION_REQUIRED');
  }
  return available[0];
}
