export function assertGraphifyWorkflowRevisionMatchesAdmissionV1(workflowReceipt, admittedWorkspaceRevision) {
  const observedWorkspaceRevision = workflowReceipt?.sourceBindingObservation?.workspaceRevision;
  if (typeof observedWorkspaceRevision !== 'string' || observedWorkspaceRevision.length === 0) {
    throw new Error('GRAPHIFY_SOURCE_BINDING_WORKSPACE_REVISION_MISSING');
  }
  if (typeof admittedWorkspaceRevision !== 'string' || admittedWorkspaceRevision.length === 0) {
    throw new Error('GRAPHIFY_ADMITTED_WORKSPACE_REVISION_MISSING');
  }
  if (observedWorkspaceRevision !== admittedWorkspaceRevision) {
    throw new Error('GRAPHIFY_SOURCE_BINDING_WORKSPACE_REVISION_MISMATCH');
  }
  return true;
}
