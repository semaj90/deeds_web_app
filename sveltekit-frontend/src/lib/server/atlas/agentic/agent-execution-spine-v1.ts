import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { currentAceContextManifestAdmissionV1Schema } from '../context/ace-context-manifest-admission-v1.js';
import { ContextManifestV2Schema } from '../graph/context-manifest-v2.js';
import {
  AGENTIC_ACTION_REGISTRY_V1_SEED,
  findAgenticActionV1,
} from './agentic-action-registry-v1.js';
import { AgenticActionMutabilityV1Schema } from './contracts/agentic-action-v1.js';
import { ErrorFixNeighborhoodSchema, type ErrorFixNeighborhood } from './error-neighborhood-resolver-v1.js';
import { z } from 'zod';

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();

export const PrimeAgentRuntimeV1Schema = z.object({
  schema: z.literal('atlas.prime-agent-runtime.v1'),
  requestId: z.string().min(1),
  executionId: z.string().min(1),
  contextManifestChecksum: sha256,
  policyRevision: z.string().min(1),
  capabilityRegistryRevision: z.string().min(1),
  toolRegistryRevision: z.string().min(1),
  maxSteps: positiveInteger,
  maxToolCalls: positiveInteger,
  maxTokens: positiveInteger,
  state: z.enum(['PLAN', 'EXECUTE', 'OBSERVE', 'VALIDATE', 'COMPLETE', 'FAILED']),
  canonicalAuthority: z.literal(false),
}).strict();
export type PrimeAgentRuntimeV1 = z.infer<typeof PrimeAgentRuntimeV1Schema>;

const actionIdList = z.array(z.string().min(1)).max(128).superRefine((values, ctx) => {
  if (new Set(values).size !== values.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ACTION_IDS_MUST_BE_UNIQUE' });
});

const AgentPlanAcceptanceReceiptV1BodySchema = z.object({
  schema: z.literal('atlas.agent-plan-acceptance-receipt.v1'),
  requestId: z.string().min(1),
  executionId: z.string().min(1),
  planRevision: z.string().min(1),
  planChecksum: sha256,
  fromState: z.literal('PLAN'),
  toState: z.literal('PLAN_VALIDATED'),
  consumedActionIds: actionIdList,
  planningActionIds: actionIdList,
  allowedNextActionIds: actionIdList,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export const AgentPlanAcceptanceReceiptV1Schema = AgentPlanAcceptanceReceiptV1BodySchema.extend({ receiptChecksum: sha256 }).strict().superRefine((receipt, ctx) => {
  if (receipt.consumedActionIds.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['consumedActionIds'], message: 'PLAN_ACCEPTANCE_REQUIRES_CONSUMED_ACTION' });
  const planningIds = new Set(receipt.planningActionIds);
  if (receipt.allowedNextActionIds.some((actionId) => planningIds.has(actionId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedNextActionIds'], message: 'PLANNING_ACTION_CANNOT_FOLLOW_ACCEPTANCE' });
  }
  const { receiptChecksum, ...body } = receipt;
  if (receiptChecksum !== checksum(body)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receiptChecksum'], message: 'PLAN_ACCEPTANCE_RECEIPT_CHECKSUM_MISMATCH' });
});
export type AgentPlanAcceptanceReceiptV1 = z.infer<typeof AgentPlanAcceptanceReceiptV1Schema>;

export function acceptAgentPlanV1(input: Omit<AgentPlanAcceptanceReceiptV1, 'schema' | 'fromState' | 'toState' | 'canonicalAuthority' | 'writesPerformed' | 'receiptChecksum'>): AgentPlanAcceptanceReceiptV1 {
  const body = AgentPlanAcceptanceReceiptV1BodySchema.parse({
    schema: 'atlas.agent-plan-acceptance-receipt.v1',
    ...input,
    fromState: 'PLAN',
    toState: 'PLAN_VALIDATED',
    canonicalAuthority: false,
    writesPerformed: false,
  });
  return AgentPlanAcceptanceReceiptV1Schema.parse({ ...body, receiptChecksum: checksum(body) });
}

export function assertAgentActionAllowedAfterPlanAcceptanceV1(input: {
  receipt: AgentPlanAcceptanceReceiptV1;
  requestId: string;
  executionId: string;
  planRevision: string;
  planChecksum: string;
  actionId: string;
}): void {
  const receipt = AgentPlanAcceptanceReceiptV1Schema.parse(input.receipt);
  if (receipt.requestId !== input.requestId || receipt.executionId !== input.executionId) throw new Error('PLAN_ACCEPTANCE_RUN_BINDING_MISMATCH');
  if (receipt.planRevision !== input.planRevision || receipt.planChecksum !== input.planChecksum) throw new Error('PLAN_ACCEPTANCE_REVISION_MISMATCH');
  if (receipt.consumedActionIds.includes(input.actionId) || receipt.planningActionIds.includes(input.actionId)) throw new Error('PLAN_ACTION_ALREADY_CONSUMED');
  if (!receipt.allowedNextActionIds.includes(input.actionId)) throw new Error('ACTION_NOT_ALLOWED_AFTER_PLAN_ACCEPTANCE');
}

export const AgentActionProposalV1Schema = z.object({
  schema: z.literal('atlas.agent-action-proposal.v1'),
  proposalId: z.string().min(1),
  executionId: z.string().min(1),
  stepOrdinal: nonNegativeInteger,
  capabilityId: z.string().min(1),
  capabilityRevision: z.string().min(1),
  capabilityOrdinal: nonNegativeInteger.optional(),
  capabilityRegistryRevision: z.string().min(1).optional(),
  arguments: z.record(z.string(), z.unknown()),
  evidenceRefs: z.array(z.string().min(1)).max(32),
  expectedOutputSchemaRef: z.string().min(1),
  mutationClass: z.union([AgenticActionMutabilityV1Schema, z.literal('STORE_WRITE')]),
  proposerModelRevision: z.string().min(1),
  contextManifestChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict().superRefine((proposal, ctx) => {
  if (proposal.capabilityOrdinal !== undefined && proposal.capabilityRegistryRevision === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilityRegistryRevision'], message: 'BARE_CAPABILITY_ORDINAL_FORBIDDEN' });
  }
});
export type AgentActionProposalV1 = z.infer<typeof AgentActionProposalV1Schema>;

export const CapabilityRegistryEntryV1Schema = z.object({
  capabilityId: z.string().min(1),
  capabilityRevision: z.string().min(1),
  name: z.string().min(1),
  inputSchemaRef: z.string().min(1),
  outputSchemaRef: z.string().min(1),
  executorKind: z.literal('LOCAL_READ_ONLY'),
  executorRef: z.string().min(1),
  mutationClass: AgenticActionMutabilityV1Schema,
  requiredEvidenceKinds: z.array(z.string().min(1)),
  timeoutMs: positiveInteger,
  toolId: z.string().min(1),
  toolRevision: z.string().min(1),
}).strict();
export type CapabilityRegistryEntryV1 = z.infer<typeof CapabilityRegistryEntryV1Schema>;

export const CapabilityRegistryV1Schema = z.object({
  schema: z.literal('atlas.capability-registry-projection.v1'),
  registryRevision: z.string().min(1),
  toolRegistryRevision: z.string().min(1),
  entries: z.array(CapabilityRegistryEntryV1Schema).min(1),
  canonicalAuthority: z.literal(false),
}).strict();
export type CapabilityRegistryV1 = z.infer<typeof CapabilityRegistryV1Schema>;

const EXECUTOR_REF = 'fixture.source-neighborhood.v1';
const TOOL_ID = 'atlas.fixture.source-neighborhood';
const TOOL_REVISION = 'atlas.fixture.source-neighborhood:v1';
const CAPABILITY_ID = 'RG_EXACT_SEARCH';
const INPUT_SCHEMA_REF = 'atlas.fixture.source-neighborhood.input.v1';
const OUTPUT_SCHEMA_REF = 'atlas.fixture.source-neighborhood.output.v2';

export function buildCapabilityRegistryV1(): CapabilityRegistryV1 {
  const action = findAgenticActionV1(CAPABILITY_ID);
  if (!action || action.mutability !== 'READ_ONLY' || action.tool !== 'ripgrep') {
    throw new Error('EXISTING_AGENTIC_ACTION_OWNER_MISSING_READ_ONLY_RIPGREP');
  }
  const entries = [CapabilityRegistryEntryV1Schema.parse({
    capabilityId: action.actionId,
    capabilityRevision: action.actionRevision,
    name: 'Read bounded source symbol neighborhood fixture',
    inputSchemaRef: INPUT_SCHEMA_REF,
    outputSchemaRef: OUTPUT_SCHEMA_REF,
    executorKind: 'LOCAL_READ_ONLY',
    executorRef: EXECUTOR_REF,
    mutationClass: action.mutability,
    requiredEvidenceKinds: ['CONTEXT_MANIFEST_EVIDENCE_REF'],
    timeoutMs: 1_000,
    toolId: TOOL_ID,
    toolRevision: TOOL_REVISION,
  })];
  const registryRevision = `sha256:${canonicalSha256V1({ actionRegistryRevision: action.actionRevision, entries })}`;
  const toolRegistryRevision = `sha256:${canonicalSha256V1(entries.map(({ toolId, toolRevision, inputSchemaRef, outputSchemaRef, executorKind }) => ({ toolId, toolRevision, inputSchemaRef, outputSchemaRef, executorKind })))}`;
  return CapabilityRegistryV1Schema.parse({
    schema: 'atlas.capability-registry-projection.v1',
    registryRevision,
    toolRegistryRevision,
    entries,
    canonicalAuthority: false,
  });
}

export const ToolExecutionEnvelopeV1Schema = z.object({
  schema: z.literal('atlas.tool-execution-envelope.v1'),
  executionId: z.string().min(1),
  stepOrdinal: nonNegativeInteger,
  actionProposalChecksum: sha256,
  capabilityId: z.string().min(1),
  capabilityRevision: z.string().min(1),
  capabilityRegistryRevision: z.string().min(1),
  toolId: z.string().min(1),
  toolRevision: z.string().min(1),
  transport: z.enum(['local', 'mcp', 'opencode']),
  inputChecksum: sha256,
  mutationClass: z.literal('READ_ONLY'),
  authorizationReceiptRef: sha256,
  contextManifestChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict();
export type ToolExecutionEnvelopeV1 = z.infer<typeof ToolExecutionEnvelopeV1Schema>;

export const ToolExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.tool-execution-receipt.v1'),
  executionId: z.string().min(1),
  stepOrdinal: nonNegativeInteger,
  capabilityId: z.string().min(1),
  capabilityRevision: z.string().min(1),
  capabilityRegistryRevision: z.string().min(1),
  toolId: z.string().min(1),
  toolRevision: z.string().min(1),
  transport: z.enum(['local', 'mcp', 'opencode']),
  actionProposalChecksum: sha256,
  envelopeChecksum: sha256,
  inputChecksum: sha256,
  outputChecksum: sha256,
  status: z.enum(['SUCCEEDED', 'FAILED']),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  artifactRefs: z.array(z.string().min(1)).max(32),
  evidenceRefs: z.array(z.string().min(1)).max(32),
  errorRef: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
}).strict();
export type ToolExecutionReceiptV1 = z.infer<typeof ToolExecutionReceiptV1Schema>;

export const RlmWorkingStateV1Schema = z.object({
  schema: z.literal('atlas.rlm-working-state.v1'),
  executionId: z.string().min(1),
  stepOrdinal: nonNegativeInteger,
  activeGoalRefs: z.array(z.string().min(1)).max(16),
  activeEvidenceRefs: z.array(z.string().min(1)).max(32),
  priorReceiptRefs: z.array(sha256).max(32),
  pendingActionIds: z.array(z.string().min(1)).max(16),
  tokenBudgetRemaining: nonNegativeInteger,
  toolBudgetRemaining: nonNegativeInteger,
  contextManifestChecksum: sha256,
  canonicalAuthority: z.literal(false),
  persistenceClass: z.literal('EPHEMERAL'),
}).strict();
export type RlmWorkingStateV1 = z.infer<typeof RlmWorkingStateV1Schema>;

export const AgentReplayManifestV1Schema = z.object({
  schema: z.literal('atlas.agent-replay-manifest.v1'),
  workspaceRevision: sha256,
  sourceSnapshotChecksum: sha256,
  contextManifestChecksum: sha256,
  capabilityRegistryRevision: z.string().min(1),
  toolRegistryRevision: z.string().min(1),
  primeAgentRevision: z.string().min(1),
  plannerRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  adapterRevision: z.string().min(1),
  tokenizerRevision: z.string().min(1),
  policyRevision: z.string().min(1),
  expectedSequence: z.array(z.object({
    stepOrdinal: nonNegativeInteger,
    capabilityId: z.string().min(1),
    capabilityRevision: z.string().min(1),
    toolId: z.string().min(1),
    toolRevision: z.string().min(1),
    transport: z.enum(['local', 'mcp', 'opencode']),
  }).strict()).min(1).max(8),
  manifestChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict();
export type AgentReplayManifestV1 = z.infer<typeof AgentReplayManifestV1Schema>;

export const AgentReplayResultV1Schema = z.object({
  schema: z.literal('atlas.agent-replay-result.v1'),
  executionId: z.string().min(1),
  replayManifestChecksum: sha256,
  contextManifestChecksum: sha256,
  finalState: z.literal('COMPLETE'),
  completedSteps: positiveInteger,
  finalObservation: z.object({
    sourceRef: z.string().min(1),
    sourceSymbol: z.string().min(1),
    directCallers: z.array(z.string().min(1)).max(8),
    tests: z.array(z.string().min(1)).max(8),
    neighborhoodChecksum: sha256,
  }).strict(),
  finalObservationChecksum: sha256,
  receipts: z.array(ToolExecutionReceiptV1Schema).max(8),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();
export type AgentReplayResultV1 = z.infer<typeof AgentReplayResultV1Schema>;

export type ReadOnlyExecutionPolicyV1 = {
  policyRevision: string;
  allowedCapabilityIds: readonly string[];
  allowedMutationClasses: readonly ['READ_ONLY'];
  maxToolCalls: number;
};

export function contextManifestChecksumV1(manifest: z.infer<typeof ContextManifestV2Schema>): string {
  const parsed = ContextManifestV2Schema.parse(manifest);
  const expected = canonicalSha256V1({
    schema: 'atlas.context-manifest-v2-identity.v1',
    v1RequestId: parsed.v1.requestId,
    v1SnapshotId: parsed.v1.snapshotId,
    v1CandidateBucket: parsed.v1.candidateBucket,
    ...parsed.identityInput,
  });
  if (parsed.identityChecksum !== expected) throw new Error('CONTEXT_MANIFEST_IDENTITY_CHECKSUM_INVALID');
  return `sha256:${parsed.identityChecksum}`;
}

export function buildAgentReplayManifestV1(
  input: Omit<AgentReplayManifestV1, 'schema' | 'manifestChecksum' | 'canonicalAuthority'>,
): AgentReplayManifestV1 {
  const body = { schema: 'atlas.agent-replay-manifest.v1' as const, ...input, canonicalAuthority: false as const };
  return AgentReplayManifestV1Schema.parse({ ...body, manifestChecksum: `sha256:${canonicalSha256V1(body)}` });
}

export function verifyAgentReplayManifestV1(manifest: AgentReplayManifestV1): boolean {
  const parsed = AgentReplayManifestV1Schema.parse(manifest);
  const { manifestChecksum, ...body } = parsed;
  return manifestChecksum === `sha256:${canonicalSha256V1(body)}`;
}

export function buildAgentActionProposalV1(input: {
  executionId: string;
  stepOrdinal: number;
  capability: CapabilityRegistryEntryV1;
  registry: CapabilityRegistryV1;
  arguments: Record<string, unknown>;
  evidenceRefs: string[];
  proposerModelRevision: string;
  contextManifestChecksum: string;
}): AgentActionProposalV1 {
  const identity = {
    executionId: input.executionId,
    stepOrdinal: input.stepOrdinal,
    capabilityId: input.capability.capabilityId,
    capabilityRevision: input.capability.capabilityRevision,
    capabilityRegistryRevision: input.registry.registryRevision,
    toolId: input.capability.toolId,
    toolRevision: input.capability.toolRevision,
    arguments: input.arguments,
    evidenceRefs: [...input.evidenceRefs].sort(),
    proposerModelRevision: input.proposerModelRevision,
    contextManifestChecksum: input.contextManifestChecksum,
  };
  return AgentActionProposalV1Schema.parse({
    schema: 'atlas.agent-action-proposal.v1',
    proposalId: `proposal:${canonicalSha256V1(identity)}`,
    executionId: input.executionId,
    stepOrdinal: input.stepOrdinal,
    capabilityId: input.capability.capabilityId,
    capabilityRevision: input.capability.capabilityRevision,
    capabilityRegistryRevision: input.registry.registryRevision,
    arguments: input.arguments,
    evidenceRefs: [...input.evidenceRefs].sort(),
    proposerModelRevision: input.proposerModelRevision,
    contextManifestChecksum: input.contextManifestChecksum,
    expectedOutputSchemaRef: input.capability.outputSchemaRef,
    mutationClass: input.capability.mutationClass,
    canonicalAuthority: false,
  });
}

function checksum(value: unknown): string {
  return `sha256:${canonicalSha256V1(value)}`;
}

function sourceSnapshotChecksumV1(sourceRevision: string | null): string | null {
  if (!sourceRevision) return null;
  if (/^sha256:[a-f0-9]{64}$/.test(sourceRevision)) return sourceRevision;
  if (/^[a-f0-9]{64}$/.test(sourceRevision)) return `sha256:${sourceRevision}`;
  return null;
}

export function authorizeAndBuildToolEnvelopeV1(input: {
  runtime: PrimeAgentRuntimeV1;
  proposal: AgentActionProposalV1;
  registry: CapabilityRegistryV1;
  policy: ReadOnlyExecutionPolicyV1;
  contextAdmission: unknown;
}): ToolExecutionEnvelopeV1 {
  const runtime = PrimeAgentRuntimeV1Schema.parse(input.runtime);
  const proposal = AgentActionProposalV1Schema.parse(input.proposal);
  const registry = CapabilityRegistryV1Schema.parse(input.registry);
  const admission = currentAceContextManifestAdmissionV1Schema.parse(input.contextAdmission);
  if (admission.status !== 'ADMITTED' || admission.manifest === null) throw new Error('CONTEXT_MANIFEST_NOT_ADMITTED');
  if (proposal.executionId !== runtime.executionId) throw new Error('PROPOSAL_EXECUTION_ID_MISMATCH');
  if (runtime.requestId !== admission.manifest.v1.requestId) throw new Error('RUNTIME_CONTEXT_REQUEST_ID_MISMATCH');
  if (proposal.contextManifestChecksum !== runtime.contextManifestChecksum) throw new Error('PROPOSAL_CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
  if (runtime.contextManifestChecksum !== contextManifestChecksumV1(admission.manifest)) throw new Error('RUNTIME_CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
  if (runtime.capabilityRegistryRevision !== registry.registryRevision || proposal.capabilityRegistryRevision !== registry.registryRevision) throw new Error('CAPABILITY_REGISTRY_REVISION_MISMATCH');
  if (runtime.toolRegistryRevision !== registry.toolRegistryRevision) throw new Error('TOOL_REGISTRY_REVISION_MISMATCH');
  if (runtime.policyRevision !== input.policy.policyRevision) throw new Error('POLICY_REVISION_MISMATCH');
  if (!input.policy.allowedMutationClasses.includes('READ_ONLY') || proposal.mutationClass !== 'READ_ONLY') throw new Error('MUTATION_CLASS_NOT_AUTHORIZED');
  if (!input.policy.allowedCapabilityIds.includes(proposal.capabilityId)) throw new Error('CAPABILITY_NOT_AUTHORIZED_BY_POLICY');
  if (input.policy.maxToolCalls < 1 || input.policy.maxToolCalls > runtime.maxToolCalls) throw new Error('TOOL_BUDGET_POLICY_MISMATCH');
  if (!admission.manifest.v1.evidenceRefs.length || proposal.evidenceRefs.length === 0) throw new Error('CONTEXT_EVIDENCE_REQUIRED');
  const admittedEvidence = new Set(admission.manifest.v1.evidenceRefs);
  if (proposal.evidenceRefs.some((ref) => !admittedEvidence.has(ref))) throw new Error('PROPOSAL_EVIDENCE_OUTSIDE_CONTEXT_MANIFEST');
  const entry = registry.entries.find((candidate) => candidate.capabilityId === proposal.capabilityId);
  if (!entry) throw new Error('UNKNOWN_CAPABILITY');
  if (entry.capabilityRevision !== proposal.capabilityRevision) throw new Error('STALE_CAPABILITY_REVISION');
  if (entry.mutationClass !== 'READ_ONLY' || entry.executorKind !== 'LOCAL_READ_ONLY') throw new Error('NON_READ_ONLY_EXECUTOR_FORBIDDEN');
  if (entry.outputSchemaRef !== proposal.expectedOutputSchemaRef) throw new Error('EXPECTED_OUTPUT_SCHEMA_MISMATCH');
  if (proposal.capabilityOrdinal !== undefined) {
    if (proposal.capabilityRegistryRevision !== registry.registryRevision) throw new Error('ORDINAL_REGISTRY_REVISION_MISMATCH');
    const ordinalEntry = registry.entries[proposal.capabilityOrdinal];
    if (!ordinalEntry || ordinalEntry.capabilityId !== proposal.capabilityId) throw new Error('CAPABILITY_ORDINAL_IDENTITY_MISMATCH');
  }
  const action = findAgenticActionV1(proposal.capabilityId);
  if (!action || action.actionRevision !== proposal.capabilityRevision || action.mutability !== 'READ_ONLY') throw new Error('EXISTING_ACTION_OWNER_REVISION_OR_POLICY_MISMATCH');
  const proposalChecksum = checksum(proposal);
  const authorizationReceiptRef = checksum({
    schema: 'atlas.read-only-authorization-receipt.v1',
    executionId: runtime.executionId,
    stepOrdinal: proposal.stepOrdinal,
    proposalChecksum,
    capabilityRegistryRevision: registry.registryRevision,
    toolRegistryRevision: registry.toolRegistryRevision,
    policyRevision: input.policy.policyRevision,
    contextManifestChecksum: runtime.contextManifestChecksum,
    mutationClass: 'READ_ONLY',
  });
  return ToolExecutionEnvelopeV1Schema.parse({
    schema: 'atlas.tool-execution-envelope.v1',
    executionId: runtime.executionId,
    stepOrdinal: proposal.stepOrdinal,
    actionProposalChecksum: proposalChecksum,
    capabilityId: entry.capabilityId,
    capabilityRevision: entry.capabilityRevision,
    capabilityRegistryRevision: registry.registryRevision,
    toolId: entry.toolId,
    toolRevision: entry.toolRevision,
    transport: 'local',
    inputChecksum: checksum(proposal.arguments),
    mutationClass: 'READ_ONLY',
    authorizationReceiptRef,
    contextManifestChecksum: runtime.contextManifestChecksum,
    canonicalAuthority: false,
  });
}

const FixtureInputSchema = z.object({
  sourceRef: z.string().min(1),
  sourceSymbol: z.string().min(1),
}).strict();

const FixtureOutputSchema = z.object({
  sourceRef: z.string().min(1),
  sourceSymbol: z.string().min(1),
  directCallers: z.array(z.string().min(1)).max(8),
  tests: z.array(z.string().min(1)).max(8),
  neighborhoodChecksum: sha256,
}).strict();

export async function executeReadOnlyToolV1(input: {
  runtime: PrimeAgentRuntimeV1;
  envelope: ToolExecutionEnvelopeV1;
  proposal: AgentActionProposalV1;
  registry: CapabilityRegistryV1;
  policy: ReadOnlyExecutionPolicyV1;
  contextAdmission: unknown;
  fixture: { sourceRef: string; sourceSymbol: string; directCallers: readonly string[]; tests: readonly string[]; neighborhood: ErrorFixNeighborhood };
  now: () => string;
}): Promise<{ observation: z.infer<typeof FixtureOutputSchema>; receipt: ToolExecutionReceiptV1 }> {
  const envelope = ToolExecutionEnvelopeV1Schema.parse(input.envelope);
  const proposal = AgentActionProposalV1Schema.parse(input.proposal);
  const registry = CapabilityRegistryV1Schema.parse(input.registry);
  const expectedEnvelope = authorizeAndBuildToolEnvelopeV1({
    runtime: input.runtime,
    proposal,
    registry,
    policy: input.policy,
    contextAdmission: input.contextAdmission,
  });
  if (checksum(envelope) !== checksum(expectedEnvelope)) throw new Error('ENVELOPE_AUTHORIZATION_RECHECK_FAILED');
  const admission = currentAceContextManifestAdmissionV1Schema.parse(input.contextAdmission);
  const entry = registry.entries.find((candidate) => candidate.capabilityId === envelope.capabilityId);
  if (!entry) throw new Error('UNKNOWN_CAPABILITY');
  if (entry.executorRef !== EXECUTOR_REF || entry.toolId !== envelope.toolId || entry.toolRevision !== envelope.toolRevision || entry.inputSchemaRef !== INPUT_SCHEMA_REF || entry.outputSchemaRef !== OUTPUT_SCHEMA_REF) throw new Error('TOOL_REVISION_OR_EXECUTOR_MISMATCH');
  if (envelope.actionProposalChecksum !== checksum(proposal)) throw new Error('AUTHORIZED_PROPOSAL_CHECKSUM_MISMATCH');
  if (envelope.inputChecksum !== checksum(proposal.arguments)) throw new Error('TOOL_INPUT_CHECKSUM_MISMATCH');
  if (envelope.contextManifestChecksum !== contextManifestChecksumV1(admission.manifest!)) throw new Error('TOOL_CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
  if (!admission.manifest!.v1.evidenceRefs.includes(input.fixture.sourceRef)) throw new Error('FIXTURE_SOURCE_NOT_IN_CONTEXT_MANIFEST');
  const args = FixtureInputSchema.parse(proposal.arguments);
  if (args.sourceRef !== input.fixture.sourceRef || args.sourceSymbol !== input.fixture.sourceSymbol) throw new Error('FIXTURE_ARGUMENT_IDENTITY_MISMATCH');
  const neighborhood = ErrorFixNeighborhoodSchema.parse(input.fixture.neighborhood);
  if (input.fixture.directCallers.length !== neighborhood.callerOrdinals.length || input.fixture.tests.length !== neighborhood.testOrdinals.length) {
    throw new Error('FIXTURE_NEIGHBORHOOD_CARDINALITY_MISMATCH');
  }
  const startedAt = input.now();
  const observation = FixtureOutputSchema.parse({
    sourceRef: input.fixture.sourceRef,
    sourceSymbol: input.fixture.sourceSymbol,
    directCallers: input.fixture.directCallers.slice(0, 8),
    tests: input.fixture.tests.slice(0, 8),
    neighborhoodChecksum: neighborhood.neighborhoodChecksum,
  });
  const finishedAt = input.now();
  const receipt = ToolExecutionReceiptV1Schema.parse({
    schema: 'atlas.tool-execution-receipt.v1',
    executionId: envelope.executionId,
    stepOrdinal: envelope.stepOrdinal,
    capabilityId: envelope.capabilityId,
    capabilityRevision: envelope.capabilityRevision,
    capabilityRegistryRevision: envelope.capabilityRegistryRevision,
    toolId: envelope.toolId,
    toolRevision: envelope.toolRevision,
    transport: envelope.transport,
    actionProposalChecksum: envelope.actionProposalChecksum,
    envelopeChecksum: checksum(envelope),
    inputChecksum: checksum(proposal.arguments),
    outputChecksum: checksum(observation),
    status: 'SUCCEEDED',
    startedAt,
    finishedAt,
    artifactRefs: [],
    evidenceRefs: [...proposal.evidenceRefs].sort(),
    errorRef: null,
    canonicalAuthority: false,
  });
  return { observation, receipt };
}

export function validateToolExecutionReceiptV1(input: {
  receipt: ToolExecutionReceiptV1;
  envelope: ToolExecutionEnvelopeV1;
  proposal: AgentActionProposalV1;
  registry: CapabilityRegistryV1;
  expectedOutputChecksum?: string;
}): ToolExecutionReceiptV1 {
  const receipt = ToolExecutionReceiptV1Schema.parse(input.receipt);
  const envelope = ToolExecutionEnvelopeV1Schema.parse(input.envelope);
  const proposal = AgentActionProposalV1Schema.parse(input.proposal);
  const entry = CapabilityRegistryV1Schema.parse(input.registry).entries.find((candidate) => candidate.capabilityId === receipt.capabilityId);
  if (!entry) throw new Error('RECEIPT_CAPABILITY_UNKNOWN');
  if (receipt.executionId !== envelope.executionId || receipt.stepOrdinal !== envelope.stepOrdinal) throw new Error('RECEIPT_EXECUTION_COORDINATE_MISMATCH');
  if (receipt.actionProposalChecksum !== checksum(proposal) || receipt.actionProposalChecksum !== envelope.actionProposalChecksum) throw new Error('RECEIPT_PROPOSAL_BINDING_MISMATCH');
  if (receipt.envelopeChecksum !== checksum(envelope)) throw new Error('RECEIPT_ENVELOPE_BINDING_MISMATCH');
  if (receipt.inputChecksum !== envelope.inputChecksum || receipt.inputChecksum !== checksum(proposal.arguments)) throw new Error('RECEIPT_INPUT_CHECKSUM_MISMATCH');
  if (receipt.capabilityRevision !== envelope.capabilityRevision || receipt.capabilityRevision !== entry.capabilityRevision) throw new Error('RECEIPT_CAPABILITY_REVISION_MISMATCH');
  if (receipt.toolId !== envelope.toolId || receipt.toolRevision !== envelope.toolRevision || receipt.toolRevision !== entry.toolRevision || receipt.transport !== envelope.transport) throw new Error('RECEIPT_TOOL_REVISION_MISMATCH');
  if (receipt.capabilityRegistryRevision !== envelope.capabilityRegistryRevision) throw new Error('RECEIPT_REGISTRY_REVISION_MISMATCH');
  if (receipt.status !== 'SUCCEEDED') throw new Error('RECEIPT_NOT_SUCCESSFUL');
  if (input.expectedOutputChecksum !== undefined && receipt.outputChecksum !== input.expectedOutputChecksum) throw new Error('RECEIPT_OUTPUT_CHECKSUM_MISMATCH');
  return receipt;
}

export function closeAgentReplayV1(input: {
  manifest: AgentReplayManifestV1;
  runtime: PrimeAgentRuntimeV1;
  registry: CapabilityRegistryV1;
  receipts: readonly ToolExecutionReceiptV1[];
  executions: readonly { receipt: ToolExecutionReceiptV1; envelope: ToolExecutionEnvelopeV1; proposal: AgentActionProposalV1; observation: unknown }[];
}): 'REPLAY_CLOSED' {
  const manifest = AgentReplayManifestV1Schema.parse(input.manifest);
  const runtime = PrimeAgentRuntimeV1Schema.parse(input.runtime);
  const registry = CapabilityRegistryV1Schema.parse(input.registry);
  if (!verifyAgentReplayManifestV1(manifest)) throw new Error('REPLAY_MANIFEST_CHECKSUM_INVALID');
  if (runtime.contextManifestChecksum !== manifest.contextManifestChecksum || runtime.capabilityRegistryRevision !== manifest.capabilityRegistryRevision || runtime.toolRegistryRevision !== manifest.toolRegistryRevision || runtime.policyRevision !== manifest.policyRevision || registry.registryRevision !== manifest.capabilityRegistryRevision || registry.toolRegistryRevision !== manifest.toolRegistryRevision) throw new Error('REPLAY_RUNTIME_REVISION_MISMATCH');
  if (manifest.expectedSequence.length > runtime.maxSteps || manifest.expectedSequence.length > runtime.maxToolCalls) throw new Error('REPLAY_BUDGET_EXCEEDED');
  if (input.receipts.length !== manifest.expectedSequence.length || input.executions.length !== manifest.expectedSequence.length) throw new Error('REPLAY_STEP_RECEIPT_COVERAGE_INCOMPLETE');
  for (let index = 0; index < manifest.expectedSequence.length; index += 1) {
    const expected = manifest.expectedSequence[index];
    const execution = input.executions[index];
    const receipt = ToolExecutionReceiptV1Schema.parse(input.receipts[index]);
    if (!expected || !execution || checksum(receipt) !== checksum(execution.receipt)) throw new Error('REPLAY_RECEIPT_SEQUENCE_MISMATCH');
    if (expected.stepOrdinal !== receipt.stepOrdinal || expected.capabilityId !== receipt.capabilityId || expected.capabilityRevision !== receipt.capabilityRevision || expected.toolId !== receipt.toolId || expected.toolRevision !== receipt.toolRevision || expected.transport !== receipt.transport) throw new Error('REPLAY_EXPECTED_SEQUENCE_MISMATCH');
    validateToolExecutionReceiptV1({
      receipt,
      envelope: execution.envelope,
      proposal: execution.proposal,
      registry,
      expectedOutputChecksum: checksum(execution.observation),
    });
  }
  return 'REPLAY_CLOSED';
}

export async function runReadOnlyAgentReplayV1(input: {
  manifest: AgentReplayManifestV1;
  runtime: PrimeAgentRuntimeV1;
  proposal: AgentActionProposalV1;
  registry: CapabilityRegistryV1;
  policy: ReadOnlyExecutionPolicyV1;
  contextAdmission: unknown;
  fixture: { sourceRef: string; sourceSymbol: string; directCallers: readonly string[]; tests: readonly string[]; neighborhood: ErrorFixNeighborhood };
  now: () => string;
}): Promise<AgentReplayResultV1> {
  const manifest = AgentReplayManifestV1Schema.parse(input.manifest);
  const runtime = PrimeAgentRuntimeV1Schema.parse(input.runtime);
  const proposal = AgentActionProposalV1Schema.parse(input.proposal);
  const registry = CapabilityRegistryV1Schema.parse(input.registry);
  if (runtime.state !== 'PLAN') throw new Error('REPLAY_MUST_START_IN_PLAN');
  if (!verifyAgentReplayManifestV1(manifest)) throw new Error('REPLAY_MANIFEST_CHECKSUM_INVALID');
  if (manifest.expectedSequence.length !== 1 || runtime.maxSteps < 1 || runtime.maxToolCalls < 1) throw new Error('READ_ONLY_REPLAY_FIXTURE_BUDGET_OR_SEQUENCE_INVALID');
  if (runtime.contextManifestChecksum !== manifest.contextManifestChecksum || runtime.capabilityRegistryRevision !== manifest.capabilityRegistryRevision || runtime.toolRegistryRevision !== manifest.toolRegistryRevision || runtime.policyRevision !== manifest.policyRevision || registry.registryRevision !== manifest.capabilityRegistryRevision || registry.toolRegistryRevision !== manifest.toolRegistryRevision) throw new Error('REPLAY_RUNTIME_REVISION_MISMATCH');
  const admission = currentAceContextManifestAdmissionV1Schema.parse(input.contextAdmission);
  if (admission.status !== 'ADMITTED' || admission.manifest === null) throw new Error('CONTEXT_MANIFEST_NOT_ADMITTED');
  if (manifest.sourceSnapshotChecksum !== sourceSnapshotChecksumV1(admission.manifest.identityInput.evidenceRevisions.sourceRevision)) throw new Error('REPLAY_SOURCE_SNAPSHOT_REVISION_MISMATCH');
  const expected = manifest.expectedSequence[0]!;
  if (proposal.stepOrdinal !== expected.stepOrdinal || proposal.capabilityId !== expected.capabilityId || proposal.capabilityRevision !== expected.capabilityRevision) throw new Error('PROPOSAL_NOT_IN_FROZEN_REPLAY_SEQUENCE');
  if (proposal.proposerModelRevision !== manifest.modelRevision) throw new Error('PROPOSAL_MODEL_REVISION_MISMATCH');
  if (expected.transport !== 'local' || expected.toolId !== registry.entries.find((entry) => entry.capabilityId === proposal.capabilityId)?.toolId || expected.toolRevision !== registry.entries.find((entry) => entry.capabilityId === proposal.capabilityId)?.toolRevision) throw new Error('FROZEN_TOOL_SEQUENCE_MISMATCH');
  const envelope = authorizeAndBuildToolEnvelopeV1({
    runtime: { ...runtime, state: 'EXECUTE' },
    proposal,
    registry,
    policy: input.policy,
    contextAdmission: input.contextAdmission,
  });
  const execution = await executeReadOnlyToolV1({
    runtime: { ...runtime, state: 'EXECUTE' },
    envelope,
    proposal,
    registry,
    policy: input.policy,
    contextAdmission: input.contextAdmission,
    fixture: input.fixture,
    now: input.now,
  });
  closeAgentReplayV1({
    manifest,
    runtime: { ...runtime, state: 'VALIDATE' },
    registry,
    receipts: [execution.receipt],
    executions: [{ ...execution, envelope, proposal }],
  });
  return AgentReplayResultV1Schema.parse({
    schema: 'atlas.agent-replay-result.v1',
    executionId: runtime.executionId,
    replayManifestChecksum: manifest.manifestChecksum,
    contextManifestChecksum: runtime.contextManifestChecksum,
    finalState: 'COMPLETE',
    completedSteps: 1,
    finalObservation: execution.observation,
    finalObservationChecksum: checksum(execution.observation),
    receipts: [execution.receipt],
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function buildRlmWorkingStateV1(input: Omit<RlmWorkingStateV1, 'schema' | 'canonicalAuthority' | 'persistenceClass'>): RlmWorkingStateV1 {
  return RlmWorkingStateV1Schema.parse({
    schema: 'atlas.rlm-working-state.v1',
    ...input,
    canonicalAuthority: false,
    persistenceClass: 'EPHEMERAL',
  });
}

export const agentExecutionSpineOwnerAuditV1 = {
  actionRegistryOwner: 'AGENTIC_ACTION_REGISTRY_V1_SEED',
  contextManifestOwner: 'ContextManifestV2 / CurrentAceContextManifestAdmissionV1',
  runEventOwner: 'WorkflowActionEventV1',
  durableReceiptOwner: 'AgentWorkReceiptV1 via outcome_ledger',
  toolReceiptRole: 'NON_CANONICAL_STEP_TRANSPORT_RECEIPT',
  sourceActionCount: AGENTIC_ACTION_REGISTRY_V1_SEED.length,
  secondContextManifestCompiler: false,
  secondCapabilityRegistryAuthority: false,
  canonicalAuthority: false,
} as const;
