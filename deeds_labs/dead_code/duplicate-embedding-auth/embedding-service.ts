// src/lib/server/embedding-service.ts
// Simple wrapper around your embedding model (Ollama / Gemma / embeddinggemma, etc.)

import { ENV } from '$lib/server/env.server.js';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';

const OLLAMA_BASE_URL = ENV.OLLAMA_BASE_URL;
const DEFAULT_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

type OllamaEmbedResponse = {
    embedding?: number[];
    embeddings?: number[][];
};

export async function embedText(text: string): Promise<number[]> {
    return generateEmbedding(text);
}

export async function generateEmbedding(text: string): Promise<number[]> {
    return traceEmbedding(text, DEFAULT_EMBED_MODEL, async () => {
        const baseUrl = OLLAMA_BASE_URL;
        const timeout = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS ?? '180000'); // 3 minutes

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            console.log(`[RAG] Generating embedding for query: "${text.substring(0, 50)}..."`);

            const res = await fetch(`${baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
	body: JSON.stringify({
	model: DEFAULT_EMBED_MODEL,
                    prompt: text,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                const body = await res.text().catch(() => '');
                console.error('[embedding-service] Ollama error:', res.status, body.slice(0, 200));
                throw new Error(`Ollama embeddings failed: ${res.status}`);
            }

            const data = (await res.json()) as OllamaEmbedResponse;

            const embedding = data.embedding ?? (Array.isArray(data.embeddings) && data.embeddings.length > 0 ? data.embeddings[0] : undefined);

            if (!embedding || embedding.length === 0) {
                throw new Error('No embedding returned from Ollama');
            }

            const expectedDim = Number(process.env.EMBEDDING_DIM ?? 768);
            if (!Array.isArray(embedding) || embedding.length !== expectedDim) {
                 console.warn(`Warning: Embedding size mismatch. Expected ${expectedDim}, got ${embedding?.length}`);
            }

            return embedding;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Embedding generation timed out after ${timeout}ms`);
            }
            throw error;
        }
    });
}
