/**
 * Atlas Runtime Exports — Unified entry point for orchestration, FSM, and data plane.
 */

export { AtlasState, createAtlasRuntimeContext } from './atlas-runtime-context';
export type { AtlasRuntimeContext, RuntimeObservation, HMMInference } from './atlas-runtime-context';

export { estimateExecutionState, isTransitionAllowed } from './atlas-fsm-policy';
export { buildRuntimeRegistryRecommendationDrafts } from './runtime-registry';

export {
  atlasRetrieveTool,
  atlasValidateChangeTool,
  atlasApplyChangeTool,
  atlasBuildContextTool,
  atlasDiscoverTool,
  atlasInspectRuntimeTool,
  atlasDelegateTool,
  createAtlasRequestContext,
  atlasToolCallProcessor,
} from './atlas-mastra-adapter';

export {
  getRetrievalGrpcClient,
  closeRetrievalGrpcClient,
  retrieveFromGo,
  buildContextFromGo,
  validatePacketFromGo,
} from './go-retrieval-grpc-client';

export {
  buildSpecRecommendation,
  buildSpecRecommendations,
} from './recommendations/spec-recommendation-bridge';

export {
  FabricLaneKindSchema,
  FabricLaneManifestSchema,
  buildFabricLaneManifest,
} from './contracts/fabric-lanes';

export { buildBoardFabricLaneManifest } from './board/fabric-lane-manifest';
export { buildBoardGpuBenchmarkReceipt } from './board/fabric-gpu-benchmark';
export { buildDailyGraphifyBoardRecommendations } from './board/daily-graphify-board-recommendations';
export { buildDailyGraphifyTaskCandidates } from './board/graphify-task-candidates';
export {
  buildParentAtlasPhaseLaneProofReport,
  getParentAtlasPhaseLaneProofSnapshot,
} from './phase-lane-proof';
export {
  buildParentAtlasPhaseLaneReport,
  getParentAtlasPhaseLane,
  getParentAtlasPhaseLaneSnapshot,
  listParentAtlasPhaseLanes,
} from './phase-lane-registry';
export {
  buildParentAtlasPassFabricProofReport,
  getParentAtlasPassFabricProofSnapshot,
} from './pass-fabric-proof';
export {
  derivePacketInputsFromAceContext,
} from './packet-consumer-inputs';
export {
  AtlasProcessPacketInputSchema,
  buildAtlasProcessPacket,
} from './process-packets';
export {
  runPacketConsumerPipeline,
  hashPacketConsumerPipelineInput,
} from './packet-consumer-pipeline';
export {
  PACKET_FEATURE_NAMES,
  PACKET_FEATURE_COUNT,
  buildPacketFeatureMatrix,
  buildPacketFeatureMatrixFromPackets,
  buildPacketFeatureRowsFromPackets,
  getPacketFeatureRow,
  normalizeDemandUtility,
} from './ranking/packet-feature-matrix';

export {
  ActionLifecycleStateSchema,
  ActionOutcomeSchema,
  ActionOpcodeSchema,
  TemporalApplicabilityV1Schema,
  AgentActionEventV1Schema,
  buildActionExecutionKey,
  buildAgentActionEvent,
} from './temporal/agent-action-event-v1';
export type { AgentActionEventV1 } from './temporal/agent-action-event-v1';
export {
  ActionCurrentProjectionV1Schema,
  ExecutionReuseDecisionV1Schema,
  buildActionCurrentProjection,
  decideExecutionReuse,
} from './temporal/temporal-action-index-v1';
export type {
  ActionCurrentProjectionV1,
  ExecutionReuseDecisionV1,
} from './temporal/temporal-action-index-v1';
export {
  ActionFeatureRowV1Schema,
  NextActionRecommendationV1Schema,
  RecommendationOutcomeReceiptV1Schema,
  rankNextActions,
} from './temporal/next-action-recommendation-v1';
export type {
  ActionFeatureRowV1,
  NextActionRecommendationV1,
} from './temporal/next-action-recommendation-v1';

export {
  KanbanTaskLaneSchema,
  KanbanTaskStatusSchema,
  KanbanTaskSchema,
  KanbanTaskListInputSchema,
  KanbanTaskListOutputSchema,
  KanbanTaskShowInputSchema,
  KanbanTaskClaimInputSchema,
  KanbanTaskBlockInputSchema,
  KanbanTaskCompleteInputSchema,
  KanbanTaskHeartbeatInputSchema,
  KanbanTaskHeartbeatResultSchema,
  KanbanTaskClaimResultSchema,
  KanbanTaskReclaimInputSchema,
  KanbanTaskRetryInputSchema,
  KanbanTaskCreateChildInputSchema,
  KanbanTaskCommentSchema,
  KanbanTaskCommentsInputSchema,
  KanbanTaskAttemptSchema,
  KanbanTaskAttemptsInputSchema,
  listKanbanTasks,
  showKanbanTask,
  claimKanbanTask,
  blockKanbanTask,
  completeKanbanTask,
  heartbeatKanbanTask,
  reclaimStaleKanbanTask,
  retryKanbanTask,
  createChildKanbanTask,
  listKanbanTaskDependencies,
  listKanbanTaskComments,
  listKanbanTaskAttempts,
  listKanbanTaskEvents,
  recordKanbanTaskAttempt,
  formatKanbanTaskSummary,
} from './kanban-task-board';
export {
  buildAnalysisPassCurrentProofSnapshot,
} from '../analysis/analysis-pass-current';
export {
  buildAnalysisPassBoundaryProofSnapshot,
} from '../analysis/analysis-pass-boundary';
