/**
 * Clean Services Barrel
 *
 * Re-exports ONLY the verified-clean services from src/lib/services/.
 * This file lives OUTSIDE the excluded src/lib/services/** tree
 * so it is visible to tsconfig.check.json for typecheck rescue mode.
 *
 * Import from '$lib/services-clean' instead of '$lib/services/...'
 * to avoid pulling corrupted siblings into the TS module graph.
 *
 * Clean files (7 migrated + 2 dependencies):
 *   - ai-service.ts          (AI query processing, embeddings, vector search)
 *   - case-link.service.ts   (Case-statute linking, Redis cache)
 *   - agentic-stream.ts      (Ollama streaming + TRT-LLM stub)
 *   - agentShellMachine.ts   (Lightweight state machine, no xstate)
 *   - adaptive-index-orchestrator.ts (Index optimization)
 *   - ai-error-fixer.ts      (Automated error analysis)
 *   - client-server-sync.ts  (Sync operations)
 *   - ollamaService.ts       (Ollama client wrapper)
 *   - get-ollama-endpoint.ts (Endpoint resolution utility)
 */

// ─── Core AI Services ───
export { AIService, aiService } from './services/ai-service';
export type { AIAnalysisResult, AIQueryOptions, VectorSearchResult } from './services/ai-service';

// ─── Agentic Streaming ───
export {
  runAIAgentStream,
  streamFromOllama,
  generateEmbedding,
  chatCompletion,
  executeAITool,
  getOllamaEndpoint as getStreamEndpoint,
  GENERATION_MODEL,
  EMBEDDING_MODEL,
} from './services/agentic-stream';

// ─── Case-Statute Linking ───
export { caseLinkService, CaseLinkService } from './services/case-link.service';
export type { CaseStatuteLink, LinkCaseStatuteRequest } from './services/case-link.service';

// ─── Agent Shell State Machine ───
export { createAgentShellMachine } from './services/agentShellMachine';

// ─── Adaptive Index Orchestrator ───
export { AdaptiveIndexOrchestrator } from './services/adaptive-index-orchestrator';

// ─── AI Error Fixer ───
export { AIErrorFixer } from './services/ai-error-fixer';

// ─── Client-Server Sync ───
// NOTE: Disabled - client-server-sync.ts imports from $lib/db/client-db (excluded)
// export { ClientServerSyncService, syncService, syncStatus, offlineCapabilities, isOnline, canSync } from './services/client-server-sync';
// export type { SyncStatus, SyncOperation } from './services/client-server-sync';

// ─── Ollama Endpoint Utility ───
export { getOllamaEndpoint, DEFAULT_OLLAMA } from './services/get-ollama-endpoint';

// ─── Ollama Service (client wrapper) ───
export { OllamaService } from './services/ollamaService';
