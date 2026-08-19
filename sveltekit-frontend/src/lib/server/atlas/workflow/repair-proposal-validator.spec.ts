import { describe, expect, it } from 'vitest';
import { RepairMutationProposalV1Schema } from './repair-mutation-proposal.js';
import {
  validateRepairProposalInIsolation,
  type RepairProposalValidationExecutor,
} from './repair-proposal-validator.js';
import { createHash } from 'node:crypto';

function proposal(patch: string) {
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
    patchSha256: createHash('sha256').update(patch).digest('hex'),
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

function executor(exitCodes: Record<string, number> = {}): RepairProposalValidationExecutor {
  return {
    async createDetachedWorktree() {
      return { worktreeId: 'wt-1' };
    },
    async run(input) {
      const key = `${input.command} ${input.args.join(' ')}`;
      const exitCode = exitCodes[key] ?? 0;
      return { exitCode, stdout: exitCode ? '' : 'ok', stderr: exitCode ? 'failed' : '', durationMs: 3 };
    },
    async removeWorktree() {},
  };
}

describe('repair proposal validator', () => {
  const patch = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n';

  it('produces VALIDATED only after apply-check, isolated apply, diff-check and targeted checks pass', async () => {
    const receipt = await validateRepairProposalInIsolation({
      schema: 'atlas.repair-proposal-validation-input.v1',
      proposal: proposal(patch),
      patch,
      targetedCommands: [
        { command: 'npm', args: ['run', 'check:target'] },
        { command: 'npx', args: ['vitest', 'run', 'target.spec.ts'] },
      ],
      validatorRevision: 'validator-r1',
      producerRevision: 'test',
    }, executor());

    expect(receipt.status).toBe('VALIDATED');
    expect(receipt.patchCheckPassed).toBe(true);
    expect(receipt.patchAppliedInIsolatedWorktree).toBe(true);
    expect(receipt.gitDiffCheckPassed).toBe(true);
    expect(receipt.targetedChecksExecuted).toBe(2);
    expect(receipt.targetedChecksPassed).toBe(2);
    expect(receipt.worktreeRemoved).toBe(true);
    expect(receipt.operatorAuthorizationGranted).toBe(false);
    expect(receipt.canonicalWritesAllowed).toBe(false);
  });

  it('fails closed when git apply --check rejects the patch', async () => {
    const receipt = await validateRepairProposalInIsolation({
      schema: 'atlas.repair-proposal-validation-input.v1',
      proposal: proposal(patch),
      patch,
      targetedCommands: [{ command: 'npm', args: ['run', 'check:target'] }],
      validatorRevision: 'validator-r1',
      producerRevision: 'test',
    }, executor({ 'git apply --check -': 1 }));

    expect(receipt.status).toBe('FAILED');
    expect(receipt.patchCheckPassed).toBe(false);
    expect(receipt.patchAppliedInIsolatedWorktree).toBe(false);
    expect(receipt.targetedChecksExecuted).toBe(0);
    expect(receipt.reasonCodes).toContain('GIT_APPLY_CHECK_FAILED');
    expect(receipt.worktreeRemoved).toBe(true);
  });

  it('fails when a targeted command fails', async () => {
    const receipt = await validateRepairProposalInIsolation({
      schema: 'atlas.repair-proposal-validation-input.v1',
      proposal: proposal(patch),
      patch,
      targetedCommands: [{ command: 'npm', args: ['run', 'check:target'] }],
      validatorRevision: 'validator-r1',
      producerRevision: 'test',
    }, executor({ 'npm run check:target': 2 }));

    expect(receipt.status).toBe('FAILED');
    expect(receipt.targetedChecksPassed).toBe(0);
    expect(receipt.reasonCodes).toContain('TARGETED_CHECK_FAILED:npm');
    expect(receipt.canonicalWritesAllowed).toBe(false);
  });
});
