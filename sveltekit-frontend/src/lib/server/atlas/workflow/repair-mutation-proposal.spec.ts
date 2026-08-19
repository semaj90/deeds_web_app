import { describe, expect, it } from 'vitest';
import {
  OperatorRepairAuthorizationV1Schema,
  RepairMutationProposalV1Schema,
  compileAuthorizedRepairWorkflow,
  compileRepairProposalWorkflow,
} from './repair-mutation-proposal.js';
import { stableReceiptSha256 } from '../ranking/measured-matrix-diagnostics.js';

function proposal() {
  return RepairMutationProposalV1Schema.parse({
    schema: 'atlas.repair-mutation-proposal.v1',
    requestId: 'req-1',
    workflowId: 'repair:req-1',
    workflowRevision: 1,
    workspaceRevision: 'workspace-742',
    graphRevision: 'graph-338',
    sourceRef: 'src/routes/example/+server.ts',
    sourceRevision: 'git:abc123',
    mutationIntent: 'PATCH_SOURCE',
    proposedToolName: 'ops.propose_patch',
    patchArtifactRef: 'logs/repair-tasks/task-1.json#patch',
    patchSha256: 'a'.repeat(64),
    contextManifestV2Sha256: 'b'.repeat(64),
    matrixDiagnosticsReceiptSha256: 'c'.repeat(64),
    tangPolicyReceiptSha256: 'd'.repeat(64),
    revisionProofReceiptRef: 'evidence:req-1:canonical-revision-proof',
    selectedPacketKeys: ['P1', 'P2'],
    exactPromotedPacketKeys: ['P2'],
    tangSelectedPacketKeys: ['P1'],
    evidenceRefs: ['evidence:req-1'],
    tangQualified: true,
    proposalOnly: true,
    operatorAuthorizationRequired: true,
    validationRequired: true,
    evidenceAuthorizesMutation: false,
    sideEffectsAuthorized: false,
    canonicalWritesAllowed: false,
    producerRevision: 'test',
  });
}

describe('repair mutation proposal workflow boundary', () => {
  it('emits a proposal-only WorkflowActionEvent with canonical writes disabled', () => {
    const value = proposal();
    const bundle = compileRepairProposalWorkflow(value, 'test');
    expect(bundle.canonicalWritesAllowed).toBe(false);
    expect(bundle.dag.canonicalWritesAllowed).toBe(false);
    expect(bundle.dag.workspaceRevision).toBe(value.workspaceRevision);
    expect(bundle.dag.graphRevision).toBe(value.graphRevision);
    expect(bundle.dag.nodes.map((node) => node.kind)).toEqual([
      'EXACT_PROMOTION',
      'VALIDATE',
      'MCP_TOOL_CALL',
    ]);
    expect(bundle.action.toolName).toBe('ops.propose_patch');
    expect(bundle.action.validationRequired).toBe(true);
    expect(bundle.action.mutationRequested).toBe(false);
  });

  it('cannot compile a mutating DAG from an unapproved operator authorization', () => {
    const value = proposal();
    const authorization = OperatorRepairAuthorizationV1Schema.parse({
      schema: 'atlas.operator-repair-authorization.v1',
      authorizationId: 'auth-1',
      authorizationRevision: 1,
      proposalSha256: stableReceiptSha256(value),
      sourceRevision: value.sourceRevision,
      approved: false,
      operatorId: 'operator-1',
      allowedToolName: 'ops.apply_patch',
      validationRequired: true,
      producerRevision: 'test',
    });
    expect(() => compileAuthorizedRepairWorkflow({
      proposal: value,
      authorization,
      producerRevision: 'test',
    })).toThrow(/NOT_APPROVED/);
  });

  it('requires operator authorization to be checksum- and revision-bound to the proposal', () => {
    const value = proposal();
    const authorization = OperatorRepairAuthorizationV1Schema.parse({
      schema: 'atlas.operator-repair-authorization.v1',
      authorizationId: 'auth-1',
      authorizationRevision: 1,
      proposalSha256: 'f'.repeat(64),
      sourceRevision: value.sourceRevision,
      approved: true,
      operatorId: 'operator-1',
      allowedToolName: 'ops.apply_patch',
      validationRequired: true,
      producerRevision: 'test',
    });
    expect(() => compileAuthorizedRepairWorkflow({
      proposal: value,
      authorization,
      producerRevision: 'test',
    })).toThrow(/PROPOSAL_MISMATCH/);
  });

  it('compiles an authorized mutating action only after validator ancestry and operator approval', () => {
    const value = proposal();
    const authorization = OperatorRepairAuthorizationV1Schema.parse({
      schema: 'atlas.operator-repair-authorization.v1',
      authorizationId: 'auth-1',
      authorizationRevision: 2,
      proposalSha256: stableReceiptSha256(value),
      sourceRevision: value.sourceRevision,
      approved: true,
      operatorId: 'operator-1',
      allowedToolName: 'ops.apply_patch',
      validationRequired: true,
      producerRevision: 'test',
    });
    const bundle = compileAuthorizedRepairWorkflow({
      proposal: value,
      authorization,
      producerRevision: 'test',
    });

    expect(bundle.operatorAuthorized).toBe(true);
    expect(bundle.canonicalWritesAllowed).toBe(true);
    expect(bundle.dag.workspaceRevision).toBe(value.workspaceRevision);
    expect(bundle.dag.graphRevision).toBe(value.graphRevision);
    expect(bundle.dag.nodes.find((node) => node.nodeId === 'apply-patch')?.dependsOn)
      .toEqual(['validate-authorized-repair']);
    expect(bundle.action.toolName).toBe('ops.apply_patch');
    expect(bundle.action.mutationRequested).toBe(true);
    expect(bundle.action.validationRequired).toBe(true);
  });
});
