import { env } from '$env/dynamic/private';
import type { BackendId } from '$lib/types/pipeline';

const OLLAMA_URL = process.env.OLLAMA_URL || env.OLLAMA_URL || 'http://localhost:11434';

export interface EmbedGatewayOptions {
  model?: string;
  tags?: string[];
}

export interface EmbedGatewayResult {
  embedding: number[];
  backend: BackendId;
  model: string;
}

export async function getEmbeddingViaGate(
  fetchFn: typeof globalThis.fetch,
  text: string,
  opts: EmbedGatewayOptions = {}
): Promise<EmbedGatewayResult> {
  const model = opts.model || 'nomic-embed-text';

  try {
    const response = await fetchFn(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      embedding: data.embedding,
      model: model,
      backend: 'ollama',
    };
  } catch (error) {
    console.error('Embedding gateway error:', error);
    throw error;
  }
}






