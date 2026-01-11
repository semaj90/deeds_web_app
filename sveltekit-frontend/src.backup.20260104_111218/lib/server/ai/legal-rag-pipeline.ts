import { RedisClientType } from 'redis';

/** Ollama endpoint helper shared across services */
export function getOllamaEndpoint(): string {
 return (process.env.OLLAMA_URL || 'http://ollama:11434').replace(/\/$/, '');
}

/** Active models */
export const EMBEDDING_MODEL = process.env.OLLAMA_EMBED_MODEL || 'embeddinggemma:latest';
export const LLM_MODEL = process.env.OLLAMA_LLM_MODEL || 'gemma3-legal:latest';
export const OLLAMA_BASE_URL = getOllamaEndpoint();

/**
 * Type guard to ensure Redis client is available.
 * @param client The Redis client instance.
 * @throws Error if the client is null or undefined.
 */
export function requireRedis(client: unknown): asserts client is RedisClientType {
 if (!client) {
 throw new Error('Redis client unavailable');
 }
}
