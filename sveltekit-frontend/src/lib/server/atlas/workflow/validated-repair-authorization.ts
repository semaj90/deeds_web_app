import { z } from 'zod';
import { stableReceiptSha256 } from '../ranking/measured-matrix-diagnostics.js';
import {
  AuthorizedRepairWorkflowBundleV1Schema,
  OperatorRepairAuthorizationV1Schema,
  RepairMutationProposalV1Schema,
  compileAuthorizedRepairWorkflow,
  type AuthorizedRepairWorkflowBundleV1,
  type OperatorRepairAuthorizationV1,
  type RepairMutationProposalV1,
} from './repair-mutation-proposal.js';
import {
  RepairProposalValidationReceiptV1Schema,
  type RepairProposalValidationReceiptV1,
} from './repair-proposal-validator.js';

/**
 * Strict authorization bridge for the new repair path.
 *
 * The legacy compileAuthorizedRepairWorkflow function predates executable
 * validator receipts. New callers must use this function: it verifies that the
 * operator approval names the exact VALIDATED receipt before delegating to the
 * structural DAG compiler.
 */

export const ValidatedOperatorRepairAuthorizationV1Schema = OperatorRepairAuthorizationV1Schema.extend({
  validationReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  validationStatus: z.literal('VALIDATED'),
}).strict();
export type ValidatedOperatorRepairAuthorizationV1 = z.infer<typeof ValidatedOperatorRepairAuthorizationV1Schema>;

export const ValidatedAuthorizedRepairWorkflowBundleV1Schema = z.object({
  schema: z.literal('atlas.validated-authorized-repair-workflow-bundle.v1'),
  proposalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  validationReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  authorizationId: z.string().min(1),
  authorizationRevision: z.number().int().positive(),
  structuralBundle: AuthorizedRepairWorkflowBundleV1Schema,
  validationStatus: z.literal('VALIDATED'),
  validationReceiptRequired: z.literal(true),
  operatorAuthorized: z.literal(true),
  canonicalWritesAllowed: z.literal(true),
}).strict();
export type ValidatedAuthorizedRepairWorkflowBundleV1 = z.infer<typeof ValidatedAuthorizedRepairWorkflowBundleV1Schema>;

export function compileValidatedAuthorizedRepairWorkflow(input: {
  proposal: RepairMutationProposalV1;
  validationReceipt: RepairProposalValidationReceiptV1;
  authorization: ValidatedOperatorRepairAuthorizationV1;
  producerRevision: string;
}): ValidatedAuthorizedRepairWorkflowBundleV1 {
  const proposal = RepairMutationProposalV1Schema.parse(input.proposal);
  const validation = RepairProposalValidationReceiptV1Schema.parse(input.validationReceipt);
  const authorization = ValidatedOperatorRepairAuthorizationV1Schema.parse(input.authorization);
  const proposalSha256 = stableReceiptSha256(proposal);
  const validationReceiptSha256 = validation.receiptSha256;

  if (validation.status !== 'VALIDATED') {
    throw new Error('REPAIR_VALIDATION_RECEIPT_NOT_VALIDATED');
  }
  if (!validation.worktreeCreated || !validation.worktreeRemoved) {
    throw new Error('REPAIR_VALIDATION_ISOLATION_NOT_CLOSED');
  }
  if (!validation.patchCheckPassed || !validation.patchAppliedInIsolatedWorktree || !validation.gitDiffCheckPassed) {
    throw new Error('REPAIR_VALIDATION_PATCH_PROOF_INCOMPLETE');
  }
  if (validation.targetedChecksPassed !== validation.targetedChecksExecuted) {
    throw new Error('REPAIR_VALIDATION_TARGETED_CHECKS_NOT_ALL_PASSING');
  }
  if (validation.proposalSha256 !== proposalSha256) {
    throw new Error('REPAIR_VALIDATION_PROPOSAL_SHA256_MISMATCH');
  }
  if (validation.requestId !== proposal.requestId) {
    throw new Error('REPAIR_VALIDATION_REQUEST_ID_MISMATCH');
  }
  if (validation.sourceRevision !== proposal.sourceRevision) {
    throw new Error('REPAIR_VALIDATION_SOURCE_REVISION_MISMATCH');
  }
  if (validation.workspaceRevision !== proposal.workspaceRevision || validation.graphRevision !== proposal.graphRevision) {
    throw new Error('REPAIR_VALIDATION_CONTEXT_REVISION_MISMATCH');
  }
  if (validation.operatorAuthorizationGranted || validation.canonicalWritesAllowed) {
    throw new Error('REPAIR_VALIDATION_RECEIPT_MAY_NOT_SELF_AUTHORIZE');
  }
  if (authorization.validationReceiptSha256 !== validationReceiptSha256) {
    throw new Error('REPAIR_OPERATOR_AUTHORIZATION_VALIDATION_RECEIPT_MISMATCH');
  }
  if (authorization.validationStatus !== 'VALIDATED') {
    throw new Error('REPAIR_OPERATOR_AUTHORIZATION_VALIDATION_STATUS_MISMATCH');
  }

  // Strip the new receipt fields only after validating them, then use the
  // existing structural compiler. This keeps the old DAG contract reusable
  // while the new authorization boundary is strictly stronger.
  const structuralAuthorization: OperatorRepairAuthorizationV1 = OperatorRepairAuthorizationV1Schema.parse({
    schema: authorization.schema,
    authorizationId: authorization.authorizationId,
    authorizationRevision: authorization.authorizationRevision,
    proposalSha256: authorization.proposalSha256,
    sourceRevision: authorization.sourceRevision,
    approved: authorization.approved,
    operatorId: authorization.operatorId,
    allowedToolName: authorization.allowedToolName,
    validationRequired: authorization.validationRequired,
    producerRevision: authorization.producerRevision,
  });

  const structuralBundle: AuthorizedRepairWorkflowBundleV1 = compileAuthorizedRepairWorkflow({
    proposal,
    authorization: structuralAuthorization,
    producerRevision: input.producerRevision,
  });

  return ValidatedAuthorizedRepairWorkflowBundleV1Schema.parse({
    schema: 'atlas.validated-authorized-repair-workflow-bundle.v1',
    proposalSha256,
    validationReceiptSha256,
    authorizationId: authorization.authorizationId,
    authorizationRevision: authorization.authorizationRevision,
    structuralBundle,
    validationStatus: 'VALIDATED',
    validationReceiptRequired: true,
    operatorAuthorized: true,
    canonicalWritesAllowed: true,
  });
}
