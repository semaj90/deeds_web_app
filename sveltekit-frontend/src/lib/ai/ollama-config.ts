/**
 * Ollama Configuration shared module
 * Used by embedding clients and compatibility components.
 * Chat/generation is owned by llama-server :8090, never Ollama :11434.
 */

import {
  getOllamaEmbeddingEndpoint,
  getOllamaEndpoint as getChatEndpoint,
} from '$lib/utils/ollama-endpoint.js';

export const DEFAULT_OLLAMA = getChatEndpoint();

export function getOllamaEndpoint(): string {
    return getChatEndpoint();
}

export function getOllamaModel(): string {
    try {
        // @ts-ignore
        return import.meta.env?.VITE_OLLAMA_MODEL || process.env?.OLLAMA_MODEL || 'embeddinggemma:latest';
    } catch {
        return process.env?.OLLAMA_MODEL || 'embeddinggemma:latest';
    }
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const endpoint = getOllamaEmbeddingEndpoint();
    const model = 'embeddinggemma:latest'; // Default embedding model

    try {
        const response = await fetch(`${endpoint}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: text })
        });

        if (!response.ok) {
            console.error(`Ollama embedding error: ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        return data.embedding || [];
    } catch (e) {
        console.error("Embedding generation failed", e);
        return [];
    }
}
