/**
 * Embedding Orchestrator Initialization
 * Wires up the embedding orchestrator on SvelteKit app startup
 * Detects available VRAM and initializes appropriate lane
 */

import { embeddingOrchestrator } from './retrieval/embedding-orchestrator';
import { logger } from './logger';

let initialized = false;

/**
 * Initialize the embedding orchestrator (called once on app startup)
 */
export async function initializeEmbeddingOrchestrator(): Promise<void> {
  if (initialized) {
    logger.info('[EmbeddingOrchestratorInit] Already initialized');
    return;
  }

  try {
    // Detect available VRAM (default to middle tier for safety)
    const availableVramMb = process.env.AVAILABLE_VRAM_MB
      ? parseInt(process.env.AVAILABLE_VRAM_MB)
      : 3000; // Conservative default for RTX 3060 Ti

    // Get optional preferences
    const preferredLane = (process.env.PREFERRED_EMBEDDING_LANE as any) || undefined;
    const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

    logger.info('[EmbeddingOrchestratorInit] Starting initialization', {
      available_vram_mb: availableVramMb,
      preferred_lane: preferredLane,
      ollama_url: ollamaUrl
    });

    // Initialize orchestrator
    await embeddingOrchestrator.initialize(availableVramMb, preferredLane, ollamaUrl);

    initialized = true;

    // Log diagnostics
    const diags = embeddingOrchestrator.getDiagnostics();
    logger.info('[EmbeddingOrchestratorInit] Initialization complete', {
      diagnostics: diags
    });
  } catch (error) {
    logger.error('[EmbeddingOrchestratorInit] Initialization failed', {
      error: String(error)
    });

    // Don't throw - let the app continue with orchestrator uninitialized
    // Requests will fail with clear error messages if attempted
  }
}

/**
 * Get the initialized orchestrator (or null if not initialized)
 */
export function getEmbeddingOrchestrator() {
  if (!initialized) {
    logger.warn('[EmbeddingOrchestratorInit] Orchestrator accessed before initialization');
  }
  return embeddingOrchestrator;
}

/**
 * Check if orchestrator is ready
 */
export function isEmbeddingOrchestratorReady(): boolean {
  return initialized;
}
