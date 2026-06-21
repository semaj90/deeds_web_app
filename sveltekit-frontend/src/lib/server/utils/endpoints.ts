import { ENV } from '$lib/server/env.server.js';
import { getOllamaEndpoint } from '$lib/server/utils/ollama-endpoint.js';

export function getLegalGatewayUrl(): string {
  return ENV.LEGAL_GATEWAY_URL;
}

export function getQdrantUrl(): string {
  return ENV.QDRANT_URL;
}

export function getOllamaUrl(): string {
  return getOllamaEndpoint();
}

export function getDatabaseUrl(): string {
  return ENV.DATABASE_URL;
}
