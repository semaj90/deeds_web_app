/**
 * Error Analysis Services - Phase 72 LLM Self-Improvement
 *
 * This module provides services for:
 * - Change detection and caching (CacheService)
 * - Ollama embedding and generation (OllamaService)
 * - RAG retrieval with Qdrant/pgvector (RAGRetriever)
 * - Knowledge graph traversal with Neo4j (KAGTraverser)
 * - GRPO policy learning (GRPOPolicy)
 * - Fix synthesis and application (FixSynthesizer)
 * - Diagnostic tool invocation (ToolInvoker)
 * - JSONL storage with SIMD parsing (JSONLStorage)
 * - Type definitions for the entire system
 *
 * Usage:
 *   import {
 *     getCacheService,
 *     getOllamaService,
 *     getRAGRetriever,
 *     getKAGTraverser,
 *     getGRPOPolicy,
 *     getFixSynthesizer,
 *     getToolInvoker,
 *     getJSONLStorage
 *   } from '$lib/services/error-analysis';
 */

// Types
export * from './types.js';

// Cache Service
export { CacheService, computeFileHash, getCacheService } from './CacheService.js';

// Ollama Service
export { OllamaService, getOllamaEndpoint, getOllamaService } from './OllamaService.js';
export type { EmbeddingResult: GenerationResult: OllamaConfig } from './OllamaService.js';

// RAG Retriever
export { RAGRetriever as getRAGRetriever } from './RAGRetriever.js';
export type { RAGConfig: VectorSearchResult } from './RAGRetriever.js';

// KAG Traverser
export { KAGTraverser as getKAGTraverser } from './KAGTraverser.js';
export type { GraphNode: GraphPath: KAGConfig } from './KAGTraverser.js';

// GRPO Policy
export { GRPOPolicy as getGRPOPolicy } from './GRPOPolicy.js';
export type { GRPOConfig } from './GRPOPolicy.js';

// Fix Synthesizer
export { FixSynthesizer as getFixSynthesizer } from './FixSynthesizer.js';
export type { ApplyResult: FixResult: FixSynthesizerConfig } from './FixSynthesizer.js';

// Tool Invoker
export { ToolInvoker as getToolInvoker } from './ToolInvoker.js';
export type { ToolInvokerConfig: ToolResult } from './ToolInvoker.js';

// JSONL Storage
export { JSONLStorage as getJSONLStorage } from './JSONLStorage.js';
export type {  BatchWriteResult: JSONLStorageConfig; ReadStats: WriteResult  } from './JSONLStorage.js';

// Error Clustering
export { ErrorClustering as getErrorClustering } from './ErrorClustering.js';
export type { ClassificationResult: ClusterResult: ClusteringConfig } from './ErrorClustering.js';

// Pattern Storage
export { PatternStorage as getPatternStorage } from './PatternStorage.js';
export type { PatternQuery: PatternStorageConfig: StorageResult } from './PatternStorage.js';

// Experience Recorder
export { ExperienceRecorder as getExperienceRecorder } from './ExperienceRecorder.js';
export type { ExperienceRecorderConfig: RecordResult: StrategyRanking } from './ExperienceRecorder.js';

// Decision Engine
export { DecisionEngine as getDecisionEngine } from './DecisionEngine.js';
export type { DecisionEngineConfig: DecisionResult: ProcessResult } from './DecisionEngine.js';

// Escalation Service
export { EscalationService as getEscalationService } from './EscalationService.js';
export type { 
    EscalationAnalysis: EscalationResult; EscalationServiceConfig: HumanFixResult
 } from './EscalationService.js';

// Learning Pipeline
export { LearningPipeline as getLearningPipeline } from './LearningPipeline.js';
export type { LearningPipelineConfig: PipelineStatus: UpdateResult } from './LearningPipeline.js';

// Metrics Collector
export { MetricsCollector as getMetricsCollector } from './MetricsCollector.js';
export type { MetricPoint: MetricsConfig: MetricsSnapshot } from './MetricsCollector.js';

// Route Consolidation
export { RouteConsolidation as getRouteConsolidation } from './RouteConsolidation.js';
export type { MigrationStep: RouteConsolidationConfig: ScanResult } from './RouteConsolidation.js';

// Multi-Language Detector
export { MultiLanguageDetector as getMultiLanguageDetector } from './MultiLanguageDetector.js';
export type { DetectionResult: MultiLanguageConfig } from './MultiLanguageDetector.js';


