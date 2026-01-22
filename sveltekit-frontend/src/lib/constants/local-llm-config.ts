/**
 * Local LLM Configuration - Enforces Local Ollama GPU Usage Only
 *
 * This configuration ensures the application only uses locally hosted
 * LLMs via Ollama and prevents unknown remote model downloads or API calls.
 */
export const LOCAL_LLM_CONFIG = {
  // Force local-only operation
  ENFORCE_LOCAL_ONLY: true,

  // Local TensorRT Bridge configuration
  OLLAMA_BASE_URL: "http://localhost:8086",

  OLLAMA_MODELS: {
    LEGAL_DETAILED: "gemma3-legal:latest",
    GENERAL: "gemma3-legal:latest",
    EMBEDDINGS: "nomic-embed-text"
  },

  // Prevent remote downloads
  ALLOW_MODEL_DOWNLOADS: false,
  ALLOWED_HOSTS: ["localhost", "127.0.0.1"],

  // Memory optimization for local GPU
  MAX_CONTEXT_LENGTH: 8192,
  MAX_BATCH_SIZE: 32,
  GPU_MEMORY_FRACTION: 0.8
} as const;

/**
 * Validates that LLM operations are local-only
 */
export function validateLocalLLMAccess(url: string): boolean {
  if (!LOCAL_LLM_CONFIG.ENFORCE_LOCAL_ONLY) return true;
  try {
    const parsedUrl = new URL(url);
    return LOCAL_LLM_CONFIG.ALLOWED_HOSTS.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
}

/**
 * Gets validated local Ollama URL
 */
export function getLocalOllamaUrl(): string {
  if (!validateLocalLLMAccess(LOCAL_LLM_CONFIG.OLLAMA_BASE_URL)) {
    throw new Error("Only local Ollama LLMs are allowed. Remote access blocked.");
  }
  return LOCAL_LLM_CONFIG.OLLAMA_BASE_URL;
}

/**
 * Memory note logged to console during development
 */
if (typeof console !== "undefined" && import.meta.env.DEV) {
    console.log("[Local LLM] Configuration loaded. Local-only enforcement active.");
}
