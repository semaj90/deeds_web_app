/**
 * Server-side wrapper for canonical local model endpoint helpers.
 *
 * Keep this file explicit instead of a pure re-export chain so tsgo can
 * resolve the named exports consistently across the app checkout.
 */

import '$lib/server/env.server.js';

import {
  getOllamaApiEndpoint as getSharedOllamaApiEndpoint,
  getOllamaChatEndpoint as getSharedOllamaChatEndpoint,
  getOllamaEmbeddingEndpoint as getSharedOllamaEmbeddingEndpoint,
  getOllamaEndpoint as getSharedOllamaEndpoint,
  getOllamaGenerationEndpoint as getSharedOllamaGenerationEndpoint,
} from '$lib/utils/ollama-endpoint.js';

export function getOllamaEndpoint(): string {
  return getSharedOllamaEndpoint();
}

export function getOllamaChatEndpoint(): string {
  return getSharedOllamaChatEndpoint();
}

export function getOllamaEmbeddingEndpoint(): string {
  return getSharedOllamaEmbeddingEndpoint();
}

export function getOllamaGenerationEndpoint(): string {
  return getSharedOllamaGenerationEndpoint();
}

export function getOllamaApiEndpoint(type: 'generate' | 'delete' | 'list' | 'show' | string): string {
  return getSharedOllamaApiEndpoint(type);
}
