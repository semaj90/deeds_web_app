export function deriveSourceBridgeNextGateV1(checks) {
  if (!checks.executionFound) return 'EXECUTION_READBACK_REQUIRED';
  if (!checks.executionRevisionMatchesAdmission) return 'EXECUTION_REVISION_RECONCILIATION_REQUIRED';
  if (!checks.selectedManifestMatchesAdmission) return 'SELECTED_MANIFEST_RECONCILIATION_REQUIRED';
  if (!checks.membershipUsesCurrentRevision || !checks.manifestMembershipCountMatches || !checks.exactCurrentSourceBridge) {
    return 'EXECUTION_MEMBERSHIP_RECONCILIATION_REQUIRED';
  }
  if (!checks.workspaceBindingsCoverSelectedRoot || !checks.bindingRowsAreCurrent) {
    return 'WORKSPACE_SOURCE_BINDING_RECONCILIATION_REQUIRED';
  }
  if (!checks.executionCompleted) return 'COMPLETED_EXECUTION_REQUIRED';
  return 'INDEPENDENT_SOURCE_BINDING_READBACK_AND_PACKET_MATERIALIZATION_AUDIT';
}

export function listSourceBridgeBlockingGatesV1(checks) {
  const gates = [];
  if (!checks.executionFound) gates.push('EXECUTION_READBACK_REQUIRED');
  if (!checks.executionRevisionMatchesAdmission) gates.push('EXECUTION_REVISION_RECONCILIATION_REQUIRED');
  if (!checks.selectedManifestMatchesAdmission) gates.push('SELECTED_MANIFEST_RECONCILIATION_REQUIRED');
  if (!checks.membershipUsesCurrentRevision || !checks.manifestMembershipCountMatches || !checks.exactCurrentSourceBridge) {
    gates.push('EXECUTION_MEMBERSHIP_RECONCILIATION_REQUIRED');
  }
  if (!checks.workspaceBindingsCoverSelectedRoot || !checks.bindingRowsAreCurrent) {
    gates.push('WORKSPACE_SOURCE_BINDING_RECONCILIATION_REQUIRED');
  }
  if (!checks.executionCompleted) gates.push('COMPLETED_EXECUTION_REQUIRED');
  return gates;
}
