// Lightweight ambient declarations for commonly referenced runtime services
// during migration/triage. These are intentionally permissive and
// meant to be replaced with proper types later.

// Ambient global runtime services frequently referenced across server routes
declare const monitoringService: unknown;
declare const ollamaLLM: unknown;
declare const cachingLayer: unknown;
declare const aiPipeline: unknown;
declare const enhancedRAGPipeline: unknown;
declare const librarySyncService: unknown;
declare const accessMemoryMCP: unknown;
declare const analyticsLog: unknown;
declare const natsMessaging: unknown;
declare const QdrantClient: unknown;
declare const wasmClusteringService: unknown;
declare const comprehensiveCachingService: unknown;
declare const generateEmbedding: unknown;
declare const generateBatchEmbeddings: unknown;
declare const VectorService: unknown;
declare const generateCompletion: unknown;
declare const healthCheck: unknown;
declare const inArray: unknown;
declare const join: unknown;
declare const createHash: unknown;
declare const exec: unknown;
declare const hashPassword: unknown;
declare const FileLike: unknown;

// Auto-generated development global declarations to reduce TS noise while
// we incrementally normalize runtime service imports.
declare namespace NodeJS {
  interface Global {
    monitoringService: unknown;
    ollamaLLM: unknown;
    cachingLayer: unknown;
    aiPipeline: unknown;
    enhancedRAGPipeline: unknown;
    accessMemoryMCP: unknown;
    context7AgentOrchestrator: unknown;
    performContext7Search: unknown;
    context7SemanticAuditor: unknown;
    comprehensiveCachingService: unknown;
    wasmClusteringService: unknown;
    librarySyncService: unknown;
    natsMessaging: unknown;
    qdrantClient: unknown;
    QdrantClient: unknown;
    generateEmbedding: unknown;
    VectorService: unknown;
    VectorSearchService: unknown;
    VectorRepository: unknown;
    aiReports: unknown;
    legalPrecedents: unknown;
    analyticsLog: unknown;
  }
}

// Fall back global declarations
declare const context7AgentOrchestrator: unknown;
declare const performContext7Search: unknown;
declare const context7SemanticAuditor: unknown;
declare const qdrantClient: unknown;
declare const legalPrecedents: unknown;
declare const aiReports: unknown;
