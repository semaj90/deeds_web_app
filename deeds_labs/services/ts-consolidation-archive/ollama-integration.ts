import { env } from '$env/dynamic/private';
import type { EmbeddingResponse, GenerateResponse } from '$lib/types/ollama';

const OLLAMA_BASE_URL = env.OLLAMA_URL || 'http://localhost:11434';

/**
 * Generates embeddings for a given text using the Ollama API.
 * @param {string} text The text to embed.
 * @param {string} model The Ollama model to use (e.g., "embeddinggemma:latest").
 * @returns {Promise<number[]>} A promise that resolves to an array of numbers representing the embedding.
 */
export async function generateEmbedding(text: string, model: string): Promise<number[]> {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, prompt: text })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Ollama API error, ${response.status} - ${errorBody}`);
        }

        const data: EmbeddingResponse = await response.json();
        return data.embedding;
    } catch (error) {
        console.error('Error generating Ollama embedding: ', error);
        throw error;
    }
}

/**
 * Placeholder for a more advanced Ollama summarization or generation helper.
 * @param {string} prompt The prompt for the Ollama model.
 * @param {string} model The Ollama model to use (e.g., "gemma3-legal:latest").
 * @returns {Promise<string>} A promise that resolves to the generated text.
 */
export async function generateText(prompt: string, model: string): Promise<string> {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, prompt, stream: false })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Ollama API error, ${response.status} - ${errorBody}`);
        }

        const data: GenerateResponse = await response.json();
        return data.response;
    } catch (error) {
        console.error('Error generating Ollama text: ', error);
        throw error;
    }
}



