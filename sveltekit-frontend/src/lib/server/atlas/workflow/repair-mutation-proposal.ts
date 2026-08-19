import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  RepairContextManifestV2Schema,
  type RepairContextManifestV2,
} from '../ranking/semantic-promotion-feedback.js';
import {
  MeasuredMatrixDiagnosticsReceiptV1Schema,
  MeasuredTangPolicyReceiptV1Schema,
  stableReceiptSha256,
  type MeasuredMatrixDiagnosticsReceiptV1,
  type MeasuredTangPolicyReceiptV1,
} from '../ranking/measured-matrix-diagnostics.js';
import {
  ContextToolDagV1Schema,
  WorkflowActionEventV1Schema,
  validateContextToolDag,
  workflowActionFromDagNode,
  type ContextToolDagV1,
  type WorkflowActionEventV1,
} from './context-tool-dag-contracts.js';

/**
 * Repair mutation handoff.
 *
 * Evidence, exact semantic promotion, measured matrix diagnostics, Tang policy,
 * and a successful repair-skill dry-run may produce a mutation PROPOSAL. They
 * never authorize a source mutation. Authorization is a separate checksum-bound
 * operator artifact consumed only when constructing an authorized mutation DAG.
 */

export const RepairProposalRevisionProofV1Schema = z.object({
  schema: z.literal('atlas.repair-proposal-revision-proof.v1'),
  requestId: z.string().min(1),
  sourceRevision: z.string().min(1),
  exactPacketKeys: z.array(z.string().min(1)).min(1),
  fullyRevisionAlignedExactEvidence: z.literal(true),
  unresolvedRevisionFields: z.array(z.string().min(1)).length(0),
  receiptRef: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type RepairProposalRevisionProofV1 = z.infer<typeof RepairProposalRevisionProofV1Schema>;

export const RepairMutationProposalV1Schema = z.object({
  schema: z.literal('atlas.repair-mutation-proposal.v1'),
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  mutationIntent: z.literal('PATCH_SOURCE'),
  proposedToolName: z.literal('ops.propose_patch'),
  patchArtifactRef: z.string().min(1),
  patchSha256: z.string().regex(/^[a-f0-9]{64}$/),
  contextManifestV2Sha256: z.string().regex(/^[a-f0-9]{64}$/),
  matrixDiagnosticsReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  tangPolicyReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  revisionProofReceiptRef: z.string().min(1),
  selectedPacketKeys: z.array(z.string().min(1)).min(1),
  exactPromotedPacketKeys: z.array(z.string().min(1)).min(1),
  tangSelectedPacketKeys: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  tangQualified: z.boolean(),
  proposalOnly: z.literal(true),
  operatorAuthorizationRequired: z.literal(true),
  validationRequired: z.literal(true),
  evidenceAuthorizesMutation: z.literal(false),
  sideEffectsAuthorized: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type RepairMutationProposalV1 = z.infer<typeof RepairMutationProposalV1Schema>;

export const OperatorRepairAuthorizationV1Schema = z.object({
  schema: z.literal('atlas.operator-repair-authorization.v1'),
  authorizationId: z.string().min(1),
  authorizationRevision: z.number().int().positive(),
  proposalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRevision: z.string().min(1),
  approved: z.boolean(),
  operatorId: z.string().min(1),
  allowedToolName: z.literal('ops.apply_patch'),
  validationRequired: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();
export type OperatorRepairAuthorizationV1 = z.infer<typeof OperatorRepairAuthorizationV1Schema>;

export const RepairProposalWorkflowBundleV1Schema = z.object({
  schema: z.literal('atlas.repair-proposal-workflow-bundle.v1'),
  proposal: RepairMutationProposalV1Schema,
  proposalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dag: ContextToolDagV1Schema,
  action: WorkflowActionEventV1Schema,
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type RepairProposalWorkflowBundleV1 = z.infer<typeof RepairProposalWorkflowBundleV1Schema>;

export const AuthorizedRepairWorkflowBundleV1Schema = z.object({
  schema: z.literal('atlas.authorized-repair-workflow-bundle.v1'),
  proposalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  authorizationId: z.string().min(1),
  authorizationRevision: z.number().int().positive(),
  dag: ContextToolDagV1Schema,
  action: WorkflowActionEventV1Schema,
  validationRequired: z.literal(true),
  operatorAuthorized: z.literal(true),
  canonicalWritesAllowed: z.literal(true),
}).strict();
export type AuthorizedRepairWorkflowBundleV1 = z.infer<typeof AuthorizedRepairWorkflowBundleV1Schema>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertProposalInputs(input: {
  requestId: string;
  manifest: RepairContextManifestV2;
  diagnostics: MeasuredMatrixDiagnosticsReceiptV1;
  tang: MeasuredTangPolicyReceiptV1;
  revisionProof: RepairProposalRevisionProofV1;
}): void {
  const manifest = RepairContextManifestV2Schema.parse(input.manifest);
  const diagnostics = MeasuredMatrixDiagnosticsReceiptV1Schema.parse(input.diagnostics);
  const tang = MeasuredTangPolicyReceiptV1Schema.parse(input.tang);
  const revisionProof = RepairProposalRevisionProofV1Schema.parse(input.revisionProof);

  if (manifest.requestId !== input.requestId
    || diagnostics.requestId !== input.requestId
    || tang.requestId !== input.requestId
    || revisionProof.requestId !== input.requestId) {
    throw new Error('REPAIR_PROPOSAL_REQUEST_ID_MISMATCH');
  }
  if (manifest.parentManifest.readinessGate !== 'READY'
    || manifest.parentManifest.evidenceStatus !== 'READY_FOR_DRY_RUN'
    || !manifest.parentManifest.recommendationAllowed) {
    throw new Error('REPAIR_PROPOSAL_PARENT_EVIDENCE_NOT_READY');
  }
  if (manifest.semanticPromotion.status !== 'APPLIED' || manifest.semanticPromotion.promotedPacketKeys.length === 0) {
    throw new Error('REPAIR_PROPOSAL_EXACT_SEMANTIC_PROMOTION_REQUIRED');
  }
  if (!manifest.tokenBudget.exactEvidenceFloorSatisfied || manifest.parentManifest.exactEvidencePacketKeys.length === 0) {
    throw new Error('REPAIR_PROPOSAL_SOURCE_EXACT_EVIDENCE_REQUIRED');
  }
  if (manifest.invariants.evidenceAuthorizesMutation
    || manifest.invariants.sideEffectsAuthorized
    || manifest.invariants.canonicalWritesAllowed) {
    throw new Error('REPAIR_PROPOSAL_CONTEXT_ALREADY_AUTHORIZES_SIDE_EFFECTS');
  }
  if (diagnostics.matrixSha256 !== manifest.featureMatrix.sha256) {
    throw new Error('REPAIR_PROPOSAL_DIAGNOSTICS_MATRIX_MISMATCH');
  }
  if (tang.matrixSha256 !== manifest.featureMatrix.sha256) {
    throw new Error('REPAIR_PROPOSAL_TANG_MATRIX_MISMATCH');
  }
  if (tang.diagnosticsReceiptSha256 !== stableReceiptSha256(diagnostics)) {
    throw new Error('REPAIR_PROPOSAL_TANG_DIAGNOSTICS_RECEIPT_MISMATCH');
  }
  const exactSet = new Set(revisionProof.exactPacketKeys);
  if (!manifest.parentManifest.exactEvidencePacketKeys.some((packetKey) => exactSet.has(packetKey))) {
    throw new Error('REPAIR_PROPOSAL_REVISION_PROOF_DOES_NOT_COVER_EXACT_EVIDENCE');
  }
}

export function compileRepairMutationProposal(input: {
  requestId: string;
  workflowId: string;
  workflowRevision: number;
  sourceRef: string;
  sourceRevision: string;
  patchArtifactRef: string;
  patch: string;
  manifest: RepairContextManifestV2;
  diagnostics: MeasuredMatrixDiagnosticsReceiptV1;
  tang: MeasuredTangPolicyReceiptV1;
  revisionProof: RepairProposalRevisionProofV1;
  evidenceRefs?: readonly string[];
  producerRevision: string;
}): RepairMutationProposalV1 {
  assertProposalInputs(input);
  const manifest = RepairContextManifestV2Schema.parse(input.manifest);
  const diagnostics = MeasuredMatrixDiagnosticsReceiptV1Schema.parse(input.diagnostics);
  const tang = MeasuredTangPolicyReceiptV1Schema.parse(input.tang);
  const revisionProof = RepairProposalRevisionProofV1Schema.parse(input.revisionProof);

  if (revisionProof.sourceRevision !== input.sourceRevision) {
    throw new Error('REPAIR_PROPOSAL_SOURCE_REVISION_MISMATCH');
  }
  if (!input.patch.length) throw new Error('REPAIR_PROPOSAL_EMPTY_PATCH');

  return RepairMutationProposalV1Schema.parse({
    schema: 'atlas.repair-mutation-proposal.v1',
    requestId: input.requestId,
    workflowId: input.workflowId,
    workflowRevision: input.workflowRevision,
    workspaceRevision: manifest.parentManifest.workspaceRevision,
    graphRevision: manifest.parentManifest.graphRevision,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    mutationIntent: 'PATCH_SOURCE',
    proposedToolName: 'ops.propose_patch',
    patchArtifactRef: input.patchArtifactRef,
    patchSha256: sha256(input.patch),
    contextManifestV2Sha256: stableReceiptSha256(manifest),
    matrixDiagnosticsReceiptSha256: stableReceiptSha256(diagnostics),
    tangPolicyReceiptSha256: stableReceiptSha256(tang),
    revisionProofReceiptRef: revisionProof.receiptRef,
    selectedPacketKeys: uniqueSorted(manifest.selectedPacketKeys),
    exactPromotedPacketKeys: uniqueSorted(manifest.semanticPromotion.promotedPacketKeys),
    tangSelectedPacketKeys: uniqueSorted(tang.recommendation.selectedPacketKeys),
    evidenceRefs: uniqueSorted([
      ...(input.evidenceRefs ?? []),
      revisionProof.receiptRef,
      `context-manifest-v2:sha256:${stableReceiptSha256(manifest)}`,
      `matrix-diagnostics:sha256:${stableReceiptSha256(diagnostics)}`,
      `tang-policy:sha256:${stableReceiptSha256(tang)}`,
    ]),
    tangQualified: tang.qualified,
    proposalOnly: true,
    operatorAuthorizationRequired: true,
    validationRequired: true,
    evidenceAuthorizesMutation: false,
    sideEffectsAuthorized: false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}

export function compileRepairProposalWorkflow(
  proposalValue: RepairMutationProposalV1,
  producerRevision: string,
): RepairProposalWorkflowBundleV1 {
  const proposal = RepairMutationProposalV1Schema.parse(proposalValue);
  const proposalSha256 = stableReceiptSha256(proposal);
  const canonicalIds = uniqueSorted(proposal.selectedPacketKeys);
  const dag: ContextToolDagV1 = validateContextToolDag(ContextToolDagV1Schema.parse({
    schema: 'atlas.context-tool-dag.v1',
    workflowId: proposal.workflowId,
    workflowRevision: proposal.workflowRevision,
    requestId: proposal.requestId,
    workspaceRevision: proposal.workspaceRevision,
    graphRevision: proposal.graphRevision,
    canonicalWritesAllowed: false,
    producerRevision,
    nodes: [
      {
        nodeId: 'exact-promoted-context',
        kind: 'EXACT_PROMOTION',
        dependsOn: [],
        canonicalIds,
        toolName: null,
        readOnly: true,
        requiresExactPromotion: false,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'validate-repair-proposal',
        kind: 'VALIDATE',
        dependsOn: ['exact-promoted-context'],
        canonicalIds,
        toolName: null,
        readOnly: true,
        requiresExactPromotion: true,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'propose-patch',
        kind: 'MCP_TOOL_CALL',
        dependsOn: ['validate-repair-proposal'],
        canonicalIds,
        toolName: 'ops.propose_patch',
        readOnly: true,
        requiresExactPromotion: true,
        requiresValidation: true,
        maxAttempts: 1,
      },
    ],
  }));

  const action = workflowActionFromDagNode({
    dag,
    nodeId: 'propose-patch',
    sequence: 0,
    actionId: `proposal:${proposalSha256.slice(0, 16)}`,
    kind: 'scheduled',
    lane: 'tool',
    transport: 'mcp',
    evidenceRefs: [...proposal.evidenceRefs, `repair-proposal:sha256:${proposalSha256}`],
    producerRevision,
  });

  return RepairProposalWorkflowBundleV1Schema.parse({
    schema: 'atlas.repair-proposal-workflow-bundle.v1',
    proposal,
    proposalSha256,
    dag,
    action,
    canonicalWritesAllowed: false,
  });
}

export function compileAuthorizedRepairWorkflow(input: {
  proposal: RepairMutationProposalV1;
  authorization: OperatorRepairAuthorizationV1;
  producerRevision: string;
}): AuthorizedRepairWorkflowBundleV1 {
  const proposal = RepairMutationProposalV1Schema.parse(input.proposal);
  const authorization = OperatorRepairAuthorizationV1Schema.parse(input.authorization);
  const proposalSha256 = stableReceiptSha256(proposal);

  if (!authorization.approved) throw new Error('REPAIR_OPERATOR_AUTHORIZATION_NOT_APPROVED');
  if (authorization.proposalSha256 !== proposalSha256) throw new Error('REPAIR_OPERATOR_AUTHORIZATION_PROPOSAL_MISMATCH');
  if (authorization.sourceRevision !== proposal.sourceRevision) throw new Error('REPAIR_OPERATOR_AUTHORIZATION_SOURCE_REVISION_MISMATCH');
  if (!proposal.operatorAuthorizationRequired || !proposal.validationRequired) {
    throw new Error('REPAIR_PROPOSAL_AUTHORIZATION_INVARIANT_MISSING');
  }

  const canonicalIds = uniqueSorted(proposal.selectedPacketKeys);
  const dag: ContextToolDagV1 = validateContextToolDag(ContextToolDagV1Schema.parse({
    schema: 'atlas.context-tool-dag.v1',
    workflowId: proposal.workflowId,
    workflowRevision: proposal.workflowRevision + authorization.authorizationRevision,
    requestId: proposal.requestId,
    workspaceRevision: proposal.workspaceRevision,
    graphRevision: proposal.graphRevision,
    canonicalWritesAllowed: true,
    producerRevision: input.producerRevision,
    nodes: [
      {
        nodeId: 'exact-promoted-context',
        kind: 'EXACT_PROMOTION',
        dependsOn: [],
        canonicalIds,
        toolName: null,
        readOnly: true,
        requiresExactPromotion: false,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'validate-authorized-repair',
        kind: 'VALIDATE',
        dependsOn: ['exact-promoted-context'],
        canonicalIds,
        toolName: null,
        readOnly: true,
        requiresExactPromotion: true,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'apply-patch',
        kind: 'MCP_TOOL_CALL',
        dependsOn: ['validate-authorized-repair'],
        canonicalIds,
        toolName: authorization.allowedToolName,
        readOnly: false,
        requiresExactPromotion: true,
        requiresValidation: true,
        maxAttempts: 1,
      },
    ],
  }));

  const action: WorkflowActionEventV1 = workflowActionFromDagNode({
    dag,
    nodeId: 'apply-patch',
    sequence: 0,
    actionId: `authorized:${authorization.authorizationId}`,
    kind: 'scheduled',
    lane: 'tool',
    transport: 'mcp',
    evidenceRefs: [
      ...proposal.evidenceRefs,
      `repair-proposal:sha256:${proposalSha256}`,
      `operator-authorization:${authorization.authorizationId}:r${authorization.authorizationRevision}`,
    ],
    producerRevision: input.producerRevision,
  });

  if (!action.mutationRequested || !action.validationRequired) {
    throw new Error('REPAIR_AUTHORIZED_ACTION_MUTATION_FLAGS_INVALID');
  }

  return AuthorizedRepairWorkflowBundleV1Schema.parse({
    schema: 'atlas.authorized-repair-workflow-bundle.v1',
    proposalSha256,
    authorizationId: authorization.authorizationId,
    authorizationRevision: authorization.authorizationRevision,
    dag,
    action,
    validationRequired: true,
    operatorAuthorized: true,
    canonicalWritesAllowed: true,
  });
}
