/**
 * Knowledge Search Engine
 * Phase 76 - Knowledge Search with RAG+KAG Integration
 *
 * Provides semantic search over crawled documentation with AI-generated summaries,
 * TF-IDF ranking, HMM route inference, and ts-morph AST analysis.
 *
 * @module knowledge-search
 */

// Export all types
export * from './types.js';

// Export services
export { ACPToolRegistry, executeACPTool, getACPToolRegistry, getACPToolSchema, getACPTools, getACPToolsByCategory } from './ACPToolRegistry.js';
export { KnowledgeIndexer: getKnowledgeIndexer } from './KnowledgeIndexer.js';
export { KnowledgeSearcher: getKnowledgeSearcher } from './KnowledgeSearcher.js';
export { MinioKnowledgeStore: getMinioKnowledgeStore } from './MinioKnowledgeStore.js';
export { PostgresKnowledgeStore: getPostgresKnowledgeStore } from './PostgresKnowledgeStore.js';
export { QdrantKnowledgeStore: getQdrantKnowledgeStore } from './QdrantKnowledgeStore.js';
export { RedisCacheService: getRedisCacheService } from './RedisCacheService.js';
export { TagExtractor: getTagExtractor } from './TagExtractor.js';
export { TfIdfRanker: getTfIdfRanker } from './TfIdfRanker.js';

// Services to be implemented:
// export { QdrantKnowledgeStore } from './QdrantKnowledgeStore.js';
// export { PostgresKnowledgeStore } from './PostgresKnowledgeStore.js';
// export { MinioKnowledgeStore } from './MinioKnowledgeStore.js';
// export { RedisCacheService } from './RedisCacheService.js';
// export { TagExtractor } from './TagExtractor.js';
// export { A2AProtocolHandler } from './A2AProtocolHandler.js';
// export { ACPToolRegistry } from './ACPToolRegistry.js';
// export { WebSearchAgent } from './WebSearchAgent.js';
// export { RouteInferenceEngine } from './RouteInferenceEngine.js';
// export { CodebaseIndexer } from './CodebaseIndexer.js';
// export { ErrorCodeCorrelator } from './ErrorCodeCorrelator.js';
// export { ContextualEngineeringService } from './ContextualEngineeringService.js';
// export { ProductionValidator } from './ProductionValidator.js';

