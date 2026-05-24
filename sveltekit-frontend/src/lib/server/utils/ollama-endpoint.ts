/**
 * Centralized utility to get the Ollama API endpoint.
 * Prioritizes the process.env.OLLAMA_URL environment variable for Docker/production,
 * and falls back to the canonical server ENV default.
 */

import { ENV } from '$lib/server/env.server.js';

export function getOllamaEndpoint(): string {
    const ollamaUrl = ENV.OLLAMA_BASE_URL;
    console.log(`Using Ollama endpoint: ${ollamaUrl}`);
    return ollamaUrl;
}

/**
 * Example usage for specific model endpoints.
 * The base endpoint is retrieved, and model-specific paths are appended by the caller.
 */
export function getOllamaModelEndpoint(model: string): string {
    const baseUrl = getOllamaEndpoint();

    // Ollama typically uses /api/generate or /api/embeddings for models.
    // This example assumes a common pattern, adjust based on actual Ollama API.
    switch (model) {
        case 'gemma4-rotorquant:latest':
            return `${baseUrl}/api/generate`; // Or specific path for generation

        case 'embeddinggemma:latest':
            return `${baseUrl}/api/embeddings`; // Or specific path for embeddings

        default:
            return `${baseUrl}/api/generate`; // Default to generate endpoint
    }
}
