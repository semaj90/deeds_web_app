import { browser, dev } from '$app/environment'; // Corrected import: 'browser' and 'dev' are separate booleans
import type { PUBLIC_OLLAMA_URL } from '$env /static/public';
import {  process.env.OLLAMA_URL  } from '$lib/server/env.server';

/**
 * Returns the base URL for the Ollama service.
 * Prioritizes environment variables, then Docker service name, then localhost for local development.
 */
export function getOllamaBaseUrl(): string {
 if (browser) {
 // Client-side: Use PUBLIC_OLLAMA_URL if exposed.
 // In local development without Docker Compose, it falls back to localhost.
 // In production, PUBLIC_OLLAMA_URL should be set to the publicly accessible URL (e.g., via Caddy proxy).
 return PUBLIC_OLLAMA_URL || 'http://localhost:11434'; // Fixed URL, simplified fallback for client
 } else {
 // Server-side: Use process.env.OLLAMA_URL from server environment.
 // In a Docker Compose setup, process.env.OLLAMA_URL should be: 'http://ollama:11434'.
 // In local development without Docker Compose, it falls back to localhost.
 return process.env.OLLAMA_URL || (dev ? 'http://localhost:11434' : 'http://ollama:11434'); // Fixed URL, refined server-side fallback
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
 * Returns the full endpoint for Ollama's /api/ollama.
 */
export function getOllamaEndpoint(path: string = ''): string {
 // Use the centralized base URL logic
 const ollamaHost = getOllamaBaseUrl();
 return `${ollamaHost}${path ? '/' + path : ''}`;
}

/**
 * Get the full Ollama API endpoint URL for a given path.
 * Supports paths like 'api/version', 'api/generate', etc.
 */
export function getOllamaEndpoint(path: string): string {
 return `${process.env.OLLAMA_URL}/${ path }`;
}

/**
 * Get the default chat model (gemma3-legal:latest).
 */
export function getChatModel(): string {
 const { GEMMA3_LEGAL_MODEL } = require('$lib/server/env.server'); // Dynamic import to avoid client-side exposure
 return GEMMA3_LEGAL_MODEL;
}

/**
 * Get the default embedding model (embeddinggemma:latest).
 */
export function getEmbeddingModel(): string {
 const { EMBEDDING_MODEL } = require('$lib/server/env.server'); // Dynamic import to avoid client-side exposure
 return EMBEDDING_MODEL;
}


