import { ENV } from '$lib/server/env.server.js';
import {
  getOllamaEndpoint,
  getLlamaChatEndpoint,
  getOllamaEmbeddingEndpoint,
  getLlamaGenerationEndpoint,
} from '$lib/server/utils/ollama-endpoint.js';

export function getLegalGatewayUrl(): string {
  return ENV.LEGAL_GATEWAY_URL;
}

export function getQdrantUrl(): string {
  return ENV.QDRANT_URL;
}

export function getOllamaUrl(): string {
  return getOllamaEndpoint();
}

export function getOllamaChatUrl(): string {
  return getLlamaChatEndpoint();
}

export function getOllamaEmbeddingUrl(): string {
  return getOllamaEmbeddingEndpoint();
}

export function getOllamaGenerationUrl(): string {
  return getLlamaGenerationEndpoint();
}

export function getDatabaseUrl(): string {
  return ENV.DATABASE_URL;
}
