import { describe, expect, it } from 'vitest';
import { stableReceiptSha256 } from '../ranking/measured-matrix-diagnostics.js';
import { RepairMutationProposalV1Schema } from './repair-mutation-proposal.js';
import { RepairProposalValidationReceiptV1Schema } from './repair-proposal-validator.js';
import {
  ValidatedOperatorRepairAuthorizationV1Schema,
  compileValidatedAuthorizedRepairWorkflow,
} from './validated-repair-authorization.js';

function proposal() {
  return RepairMutationProposalV1Schema.parse({
    schema: 'atlas.repair-mutation-proposal.v1',
    requestId: 'req-1',
    workflowId: 'repair:req-1',
    workflowRevision: 1,
    workspaceRevision: 'ws-1',
    graphRevision: 'g-1',
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
    selectedPacketKeys: ['P1'],
    exactPromotedPacketKeys: ['P1'],
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

function validationFor(value = proposal()) {
  const withoutHash = {
    schema: 'atlas.repair-proposal-validation-receipt.v1' as const,
    requestId: value.requestId,
    proposalSha256: stableReceiptSha256(value),
    sourceRevision: value.sourceRevision,
    workspaceRevision: value.workspaceRevision,
    graphRevision: value.graphRevision,
    validatorRevision: 'validator-r1',
    isolationMode: 'DETACHED_GIT_WORKTREE' as const,
    worktreeCreated: true,
    patchCheckPassed: true,
    patchAppliedInIsolatedWorktree: true,
    targetedChecksExecuted: 2,
    targetedChecksPassed: 2,
    gitDiffCheckPassed: true,
    worktreeRemoved: true,
    checks: [],
    status: 'VALIDATED' as const,
    reasonCodes: ['PATCH_VALIDATED_IN_DETACHED_WORKTREE'],
    mutationOutsideIsolatedWorktreeObserved: false as const,
    operatorAuthorizationGranted: false as const,
    canonicalWritesAllowed: false as const,
    producerRevision: 'test',
  };
  return RepairProposalValidationReceiptV1Schema.parse({
    ...withoutHash,
    receiptSha256: stableReceiptSha256(withoutHash),
  });
}

describe('validated repair authorization', () => {
  it('compiles a mutating workflow only when approval names the exact VALIDATED receipt', () => {
    const value = proposal();
    const validation = validationFor(value);
    const authorization = ValidatedOperatorRepairAuthorizationV1Schema.parse({
      schema: 'atlas.operator-repair-authorization.v1',
      authorizationId: 'auth-1',
      authorizationRevision: 1,
      proposalSha256: stableReceiptSha256(value),
      sourceRevision: value.sourceRevision,
      approved: true,
      operatorId: 'operator-1',
      allowedToolName: 'ops.apply_patch',
      validationRequired: true,
      validationReceiptSha256: validation.receiptSha256,
      validationStatus: 'VALIDATED',
      producerRevision: 'test',
    });

    const result = compileValidatedAuthorizedRepairWorkflow({
      proposal: value,
      validationReceipt: validation,
      authorization,
      producerRevision: 'test',
    });
    expect(result.validationReceiptRequired).toBe(true);
    expect(result.validationStatus).toBe('VALIDATED');
    expect(result.structuralBundle.action.mutationRequested).toBe(true);
    expect(result.structuralBundle.dag.canonicalWritesAllowed).toBe(true);
  });

  it('rejects an authorization bound to a different validation receipt', () => {
    const value = proposal();
    const validation = validationFor(value);
    const authorization = ValidatedOperatorRepairAuthorizationV1Schema.parse({
      schema: 'atlas.operator-repair-authorization.v1',
      authorizationId: 'auth-1',
      authorizationRevision: 1,
      proposalSha256: stableReceiptSha256(value),
      sourceRevision: value.sourceRevision,
      approved: true,
      operatorId: 'operator-1',
      allowedToolName: 'ops.apply_patch',
      validationRequired: true,
      validationReceiptSha256: 'f'.repeat(64),
      validationStatus: 'VALIDATED',
      producerRevision: 'test',
    });

    expect(() => compileValidatedAuthorizedRepairWorkflow({
      proposal: value,
      validationReceipt: validation,
      authorization,
      producerRevision: 'test',
    })).toThrow(/VALIDATION_RECEIPT_MISMATCH/);
  });

  it('rejects a validation receipt from a different source revision', () => {
    const value = proposal();
    const base = validationFor(value);
    const withoutHash = { ...base, sourceRevision: 'git:different' };
    const validation = RepairProposalValidationReceiptV1Schema.parse({
      ...withoutHash,
      receiptSha256: stableReceiptSha256({ ...withoutHash, receiptSha256: undefined }),
    });
    const authorization = ValidatedOperatorRepairAuthorizationV1Schema.parse({
      schema: 'atlas.operator-repair-authorization.v1',
      authorizationId: 'auth-1',
      authorizationRevision: 1,
      proposalSha256: stableReceiptSha256(value),
      sourceRevision: value.sourceRevision,
      approved: true,
      operatorId: 'operator-1',
      allowedToolName: 'ops.apply_patch',
      validationRequired: true,
      validationReceiptSha256: validation.receiptSha256,
      validationStatus: 'VALIDATED',
      producerRevision: 'test',
    });

    expect(() => compileValidatedAuthorizedRepairWorkflow({
      proposal: value,
      validationReceipt: validation,
      authorization,
      producerRevision: 'test',
    })).toThrow(/SOURCE_REVISION_MISMATCH/);
  });
});
