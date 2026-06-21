/**
 * Canonical local model endpoint helpers.
 *
 * Chat/generation prefers llama-server/TurboQuant on 8090.
 * Embeddings prefer Ollama/embedding lane on 11434.
 */

function readEnv(key: string): string | undefined {
  try {
    // @ts-ignore import.meta.env is only available in Vite contexts.
    const viteValue = import.meta?.env?.[key];
    if (typeof viteValue === 'string' && viteValue.trim()) return viteValue.trim();
  } catch {
    /* noop */
  }

  const nodeValue = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return typeof nodeValue === 'string' && nodeValue.trim() ? nodeValue.trim() : undefined;
}

function normalizeUrl(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\/+$/, '');
}

export function getOllamaEndpoint(): string {
  const chatPort = readEnv('TURBO_PORT') ?? readEnv('LLAMA_SERVER_PORT') ?? '8090';
  return normalizeUrl(
    readEnv('VITE_TURBOQUANT_URL') ??
      readEnv('VITE_TURBOQUANT_BASE_URL') ??
      readEnv('VITE_LLAMA_SERVER_URL') ??
      readEnv('TURBOQUANT_URL') ??
      readEnv('TURBOQUANT_BASE_URL') ??
      readEnv('LLAMA_SERVER_URL') ??
      readEnv('OLLAMA_URL') ??
      readEnv('OLLAMA_BASE_URL'),
    `http://localhost:${chatPort}`
  );
}

export function getOllamaChatEndpoint(): string {
  return getOllamaEndpoint();
}

export function getOllamaGenerationEndpoint(): string {
  return normalizeUrl(readEnv('OLLAMA_GENERATION_URL'), getOllamaEndpoint());
}

export function getOllamaEmbeddingEndpoint(): string {
  return normalizeUrl(
    readEnv('VITE_OLLAMA_EMBED_BASE_URL') ??
      readEnv('VITE_OLLAMA_EMBEDDING_URL') ??
      readEnv('OLLAMA_EMBED_BASE_URL') ??
      readEnv('OLLAMA_EMBEDDING_URL') ??
      readEnv('OLLAMA_EMBED_BASEURL') ??
      readEnv('OLLAMA_URL') ??
      readEnv('OLLAMA_BASE_URL'),
    'http://localhost:11434'
  );
}

export function getOllamaApiEndpoint(
 type: 'generate' | 'delete' | 'list' | 'show' | string
): string {
 const base = getOllamaEndpoint();
 switch (type) {
 case 'delete':
 return `${base}/api/delete`;
 case 'list':
 return `${base}/api/tags`;
 case 'show':
 return `${base}/api/show`;
 default:
 return `${base}/api/generate`;
 }
}


