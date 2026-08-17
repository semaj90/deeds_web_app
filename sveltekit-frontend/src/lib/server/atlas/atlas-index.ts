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

export {
  ATLAS_RESOLUTION_STATUSES,
} from './contracts/bounded-resolution';
export type {
  AtlasResolutionStatus,
  AtlasLaneName,
  AtlasLod,
  AtlasRevisionSet,
  ResourceEnvelopeV1,
  ResourceUsageV1,
  CandidateEvidenceV1,
  CandidateV1,
  CandidateExpansionV1,
  CandidateFiberV1,
  HyperedgeParticipantV1,
  HyperedgeV1,
} from './contracts/bounded-resolution';
export {
  emptyResourceUsage,
  addResourceUsage,
  withWallTime,
  resourceBoundaryReasons,
  hasResourceBoundary,
  remainingCandidateCapacity,
} from './bounded-resolution/budget';
export {
  canonicalSetDelta,
  candidateDelta,
  isStableDelta,
} from './bounded-resolution/stability';
export { decodeKBestLineages } from './bounded-resolution/lineage';
export type {
  LineageFrameV1,
  LineageTransitionV1,
  LineageTransitionScorer,
  LineagePathV1,
} from './bounded-resolution/lineage';
export { projectHyperedgesToWeightedEdges } from './bounded-resolution/hypergraph';
export type { HypergraphProjectionEdgeV1 } from './bounded-resolution/hypergraph';
export {
  ATLAS_ROUTE_BITS,
  buildRouteMask,
  hasRouteFlag,
  routeHammingDistance,
} from './bounded-resolution/route-mask';
export type {
  AtlasRouteFlag,
  AtlasRouteMask,
  RouteMaskInputV1,
} from './bounded-resolution/route-mask';

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
