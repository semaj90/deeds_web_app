/**
 * Shared Redis Client Factory
 * Prevents environment variable parsing divergence across Atlas scripts
 *
 * CANONICAL SOURCE for Redis/Valkey connection patterns.
 * All Atlas scripts should import createAtlasRedisClient from this module.
 */

import Redis from 'ioredis';

/**
 * Vector lane registry: defines semantic meaning of each dimension
 * Used by retrieval, caching, and embedding stages to coordinate operations
 */
export const VECTOR_LANE_REGISTRY = {
  DENSE_768: {
    role: 'CANONICAL_SEMANTIC',
    dimensions: 768,
    authoritative: true,
    model: 'embeddinggemma',
    modelVersion: 'latest',
    onlineSearch: true,
    description: 'Primary semantic representation from embeddinggemma:latest'
  },
  DENSE_384_COMPACT: {
    role: 'ROUTING_PREFILTER',
    dimensions: 384,
    authoritative: false,
    model: 'nomic-embed-text-warden',
    modelVersion: 'optional',
    onlineSearch: false,
    description: 'Secondary routing cache for fast re-ranking (cost optimization)'
  },
  LATENT_64: {
    role: 'EXPERIMENTAL_COMPRESSION',
    dimensions: 64,
    authoritative: false,
    model: 'autoencoder',
    modelVersion: 'pending-training',
    onlineSearch: false,
    description: 'Experimental 768→64 latent compression (future MLA-style consumer)'
  }
};

/**
 * Create a new Atlas Redis client
 *
 * Configuration order (highest priority first):
 * 1. Function parameter overrides
 * 2. Environment variables (.env or docker-compose)
 * 3. Defaults (localhost:6379, no password)
 *
 * @param {Object} overrides - Optional config overrides
 * @param {string} overrides.host - Redis host (default: 127.0.0.1)
 * @param {number} overrides.port - Redis port (default: 6379)
 * @param {string} overrides.password - Redis password (default: from env)
 * @param {Object} overrides.ioredisOptions - Additional ioredis options
 * @returns {Redis} Configured ioredis client (not yet connected)
 */
export function createAtlasRedisClient(overrides = {}) {
  // Resolve host
  const host = overrides.host || process.env.REDIS_HOST || '127.0.0.1';

  // Resolve port with validation
  const portStr = overrides.port?.toString() || process.env.REDIS_PORT || '6379';
  const port = parseInt(portStr, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid REDIS_PORT: ${portStr}. Must be an integer between 1 and 65535. ` +
      `Set REDIS_PORT in .env or pass { port: <number> } to createAtlasRedisClient()`
    );
  }

  // Resolve password (optional)
  const password = overrides.password !== undefined
    ? overrides.password
    : process.env.REDIS_PASSWORD || undefined;

  // Log configuration (sanitize password in logs)
  const configLog = {
    host,
    port,
    passwordSet: !!password,
    source: {
      host: overrides.host ? 'override' : process.env.REDIS_HOST ? 'env' : 'default',
      port: overrides.port ? 'override' : process.env.REDIS_PORT ? 'env' : 'default',
      password: overrides.password ? 'override' : process.env.REDIS_PASSWORD ? 'env' : 'none'
    }
  };

  // Create client with standardized options
  const client = new Redis({
    host,
    port,
    password: password || undefined,

    // Connection behavior
    lazyConnect: true,        // Don't auto-connect; caller decides
    maxRetriesPerRequest: 1,  // Fail fast on transient issues
    enableOfflineQueue: false,// Catch errors immediately
    connectTimeout: 10_000,   // 10s to establish connection
    commandTimeout: 5_000,    // 5s per command

    // Retry policy
    retryStrategy: (times) => {
      if (times > 3) return null; // Stop after 3 attempts
      return Math.min(times * 100, 500); // Exponential backoff, max 500ms
    },

    // Error handling
    enableReadyCheck: true,
    enableOfflineQueue: false,

    // User-supplied overrides
    ...(overrides.ioredisOptions || {})
  });

  // Attach error handler to prevent unhandled rejections
  client.on('error', (err) => {
    const msg = err?.message ?? String(err);
    // Log but don't throw — caller decides error handling
    console.warn(`[Atlas Redis] Connection error: ${msg}`);
  });

  return client;
}

/**
 * Create a standalone connection (non-pooled) for one-off operations
 * Use sparingly; prefer connection pooling in production.
 *
 * @param {Object} overrides - Config overrides (same as createAtlasRedisClient)
 * @returns {Promise<Redis>} Connected client
 */
export async function createAndConnectAtlasRedisClient(overrides = {}) {
  const client = createAtlasRedisClient(overrides);

  try {
    await client.connect();
    return client;
  } catch (err) {
    await client.quit().catch(() => {});
    throw new Error(
      `Failed to connect to Redis at ${client.options.host}:${client.options.port}: ` +
      `${err?.message || String(err)}`
    );
  }
}

/**
 * Helper: verify a Redis client connection
 * @param {Redis} client - ioredis client
 * @returns {Promise<boolean>} true if healthy, false otherwise
 */
export async function verifyRedisConnection(client) {
  try {
    if (client.status === 'ready') return true;
    if (client.status === 'close' || client.status === 'end') return false;

    const response = await client.ping();
    return response === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Helper: get Redis configuration from environment
 * Useful for logging and diagnostics
 *
 * @returns {Object} Current Redis config (password sanitized in logs)
 */
export function getAtlasRedisConfig() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    passwordSet: !!process.env.REDIS_PASSWORD,
    environment: {
      REDIS_HOST: process.env.REDIS_HOST || 'not set',
      REDIS_PORT: process.env.REDIS_PORT || 'not set',
      REDIS_PASSWORD: process.env.REDIS_PASSWORD ? '***' : 'not set'
    }
  };
}

export default createAtlasRedisClient;
