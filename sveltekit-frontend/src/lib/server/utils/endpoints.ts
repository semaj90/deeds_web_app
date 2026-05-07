import { ENV } from '$lib/server/env.server.js';

export function getLegalGatewayUrl(): string {
  return ENV.LEGAL_GATEWAY_URL;
}

export function getQdrantUrl(): string {
  return ENV.QDRANT_URL;
}

export function getOllamaUrl(): string {
  return ENV.OLLAMA_BASE_URL;
}

export function getDatabaseUrl(): string {
  return ENV.DATABASE_URL;
}
