/**
 * service-urls.ts — canonical service URL accessors
 *
 * Single import point for all service URLs. Wraps ENV from env.server.ts so
 * downstream files import here instead of duplicating dev-fallback defaults.
 * G17 compliance: all dev-fallback addresses live only in env.server.ts.
 */
import { ENV } from '$lib/server/env.server.js';
import { getOllamaEndpoint, getOllamaEmbeddingEndpoint } from '$lib/server/utils/ollama-endpoint.js';

export const serviceUrls = {
  // Core data stores
  redis:      ENV.REDIS_URL,
  qdrant:     ENV.QDRANT_URL,
  neo4j:      ENV.NEO4J_URI,
  postgres:   ENV.DATABASE_URL,
  couchdb:    ENV.COUCHDB_URL,
  rabbitmq:   ENV.RABBITMQ_URL,
  minio:      ENV.MINIO_ENDPOINT,

  // Inference cascade
  ollama:     getOllamaEndpoint(),
  ollamaEmbed: getOllamaEmbeddingEndpoint(),
  bifrost:    ENV.BIFROST_URL,
  turboquant: ENV.TURBOQUANT_BASE_URL,
  vlm:        ENV.VLM_BASE_URL,
  litert:     ENV.LITERT_BASE_URL,
  tensorrt:   ENV.TENSORRT_URL,
  triton:     ENV.TRITON_URL,

  // Graph / search
  searxng:    ENV.SEARXNG_URL,
  obsidian:   ENV.OBSIDIAN_URL,
  neo4jGds:   ENV.NEO4J_URI,

  // Misc services
  langfuse:   ENV.LANGFUSE_HOST,
  langextract: ENV.LANGEXTRACT_URL,
  topologySearch: ENV.TOPOLOGY_SEARCH_URL,
  retrievalHttp:  ENV.RETRIEVAL_HTTP_URL,
  legalGateway:   ENV.LEGAL_GATEWAY_URL,
  fastapi:        ENV.FASTAPI_URL,
} as const;
