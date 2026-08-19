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
  AgenticRepairLibrarySchema,
  AlignmentCountV1Schema,
  AgenticRepairLibraryFetchParametersV1Schema,
  AgenticRepairLibraryLookupRequestV1Schema,
  AgenticRepairLibraryLookupObservationV1Schema,
  AgenticRepairGatePolicyV1Schema,
  AgenticRepairReadinessInputV1Schema,
  ReadinessMetricNameSchema,
  ReadinessMetricV1Schema,
  RankedAgenticRepairLibraryV1Schema,
  AgenticRepairGroupMeanV1Schema,
  AgenticRepairActionKindSchema,
  AgenticRepairProposedActionV1Schema,
  AgenticRepairReadinessResultV1Schema,
  rankAgenticRepairReadiness,
  agenticRepairInference,
} from './ranking/agentic-repair-readiness-ranker';
export type {
  AgenticRepairLibrary,
  AgenticRepairLibraryFetchParametersV1,
  AgenticRepairLibraryLookupRequestV1,
  AgenticRepairLibraryLookupObservationV1,
  AgenticRepairLibraryLookup,
  AgenticRepairGatePolicyV1,
  AgenticRepairReadinessInputV1,
  RankedAgenticRepairLibraryV1,
  AgenticRepairGroupMeanV1,
  AgenticRepairProposedActionV1,
  AgenticRepairReadinessResultV1,
} from './ranking/agentic-repair-readiness-ranker';
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
