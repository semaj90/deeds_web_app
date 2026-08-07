// Knowledge Layer Main Export
// Orchestrates all lanes and provides unified API

export { Language, Symbol, NodeType, ControlFlow, Import, Export, CallExpression, SideEffect, GroundSpan, TestReference, EdgeType, PatchCandidate, scoreCandidate, RetrievalHook, RetrievalResult, Evidence, LaneId, RuntimeEvidence, SymbolMetrics } from './types';

export { parseAndExtract, ASTResult } from './ast-extractor';

export { buildFunctionalGraph, analyzeImpact, getSymbolDependencies, getSymbolDependents, GraphEdge } from './graph-construction';

export { generateSemanticDescription, SemanticDescription } from './semantic-behavior';

export { collectRuntimeEvidence, aggregateSymbolMetrics, getSymbolEvidence, RuntimeEvidence, SymbolMetrics } from './runtime-evidence';

export { rankSymbols, RankedResult } from './ranker';

export { routeQuery, fuseLaneResults, LaneResult } from './retrieval-orchestrator';

export { buildExecutionPlan, executePlan, createRecommendationPipeline, Task, ExecutionPlan, RecommendationPipeline } from './dag-scheduler';

export { verifyEmbedding, EmbeddingCheck } from './embedding-verification';
