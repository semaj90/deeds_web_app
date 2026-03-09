import { logger } from './log.js';

export interface OllamaResponse {
  embedding?: number[];
  response?: string;
  model?: string;
  error?: string;
}

export async function getOllamaEndpoint(): Promise<string> {
  const base = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  return base.replace(/\/$/, '');
}

/**
 * Generate embeddings from embeddinggemma:latest
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const url = `${await getOllamaEndpoint()}/api/embeddings`;
  const payload = { model: 'embeddinggemma:latest', prompt: text };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as OllamaResponse;
    if (!data.embedding) throw new Error('No embedding returned from Ollama');

    logger.info(`🧬 Generated embedding (${data.embedding.length} dims) via embeddinggemma`);
    return data.embedding;
  } catch (err) {
    logger.error(`❌ Ollama embedding error: ${(err as Error).message}`);
    throw err;
  }
}

/**
 * Simple chat completion via gemma3-legal:latest
 */
export async function chatWithGemma(messages: Array<{ role: string; content: string }>) {
  const url = `${await getOllamaEndpoint()}/api/chat`;
  const payload = { model: 'gemma3-legal:latest', messages };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data.message?.content ?? '';
  } catch (err) {
    logger.error(`❌ Ollama chat error: ${(err as Error).message}`);
    return '⚠️ Ollama chat unavailable';
  }
}