import './polyfills.js';

// ===== CENTRALIZED TYPES (SINGLE SOURCE OF TRUTH) =====
export * from './types/index.js';

// ===== EXTERNAL SERVICE TYPES =====
export type {
    MinIOClient, MinIOConfig,
    Neo4jClient, Neo4jConfig,
    OllamaClient, OllamaConfig,
    PgVectorClient, PostgresConfig,
    QdrantClient, QdrantConfig,
    QdrantSearchResult, QdrantVectorPayload,
    RedisCacheService, RedisConfig,
    ServiceEnvironment,
    ServiceUrls
} from './types/external-services.js';

// ===== TYPE GUARDS & UTILITIES =====
export * from './utils/type-guards.js';

// ===== ENHANCED API CLIENT =====
export { EnhancedApiClient as apiClient } from './services/enhanced-api-client.js';

// ===== ALL COMPONENTS (COMPREHENSIVE BARREL EXPORT) =====
// Temporarily commented to avoid LegalDocument export conflict
// export * from './components/index.js'

// ===== FILE UPLOAD SERVICES =====
export { enhancedFileUpload } from './services/enhanced-file-upload.js';
export { default as localStorageFileFallback } from './services/localStorage-file-fallback.js';

// ===== UTILITIES & TYPES =====
export { cn, confidenceClass, legalCn, priorityClass } from './utils/cn.js';
export {
    copyToClipboard, debounce, downloadFile, formatDate, formatFileSize, formatProcessingTime, generateId, getCaseStatusStyling, getConfidenceLevel, getEvidenceTypeStyling, getInitials, isBrowser, isValidEmail, storage,
    theme, throttle
} from './utils/index.js';

// Export type helpers for Svelte 5 compatibility
export type {
    WithElementRef,
    WithoutChild,
    WithoutChildren,
    WithoutChildrenOrChild
} from './utils.js';

// ===== OLLAMA INTEGRATION SERVICES =====
// Temporarily disabled due to syntax errors in comprehensive-ollama-summarizer.ts
// export {
//     comprehensiveOllamaSummarizer,
//     type ComprehensiveSummaryRequest,
//     type ComprehensiveSummaryResponse,
//     type SummarizerConfig,
//     type SummarizerStats
// } from './services/comprehensive-ollama-summarizer.js';

export {
    ollamaIntegrationLayer
} from './services/ollama-integration-layer.js';

// Temporarily disabled - file is in ai.bak folder, not ai folder
// export {
//     LangChainOllamaService,
//     langChainOllamaService,
//     type LangChainConfig,
//     type ProcessingResult,
//     type QueryResult
// } from './ai/langchain-ollama-service.js';

// ===== SERVER SERVICES (Server-side only) =====
// Note: These should only be imported on the server side
export type { AuthService } from './server/auth.js';
export type { EmbeddingService, type EmbeddingOptions } from './server/embedding-service.js';

// ===== SERVER DATABASE EXPORTS =====
export { aceChunks, aceDocs, aceSources } from './db/schema/ace-web.js';
export { adminDb as db } from './server/db/client.js';

// ===== VERSION INFO =====
export const VERSION = '2.0.0';
export const BUILD_DATE = new Date().toISOString();
export const FRAMEWORK_INFO = {
  sveltekit: '2.x',
  svelte: '5.x',
  typescript: '5.x',
  vite: '5.x'
} as const;

// ===== FEATURE FLAGS =====
export const FEATURES = {
  GPU_ACCELERATION: true,
  VECTOR_SEARCH: true,
  REAL_TIME_CHAT: true,
  CONTEXT7_INTEGRATION: true,
  MULTI_PROTOCOL_API: true,
  YORHA_THEME: true,
  MCP_INTEGRATION: true,
  WASM_SUPPORT: true,
  WEBGPU_SUPPORT: true,
  CUDA_SUPPORT: true
} as const;

// ===== DEVELOPMENT UTILITIES =====
export const DEV_TOOLS = {
  COMPONENT_COUNT: 392,
  ROUTE_COUNT: 82,
  API_ENDPOINT_COUNT: 145,
  STORE_COUNT: 8,
  SERVICE_COUNT: 12
} as const;

// ===== BARREL STORE - MISSING FUNCTIONS & METHODS =====
export { barrelStore, cacheLayerMethods, configurationProperties, databaseEntityProperties, lokiCollectionMethods, testingFramework, utilityFunctions, webGPUExtendedMethods } from './stores/_archive/old-stores/barrel-functions';

// ===== DATABASE COMPATIBILITY LAYER =====
export { createTypeSafeQuery, drizzleCompatibilityLayer, enhanceResultWithTypes, ensureConnection, entityEnhancers, handleQueryResult, safePropertyAccess, vectorOperations } from './database/drizzle-compatibility-fix.js';

// Make barrel store globally available
if (typeof globalThis !== 'undefined') {
  (globalThis as any).barrelStore = barrelStore;
}

// ===== ENHANCED SERVICES & STORES =====
// Global User Store with Svelte 5 Runes
export { default as globalUserStore } from './stores/_archive/old-stores/global-user-store.svelte';

// Search Services with Fuse.js Integration - TEMPORARILY DISABLED (corrupted file)
// export { searchComponents, searchDemos, searchDocumentation, searchServices } from './services/search-service.js';

// Hybrid Vector Operations
export { getVectorSystemHealth, syncVectorData } from './services/hybrid-vector-operations.js';

// Search Types
export type {
    SearchCategory,
    SearchFilter,
    SearchOptions,
    SearchResult,
    SearchState
} from './types/search.types.js';

// Default export for convenience
export default { VERSION, BUILD_DATE, FRAMEWORK_INFO, FEATURES, DEV_TOOLS, barrelStore };
