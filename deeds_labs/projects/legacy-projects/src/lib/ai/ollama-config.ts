// src/lib/ai/ollama-config.ts
export type OllamaModelTag =
  | 'default'
  | 'legal'
  | 'embed'
  | 'vision'
  | 'small'
  | 'code';

export function getOllamaEndpoint(): string {
  // PowerShell profile can export this already
  return (
    process.env.OLLAMA_ENDPOINT ??
    'http://localhost:11434'
  );
}

export function getOllamaModel(tag: OllamaModelTag = 'default'): string {
  switch (tag) {
    case 'legal':
      return (
        process.env.OLLAMA_MODEL_LEGAL ??
        process.env.OLLAMA_MODEL ??
        'gemma3-legal:latest'
      );
    case 'embed':
      return (
        process.env.OLLAMA_MODEL_EMBED ??
        'embeddinggemma:latest'
      );
    case 'vision':
      return (
        process.env.OLLAMA_MODEL_VISION ??
        'gemma3-vision:1b'
      );
    case 'small':
      return (
        process.env.OLLAMA_MODEL_SMALL ??
        'gemma3:4b'
      );
    case 'code':
      return (
        process.env.OLLAMA_MODEL_CODE ??
        'qwen2.5-coder:7b'
      );
    case 'default':
    default:
      return (
        process.env.OLLAMA_MODEL ??
        'gemma3-legal:latest'
      );
  }
}

export function getOllamaEmbedModel(): string {

  return getOllamaModel('embed');

}



export function getOllamaFallbackEmbedModel(): string {

  return 'nomic-embed-text';

}



/**

 * Robust cached embedding generator that uses Redis if available.

 */

export async function generateCachedEmbedding(text: string, options: { 

  model?: string, 

  baseUrl?: string,

  forceRefresh?: boolean

} = {}): Promise<number[]> {

  const { 

    model = getOllamaEmbedModel(), 

    baseUrl = getOllamaEndpoint(),

    forceRefresh = false

  } = options;



  // Try to get from cache first

  if (!forceRefresh) {

    try {

      const { cache } = await import('../lib/server/cache/redis');

      const cached = await cache.getEmbedding(text, model);

      if (cached) return cached;

    } catch (e) {

      // Redis might not be available or we are in a context where it's not supported

      // Silently fail and fallback to direct call

    }

  }



  // Direct call to Ollama

  const response = await fetch(`${baseUrl}/api/embed`, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({

      model,

      input: [text]

    })

  });



  if (!response.ok) {

    throw new Error(`Ollama returned ${response.status}`);

  }



  const data = await response.json() as { embeddings: number[][] };

  const embedding = data.embeddings[0];



  // Store in cache for next time

  try {

    const { cache } = await import('../lib/server/cache/redis');

    await cache.setEmbedding(text, embedding, model);

  } catch (e) {

    // Ignore cache errors

  }



  return embedding;

}
