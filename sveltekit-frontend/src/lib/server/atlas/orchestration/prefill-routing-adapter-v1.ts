import { z } from 'zod';

import {
  DeterministicQueryFeaturesV1Schema,
  ToolCandidateSignalV1Schema,
  ToolRoutingReceiptV1Schema,
  type QueryRoutingSnapshotV1,
  type ToolRoutingReceiptV1,
} from '$lib/server/atlas/neural-routing/contracts.js';
import {
  ActiveToolRegistryManifestV1Schema,
  type ActiveToolRegistryManifestV1,
} from './active-tool-registry-v1.js';
import {
  AdvisoryDecoderStateV1Schema,
  OperationKindV1Schema,
  OperationTargetScopeV1Schema,
  OrchestrationStageV1Schema,
  createPrefillExecutionPlanV1,
  orchestrationChecksum,
  type AdvisoryDecoderStateV1,
  type OperationKindV1,
  type OperationTargetScopeV1,
  type OrchestrationStageV1,
  type PrefillExecutionPlanV1,
} from './prefill-execution-plan-v1.js';

const QueryRoutingPrefillInputSchema = z.object({
  requestId: z.string().min(1),
  toolRegistryRevision: z.string().min(1),
  queryText: z.string().min(1),
  deterministicFeatures: DeterministicQueryFeaturesV1Schema,
  candidateTools: z.array(ToolCandidateSignalV1Schema),
  checksum: z.string().length(64),
}).strict();

const ToolRoutingPrefillReceiptSchema = ToolRoutingReceiptV1Schema.pick({
  requestId: true,
  snapshotChecksum: true,
  selectedToolIds: true,
  checksum: true,
});

type QueryRoutingPrefillInputV1 = Pick<
  QueryRoutingSnapshotV1,
  'requestId' | 'toolRegistryRevision' | 'queryText' | 'deterministicFeatures' | 'candidateTools' | 'checksum'
>;

type ToolRoutingPrefillReceiptV1 = Pick<
  ToolRoutingReceiptV1,
  'requestId' | 'snapshotChecksum' | 'selectedToolIds' | 'checksum'
>;

export interface BuildPrefillFromRoutingV1Input {
  routingSnapshot: QueryRoutingPrefillInputV1;
  routingReceipt: ToolRoutingPrefillReceiptV1;
  toolRegistry: ActiveToolRegistryManifestV1;
  workflowId: string;
  workflowRevision: number;
  allowedOperationKinds: OperationKindV1[];
  allowedTargetScopes: OperationTargetScopeV1[];
  mutationAuthorized: boolean;
  humanApprovalPresent: boolean;
  selectedDagNodeIds: string[];
  requiredStages: OrchestrationStageV1[];
  advisoryDecoder: AdvisoryDecoderStateV1;
  model: {
    provider: string;
    modelId: string;
    endpoint: string;
    contextWindowTokens: number;
    reservedOutputTokens: number;
    toolSchemaBudgetTokens: number;
    evidenceBudgetTokens: number;
    instructionBudgetTokens: number;
  };
  packetManifestChecksum: string | null;
  exactPromotionRequired: boolean;
  validationRequired: boolean;
  producerRevision: string;
}

function deriveQueryIntent(features: z.infer<typeof DeterministicQueryFeaturesV1Schema>):
  'SEARCH' | 'READ' | 'ANALYZE' | 'PLAN' | 'EDIT' | 'VERIFY' | 'SYNTHESIZE' | 'UNKNOWN' {
  const actions = new Set(features.requestedActions);
  if (actions.has('EDIT')) return 'EDIT';
  if (actions.has('VERIFY')) return 'VERIFY';
  if (actions.has('SEARCH')) return 'SEARCH';
  if (actions.has('READ')) return 'READ';
  if (actions.has('TRACE') || actions.has('COMPARE') || actions.has('EXPAND') || actions.has('BENCHMARK')) return 'ANALYZE';
  if (actions.has('TRAIN')) return 'PLAN';
  return 'UNKNOWN';
}

export function buildPrefillExecutionPlanFromRoutingV1(input: BuildPrefillFromRoutingV1Input): PrefillExecutionPlanV1 {
  const snapshot = QueryRoutingPrefillInputSchema.parse(input.routingSnapshot);
  const receipt = ToolRoutingPrefillReceiptSchema.parse(input.routingReceipt);
  const registry = ActiveToolRegistryManifestV1Schema.parse(input.toolRegistry);
  const allowedOperationKinds = z.array(OperationKindV1Schema).min(1).parse(input.allowedOperationKinds);
  const allowedTargetScopes = z.array(OperationTargetScopeV1Schema).min(1).parse(input.allowedTargetScopes);
  const requiredStages = z.array(OrchestrationStageV1Schema).min(1).parse(input.requiredStages);
  const decoder = AdvisoryDecoderStateV1Schema.parse(input.advisoryDecoder);

  if (snapshot.requestId !== receipt.requestId) {
    throw new Error('PREFILL_ROUTING_REQUEST_ID_MISMATCH');
  }
  if (snapshot.checksum !== receipt.snapshotChecksum) {
    throw new Error('PREFILL_ROUTING_SNAPSHOT_CHECKSUM_MISMATCH');
  }
  if (snapshot.toolRegistryRevision !== registry.registryRevision) {
    throw new Error('PREFILL_TOOL_REGISTRY_REVISION_MISMATCH');
  }

  const canonicalRoutableByTool = new Map(
    registry.entries
      .filter((entry) => entry.canonicalOwner && entry.routingEligible)
      .map((entry) => [entry.toolId, entry] as const),
  );
  const candidateByTool = new Map(snapshot.candidateTools.map((candidate) => [candidate.toolId, candidate] as const));
  const operations = new Set(allowedOperationKinds);
  const scopes = new Set(allowedTargetScopes);

  for (const toolId of receipt.selectedToolIds) {
    const candidate = candidateByTool.get(toolId);
    if (!candidate || !candidate.eligible) {
      const reason = candidate?.exclusionReasonCodes.join(',') || 'MISSING_CANDIDATE';
      throw new Error(`PREFILL_SELECTED_TOOL_NOT_CANDIDATE_ELIGIBLE:${toolId}:${reason}`);
    }
    const entry = canonicalRoutableByTool.get(toolId);
    if (!entry) throw new Error(`PREFILL_SELECTED_TOOL_NOT_REGISTRY_ROUTABLE:${toolId}`);
    if (!operations.has(entry.operationKind)) {
      throw new Error(`PREFILL_SELECTED_TOOL_OPERATION_NOT_AUTHORIZED:${toolId}:${entry.operationKind}`);
    }
    if (!entry.targetScopes.every((scope) => scopes.has(scope))) {
      throw new Error(`PREFILL_SELECTED_TOOL_TARGET_SCOPE_NOT_AUTHORIZED:${toolId}`);
    }
  }

  const selectedToolSet = new Set(receipt.selectedToolIds);
  const selectedEvidenceRefs = [...new Set(
    snapshot.candidateTools
      .filter((candidate) => selectedToolSet.has(candidate.toolId))
      .flatMap((candidate) => candidate.evidenceRefs),
  )].sort();

  const immutableReadOnlyPrefill = allowedOperationKinds.every((kind) => kind === 'READ' || kind === 'AUDIT')
    && allowedTargetScopes.every((scope) => scope === 'NONE');
  const cacheKey = `prefill:${orchestrationChecksum({
    query: snapshot.queryText,
    snapshotChecksum: snapshot.checksum,
    routingReceiptChecksum: receipt.checksum,
    registryChecksum: registry.checksum,
    modelProvider: input.model.provider,
    modelId: input.model.modelId,
    allowedOperationKinds,
    allowedTargetScopes,
  })}`;

  const canonicalWritesAllowed = allowedOperationKinds.includes('APPLY')
    && allowedTargetScopes.includes('CANONICAL_STORE')
    && input.mutationAuthorized
    && input.humanApprovalPresent;

  return createPrefillExecutionPlanV1({
    requestId: snapshot.requestId,
    workflowId: input.workflowId,
    workflowRevision: input.workflowRevision,
    userQuery: snapshot.queryText,
    queryIntent: deriveQueryIntent(snapshot.deterministicFeatures),
    allowedOperationKinds,
    allowedTargetScopes,
    mutationAuthorized: input.mutationAuthorized,
    humanApprovalPresent: input.humanApprovalPresent,
    selectedToolIds: [...receipt.selectedToolIds],
    selectedDagNodeIds: [...input.selectedDagNodeIds],
    requiredStages,
    advisoryDecoder: decoder,
    prefill: {
      schema: 'atlas.llm-prefill-envelope.v1',
      modelProvider: input.model.provider,
      modelId: input.model.modelId,
      endpoint: input.model.endpoint,
      contextWindowTokens: input.model.contextWindowTokens,
      reservedOutputTokens: input.model.reservedOutputTokens,
      toolSchemaBudgetTokens: input.model.toolSchemaBudgetTokens,
      evidenceBudgetTokens: input.model.evidenceBudgetTokens,
      instructionBudgetTokens: input.model.instructionBudgetTokens,
      selectedToolIds: [...receipt.selectedToolIds],
      selectedEvidenceRefs,
      packetManifestChecksum: input.packetManifestChecksum,
      routingReceiptChecksum: receipt.checksum,
      cacheKey,
      cacheable: immutableReadOnlyPrefill,
    },
    exactPromotionRequired: input.exactPromotionRequired,
    validationRequired: input.validationRequired,
    canonicalWritesAllowed,
    producerRevision: input.producerRevision,
  });
}
