/**
 * Centralized Service Factory (stub)
 *
 * This file was corrupted by Phase 99 auto-migration. It currently has zero
 * consumers — all service access goes through individual adapters:
 *   - Ollama: $lib/server/ollama.ts
 *   - Qdrant: $lib/server/vector/qdrant-manager.ts
 *   - Redis:  $lib/server/redis.ts
 *   - DB:     $lib/server/db/client.ts
 *
 * The unified-legal-simd-pgvector-production module it referenced was archived.
 */

export function getServices() {
	console.warn('[services] Stub — use individual adapters instead');
	return null;
}

export async function getLegalSystem() {
	console.warn('[services] Stub — use individual adapters instead');
	return null;
}