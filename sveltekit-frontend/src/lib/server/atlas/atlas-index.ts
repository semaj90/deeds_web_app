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
  GraphSearchAlgorithmSchema,
  SearchIntentSchema,
  SearchLogicalLaneSchema,
  AdaptiveSearchBudgetV1Schema,
  MatrixDiagnosticsV1Schema,
  AdaptiveSearchInputV1Schema,
  SearchAlgorithmRecommendationV1Schema,
  CuvsGraphBuildAlgorithmSchema,
  CuvsSearchAlgorithmSchema,
  CuvsDatasetMemoryTypeSchema,
  CuvsGraphMemoryTypeSchema,
  CuvsCagraBuildPlanV1Schema,
  CuvsCagraSearchPlanV1Schema,
  CuvsBenchAnalysisPlanV1Schema,
  TangPromotionPolicyV1Schema,
  TangPromotionRowV1Schema,
  TangPromotionRecommendationV1Schema,
  SEARCH_POLICY_FEATURE_NAMES,
  SEARCH_POLICY_FEATURE_COUNT,
  SearchPolicyCandidateFeaturesV1Schema,
  CuvsBenchmarkPointV1Schema,
  CuvsParetoAnalysisV1Schema,
  AdaptiveSearchPlanV1Schema,
  inferSearchIntents,
  buildAdaptiveSearchPlan,
  analyzeCuvsParetoFrontier,
  buildTangPromotionRecommendation,
  buildSearchPolicyFeatureMatrix,
  readinessPercentFromRecommendation,
} from './ranking/adaptive-search-policy';
export type {
  GraphSearchAlgorithm,
  SearchIntent,
  SearchLogicalLane,
  AdaptiveSearchBudgetV1,
  MatrixDiagnosticsV1,
  AdaptiveSearchInputV1,
  SearchAlgorithmRecommendationV1,
  CuvsCagraBuildPlanV1,
  CuvsCagraSearchPlanV1,
  CuvsBenchAnalysisPlanV1,
  TangPromotionPolicyV1,
  TangPromotionRowV1,
  TangPromotionRecommendationV1,
  SearchPolicyFeatureName,
  SearchPolicyCandidateFeaturesV1,
  SearchPolicyFeatureMatrixV1,
  CuvsBenchmarkPointV1,
  CuvsParetoAnalysisV1,
  AdaptiveSearchPlanV1,
} from './ranking/adaptive-search-policy';
export {
  ContextWindowCandidateV1Schema,
  ContextWindowBudgetV1Schema,
  ContextWindowInputV1Schema,
  ContextWindowMemberV1Schema,
  ContextWindowV1Schema,
  ContextCacheProposalV1Schema,
  ContextWindowPlanV1Schema,
  buildTokenAwareContextPlan,
} from './ranking/context-window-synthesis';
export type {
  ContextWindowCandidateV1,
  ContextWindowBudgetV1,
  ContextWindowInputV1,
  ContextWindowMemberV1,
  ContextWindowV1,
  ContextCacheProposalV1,
  ContextWindowPlanV1,
} from './ranking/context-window-synthesis';
export {
  SemanticPromotionScorePolicySchema,
  SemanticPromotionDeltaV1Schema,
  SemanticPromotionExclusionV1Schema,
  SemanticPromotionReceiptV1Schema,
  RepairContextManifestV2Schema,
  buildSemanticPromotionReceipt,
  applySemanticPromotionReceipt,
  rebuildRepairAfterSemanticPromotion,
} from './ranking/semantic-promotion-feedback';
export type {
  SemanticPromotionScorePolicy,
  SemanticPromotionDeltaV1,
  SemanticPromotionExclusionV1,
  SemanticPromotionReceiptV1,
  RepairContextManifestV2,
  SemanticPromotionFeedbackResultV1,
} from './ranking/semantic-promotion-feedback';
export {
  MatrixDiagnosticsAlgorithmSchema,
  MatrixDiagnosticsMeasurementPolicyV1Schema,
  DEFAULT_MATRIX_DIAGNOSTICS_POLICY,
  MeasuredMatrixDiagnosticsReceiptV1Schema,
  MeasuredTangPolicyReceiptV1Schema,
  stableReceiptSha256,
  searchPolicyMatrixSha256,
  measureSearchPolicyMatrixDiagnostics,
  buildMeasuredTangPolicyReceipt,
} from './ranking/measured-matrix-diagnostics';
export type {
  MatrixDiagnosticsAlgorithm,
  MatrixDiagnosticsMeasurementPolicyV1,
  MeasuredMatrixDiagnosticsReceiptV1,
  MeasuredTangPolicyReceiptV1,
} from './ranking/measured-matrix-diagnostics';
export {
  ContextToolDagNodeKindSchema,
  ContextToolDagNodeV1Schema,
  ContextToolDagV1Schema,
  WorkflowActionEventV1Schema,
  validateContextToolDag,
  workflowActionFromDagNode,
} from './workflow/context-tool-dag-contracts';
export type {
  ContextToolDagNodeKind,
  ContextToolDagNodeV1,
  ContextToolDagV1,
  WorkflowActionEventV1,
} from './workflow/context-tool-dag-contracts';
export {
  RepairProposalRevisionProofV1Schema,
  RepairMutationProposalV1Schema,
  OperatorRepairAuthorizationV1Schema,
  RepairProposalWorkflowBundleV1Schema,
  AuthorizedRepairWorkflowBundleV1Schema,
  compileRepairMutationProposal,
  compileRepairProposalWorkflow,
  compileAuthorizedRepairWorkflow,
} from './workflow/repair-mutation-proposal';
export type {
  RepairProposalRevisionProofV1,
  RepairMutationProposalV1,
  OperatorRepairAuthorizationV1,
  RepairProposalWorkflowBundleV1,
  AuthorizedRepairWorkflowBundleV1,
} from './workflow/repair-mutation-proposal';
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
