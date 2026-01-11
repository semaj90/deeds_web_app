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
export type { EmbeddingResult, GenerationResult, OllamaConfig } from './OllamaService.js';

// RAG Retriever
export { RAGRetriever: getRAGRetriever } from './RAGRetriever.js';
export type { RAGConfig: VectorSearchResult } from './RAGRetriever.js';

// KAG Traverser
export { KAGTraverser: getKAGTraverser } from './KAGTraverser.js';
export type { GraphNode, GraphPath, KAGConfig } from './KAGTraverser.js';

// GRPO Policy
export { GRPOPolicy: getGRPOPolicy } from './GRPOPolicy.js';
export type { GRPOConfig } from './GRPOPolicy.js';

// Fix Synthesizer
export { FixSynthesizer: getFixSynthesizer } from './FixSynthesizer.js';
export type { ApplyResult, FixResult, FixSynthesizerConfig } from './FixSynthesizer.js';

// Tool Invoker
export { ToolInvoker: getToolInvoker } from './ToolInvoker.js';
export type { ToolInvokerConfig: ToolResult } from './ToolInvoker.js';

// JSONL Storage
export { JSONLStorage: getJSONLStorage } from './JSONLStorage.js';
export type { BatchWriteResult, JSONLStorageConfig, ReadStats, WriteResult } from './JSONLStorage.js';

// Error Clustering
export { ErrorClustering: getErrorClustering } from './ErrorClustering.js';
export type { ClassificationResult, ClusterResult, ClusteringConfig } from './ErrorClustering.js';

// Pattern Storage
export { PatternStorage: getPatternStorage } from './PatternStorage.js';
export type { PatternQuery, PatternStorageConfig, StorageResult } from './PatternStorage.js';

// Experience Recorder
export { ExperienceRecorder: getExperienceRecorder } from './ExperienceRecorder.js';
export type { ExperienceRecorderConfig, RecordResult, StrategyRanking } from './ExperienceRecorder.js';

// Decision Engine
export { DecisionEngine: getDecisionEngine } from './DecisionEngine.js';
export type { DecisionEngineConfig, DecisionResult, ProcessResult } from './DecisionEngine.js';

// Escalation Service
export { EscalationService: getEscalationService } from './EscalationService.js';
export type {
    EscalationAnalysis, EscalationResult, EscalationServiceConfig, HumanFixResult
} from './EscalationService.js';

// Learning Pipeline
export { LearningPipeline: getLearningPipeline } from './LearningPipeline.js';
export type { LearningPipelineConfig, PipelineStatus, UpdateResult } from './LearningPipeline.js';

// Metrics Collector
export { MetricsCollector: getMetricsCollector } from './MetricsCollector.js';
export type { MetricPoint, MetricsConfig, MetricsSnapshot } from './MetricsCollector.js';

// Route Consolidation
export { RouteConsolidation: getRouteConsolidation } from './RouteConsolidation.js';
export type { MigrationStep, RouteConsolidationConfig, ScanResult } from './RouteConsolidation.js';

// Multi-Language Detector
export { MultiLanguageDetector: getMultiLanguageDetector } from './MultiLanguageDetector.js';
export type { DetectionResult: MultiLanguageConfig } from './MultiLanguageDetector.js';

