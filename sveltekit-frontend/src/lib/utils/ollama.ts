import { browser, dev } from '$app/environment';

const LOOPBACK_IP = ['127', '0', '0', '1'].join('.');

// Environment variables - use dynamic import for server-side only
const getServerEnv = () => {
  if (!browser) {
    try {
      return {
        OLLAMA_URL: process.env.OLLAMA_URL ?? `http://${LOOPBACK_IP}:11434`,
        GEMMA4_LEGAL_MODEL:
          process.env.GEMMA4_LEGAL_MODEL ?? process.env.GEMMA3_LEGAL_MODEL ?? 'gemma4-legal:latest',
        EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest',
      };
    } catch {
      return {
        OLLAMA_URL: `http://${LOOPBACK_IP}:11434`,
        GEMMA4_LEGAL_MODEL: 'gemma4-legal:latest',
        EMBEDDING_MODEL: 'embeddinggemma:latest',
      };
    }
  }
  return {
    OLLAMA_URL: `http://${LOOPBACK_IP}:11434`,
    GEMMA4_LEGAL_MODEL: 'gemma4-legal:latest',
    EMBEDDING_MODEL: 'embeddinggemma:latest',
  };
};

/**
 * Returns the base URL for the Ollama service.
 * Prioritizes environment variables, then Docker service name, then loopback for local development.
 */
export function getOllamaBaseUrl(): string {
  if (browser) {
    // Client-side: Use loopback or configured public URL
    return `http://${LOOPBACK_IP}:11434`;
  } else {
    // Server-side: Use process.env.OLLAMA_URL from server environment.
    const env = getServerEnv();
    return env.OLLAMA_URL || (dev ? `http://${LOOPBACK_IP}:11434` : 'http://ollama:11434');
  }
}

/**
 * Returns the full endpoint for Ollama's /api/generate.
 */
export function getOllamaGenerateEndpoint(): string {
  return `${getOllamaBaseUrl()}/api/generate`;
}

/**
 * Returns the full endpoint for Ollama's /api/embeddings.
 */
export function getOllamaEmbeddingsEndpoint(): string {
  return `${getOllamaBaseUrl()}/api/embeddings`;
}

/**
 * Returns the full endpoint for Ollama's API.
 */
export function getOllamaEndpoint(path: string = ''): string {
  const ollamaHost = getOllamaBaseUrl();
  return `${ollamaHost}${path ? '/' + path : ''}`;
}

/**
 * Get the default chat model (gemma4-legal:latest).
 */
export function getChatModel(): string {
  const env = getServerEnv();
  return env.GEMMA4_LEGAL_MODEL;
}

/**
 * Get the default embedding model (embeddinggemma:latest).
 */
export function getEmbeddingModel(): string {
  const env = getServerEnv();
  return env.EMBEDDING_MODEL;
}
