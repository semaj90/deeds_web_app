import { z } from 'zod';
import { stableReceiptSha256 } from '../ranking/measured-matrix-diagnostics.js';
import {
  RepairMutationProposalV1Schema,
  type RepairMutationProposalV1,
} from './repair-mutation-proposal.js';

export const RepairValidationCheckKindSchema = z.enum([
  'GIT_APPLY_CHECK',
  'GIT_DIFF_CHECK',
  'TARGETED_COMMAND',
]);
export type RepairValidationCheckKind = z.infer<typeof RepairValidationCheckKindSchema>;

export const RepairValidationCheckV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  kind: RepairValidationCheckKindSchema,
  command: z.string().min(1),
  args: z.array(z.string()),
  exitCode: z.number().int(),
  passed: z.boolean(),
  stdoutSha256: z.string().regex(/^[a-f0-9]{64}$/),
  stderrSha256: z.string().regex(/^[a-f0-9]{64}$/),
  durationMs: z.number().int().nonnegative(),
}).strict();
export type RepairValidationCheckV1 = z.infer<typeof RepairValidationCheckV1Schema>;

export const RepairProposalValidationReceiptV1Schema = z.object({
  schema: z.literal('atlas.repair-proposal-validation-receipt.v1'),
  requestId: z.string().min(1),
  proposalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  validatorRevision: z.string().min(1),
  isolationMode: z.literal('DETACHED_GIT_WORKTREE'),
  worktreeCreated: z.boolean(),
  patchCheckPassed: z.boolean(),
  patchAppliedInIsolatedWorktree: z.boolean(),
  targetedChecksExecuted: z.number().int().nonnegative(),
  targetedChecksPassed: z.number().int().nonnegative(),
  gitDiffCheckPassed: z.boolean(),
  worktreeRemoved: z.boolean(),
  checks: z.array(RepairValidationCheckV1Schema),
  status: z.enum(['VALIDATED', 'FAILED', 'INFRASTRUCTURE_ERROR']),
  reasonCodes: z.array(z.string().min(1)).min(1),
  mutationOutsideIsolatedWorktreeObserved: z.literal(false),
  operatorAuthorizationGranted: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: z.string().min(1),
}).strict();
export type RepairProposalValidationReceiptV1 = z.infer<typeof RepairProposalValidationReceiptV1Schema>;

export type RepairValidationCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type RepairProposalValidationExecutor = {
  createDetachedWorktree(input: {
    sourceRevision: string;
    requestId: string;
  }): Promise<{ worktreeId: string }>;
  run(input: {
    worktreeId: string;
    command: string;
    args: readonly string[];
    stdin?: string;
  }): Promise<RepairValidationCommandResult>;
  removeWorktree(input: { worktreeId: string }): Promise<void>;
};

export const RepairProposalValidationInputV1Schema = z.object({
  schema: z.literal('atlas.repair-proposal-validation-input.v1'),
  proposal: RepairMutationProposalV1Schema,
  patch: z.string().min(1),
  targetedCommands: z.array(z.object({
    command: z.string().min(1),
    args: z.array(z.string()),
  }).strict()).max(32),
  validatorRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type RepairProposalValidationInputV1 = z.infer<typeof RepairProposalValidationInputV1Schema>;

function sha256Text(text: string): string {
  return stableReceiptSha256({ text });
}

function checkRecord(
  ordinal: number,
  kind: RepairValidationCheckKind,
  command: string,
  args: readonly string[],
  result: RepairValidationCommandResult,
): RepairValidationCheckV1 {
  return RepairValidationCheckV1Schema.parse({
    ordinal,
    kind,
    command,
    args: [...args],
    exitCode: result.exitCode,
    passed: result.exitCode === 0,
    stdoutSha256: sha256Text(result.stdout),
    stderrSha256: sha256Text(result.stderr),
    durationMs: Math.max(0, Math.round(result.durationMs)),
  });
}

function finalizeReceipt(
  value: Omit<RepairProposalValidationReceiptV1, 'receiptSha256'>,
): RepairProposalValidationReceiptV1 {
  return RepairProposalValidationReceiptV1Schema.parse({
    ...value,
    receiptSha256: stableReceiptSha256(value),
  });
}

export async function validateRepairProposalInIsolation(
  rawInput: RepairProposalValidationInputV1,
  executor: RepairProposalValidationExecutor,
): Promise<RepairProposalValidationReceiptV1> {
  const input = RepairProposalValidationInputV1Schema.parse(rawInput);
  const proposal = input.proposal;
  const proposalSha256 = stableReceiptSha256(proposal);
  const expectedPatchSha256 = await import('node:crypto').then(({ createHash }) =>
    createHash('sha256').update(input.patch).digest('hex'),
  );
  if (expectedPatchSha256 !== proposal.patchSha256) {
    throw new Error('REPAIR_VALIDATION_PATCH_SHA256_MISMATCH');
  }

  let worktreeId: string | null = null;
  let worktreeCreated = false;
  let worktreeRemoved = false;
  let patchCheckPassed = false;
  let patchAppliedInIsolatedWorktree = false;
  let gitDiffCheckPassed = false;
  const checks: RepairValidationCheckV1[] = [];
  const reasonCodes: string[] = [];
  let infrastructureError = false;

  try {
    const created = await executor.createDetachedWorktree({
      sourceRevision: proposal.sourceRevision,
      requestId: proposal.requestId,
    });
    worktreeId = created.worktreeId;
    worktreeCreated = true;

    const applyCheck = await executor.run({
      worktreeId,
      command: 'git',
      args: ['apply', '--check', '-'],
      stdin: input.patch,
    });
    checks.push(checkRecord(checks.length, 'GIT_APPLY_CHECK', 'git', ['apply', '--check', '-'], applyCheck));
    patchCheckPassed = applyCheck.exitCode === 0;
    if (!patchCheckPassed) reasonCodes.push('GIT_APPLY_CHECK_FAILED');

    if (patchCheckPassed) {
      const applyResult = await executor.run({
        worktreeId,
        command: 'git',
        args: ['apply', '-'],
        stdin: input.patch,
      });
      patchAppliedInIsolatedWorktree = applyResult.exitCode === 0;
      if (!patchAppliedInIsolatedWorktree) reasonCodes.push('ISOLATED_PATCH_APPLY_FAILED');

      if (patchAppliedInIsolatedWorktree) {
        const diffCheck = await executor.run({
          worktreeId,
          command: 'git',
          args: ['diff', '--check'],
        });
        checks.push(checkRecord(checks.length, 'GIT_DIFF_CHECK', 'git', ['diff', '--check'], diffCheck));
        gitDiffCheckPassed = diffCheck.exitCode === 0;
        if (!gitDiffCheckPassed) reasonCodes.push('GIT_DIFF_CHECK_FAILED');

        for (const target of input.targetedCommands) {
          const result = await executor.run({
            worktreeId,
            command: target.command,
            args: target.args,
          });
          checks.push(checkRecord(checks.length, 'TARGETED_COMMAND', target.command, target.args, result));
          if (result.exitCode !== 0) reasonCodes.push(`TARGETED_CHECK_FAILED:${target.command}`);
        }
      }
    }
  } catch (error) {
    infrastructureError = true;
    reasonCodes.push(`VALIDATOR_INFRASTRUCTURE_ERROR:${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (worktreeId) {
      try {
        await executor.removeWorktree({ worktreeId });
        worktreeRemoved = true;
      } catch (error) {
        infrastructureError = true;
        reasonCodes.push(`WORKTREE_REMOVE_FAILED:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const targeted = checks.filter((check) => check.kind === 'TARGETED_COMMAND');
  const targetedPassed = targeted.filter((check) => check.passed).length;
  const validated = !infrastructureError
    && worktreeCreated
    && worktreeRemoved
    && patchCheckPassed
    && patchAppliedInIsolatedWorktree
    && gitDiffCheckPassed
    && targetedPassed === targeted.length;
  const status = infrastructureError ? 'INFRASTRUCTURE_ERROR' : validated ? 'VALIDATED' : 'FAILED';
  if (validated) reasonCodes.push('PATCH_VALIDATED_IN_DETACHED_WORKTREE');
  else if (!reasonCodes.length) reasonCodes.push('PATCH_VALIDATION_FAILED');

  return finalizeReceipt({
    schema: 'atlas.repair-proposal-validation-receipt.v1',
    requestId: proposal.requestId,
    proposalSha256,
    sourceRevision: proposal.sourceRevision,
    workspaceRevision: proposal.workspaceRevision,
    graphRevision: proposal.graphRevision,
    validatorRevision: input.validatorRevision,
    isolationMode: 'DETACHED_GIT_WORKTREE',
    worktreeCreated,
    patchCheckPassed,
    patchAppliedInIsolatedWorktree,
    targetedChecksExecuted: targeted.length,
    targetedChecksPassed: targetedPassed,
    gitDiffCheckPassed,
    worktreeRemoved,
    checks,
    status,
    reasonCodes,
    mutationOutsideIsolatedWorktreeObserved: false,
    operatorAuthorizationGranted: false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
