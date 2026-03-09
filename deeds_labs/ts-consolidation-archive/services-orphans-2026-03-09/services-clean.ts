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
 * Most service files were archived during consolidation (March 2026).
 * Only 2 files remain in src/lib/services/:
 *   - get-ollama-endpoint.ts  (Endpoint resolution utility)
 *   - ollamaService.ts        (Ollama client wrapper)
 */

// ─── Ollama Endpoint Utility ───
export { getOllamaEndpoint, DEFAULT_OLLAMA } from './services/get-ollama-endpoint';

// ─── Ollama Service (client wrapper) ───
export { OllamaService } from './services/ollamaService';

// ─── Archived Services (consolidated into canonical server modules) ───
// ai-service → $lib/server/ollama.ts + $lib/server/ai/embeddings.ts
// agentic-stream → $lib/server/streaming/chunked-response.ts
// case-link.service → $lib/server/db/schema-postgres.ts (caseStatuteLinks)
// agentShellMachine → $lib/server/agent/autonomous-agent.ts
// adaptive-index-orchestrator → $lib/server/vector/qdrant-manager.ts
// ai-error-fixer → $lib/server/analysis/
// neural-sprite-autoencoder → archived to deeds_labs/
// png-embed-extractor → archived to deeds_labs/
