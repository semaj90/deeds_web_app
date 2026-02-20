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
    ServiceEnvironment, ServiceUrls
} from './types/external-services.js';

// ===== TYPE GUARDS & UTILITIES =====
// Export type guards selectively to avoid conflicts
export {
    isAITask,
    isWorkerMessage
} from './utils/type-guards.js';

// ===== ENHANCED API CLIENT =====
// Note: EnhancedApiClient may need to be a default export
// export { EnhancedApiClient as apiClient } from './services/enhanced-api-client.js';

// ===== ALL COMPONENTS (COMPREHENSIVE BARREL EXPORT) =====
// Temporarily commented to avoid LegalDocument export conflict
// export * from './components/index.js'

// ===== FILE UPLOAD SERVICES =====
// Note: enhancedFileUpload may need to be a default export
// export { enhancedFileUpload } from './services/enhanced-file-upload.js';
// export { default as localStorageFileFallback } from './services/localStorage-file-fallback.js';

// ===== UTILITIES & TYPES =====
// Session 56: utils/index.js was deleted — these utils are available via direct imports
// export { cn, copyToClipboard, ... } from './utils/index.js';

// Export type helpers for Svelte 5 compatibility
export type {
    WithElementRef, WithoutChild,
    WithoutChildren, WithoutChildrenOrChild
} from './utils.js';

// ===== OLLAMA INTEGRATION SERVICES =====
// export {
//     ollamaIntegrationLayer
// } from './services/ollama-integration-layer.js';

// ===== SERVER SERVICES (Server-side only) =====
// Session 56: server/auth.js deleted — use '$lib/server/lucia.js' for auth
// export type { AuthService } from './server/auth.js';

// ===== SERVER DATABASE EXPORTS =====
// Commented: server-only DB exports must not be in barrel file (leaks into browser bundles)
// Import directly from '$lib/server/db/client' or '$lib/db/schema/ace-web' in server code
// export { aceChunks, aceDocs, aceSources } from './db/schema/ace-web.js';
// export { adminDb as db } from './server/db/client.js';

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

// ===== DATABASE COMPATIBILITY LAYER =====
// Note: These may not all exist - commented problematic exports
// export { createTypeSafeQuery, drizzleCompatibilityLayer, enhanceResultWithTypes, ensureConnection, entityEnhancers, handleQueryResult, safePropertyAccess, vectorOperations } from './database/drizzle-compatibility-fix.js';

// ===== ENHANCED SERVICES & STORES =====
// Session 27: globalUserStore archived to deeds_lab — use userStore from '$lib/stores/user.svelte'

// Hybrid Vector Operations
// export { getVectorSystemHealth, syncVectorData } from './services/hybrid-vector-operations.js';

// Search Types
export type {
    SearchCategory, SearchFilter,
    SearchOptions, SearchResult, SearchState
} from './types/search.types.js';
export * from './utils.js';

// Default export for convenience
export default { VERSION, BUILD_DATE, FRAMEWORK_INFO, FEATURES, DEV_TOOLS };

