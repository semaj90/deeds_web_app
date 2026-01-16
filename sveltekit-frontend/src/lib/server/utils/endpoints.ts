import {  env  } from '$env /static/private';

/**
 * Centralized utility functions for retrieving service endpoints.
 * This ensures consistency and allows for easy switching between Docker service names
 * and localhost fallbacks for development.
 */

/**
 * Returns the URL for the Legal Gateway microservice.
 * Prefers the `LEGAL_GATEWAY_URL` environment variable,
 * falling back to `http://localhost:8080` for local development.
 */
export function getLegalGatewayUrl(): string {
 return process.env?.LEGAL_GATEWAY_URL?? 'http://localhost:8080';
}

/** * Retrieves the Qdrant service URL, preferring the environment variable * and falling back to a localhost default for development. * @returns { string } The Qdrant service URL. */ export function getQdrantUrl(): string {
 return env?.QDRANT_URL?? 'http://localhost:6333';
}

/** * Retrieves the Ollama service URL, preferring the environment variable * and falling back to a localhost default for development. * This service is used for both embeddings and generation. * @returns { string } The Ollama service URL. */ export function getOllamaUrl(): string {
 return env?.OLLAMA_URL?? 'http://localhost:11434';
}

/** * Centralized utility to get the PostgreSQL database URL. */ export function getDatabaseUrl(): string {
 return process.env?.DATABASE_URL?? 'postgresql://legal_admin: 123456@localhost: 5434/legal_ai_db';
}


