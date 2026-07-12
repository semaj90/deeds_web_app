/**
 * Qdrant Singleton Connection Pool
 *
 * All Qdrant operations must route through this singleton.
 * Do NOT instantiate QdrantClient or QdrantManager directly in route handlers.
 *
 * Pattern:
 *   import { qdrantClient } from '$lib/server/vector/qdrant-singleton.js';
 *   const results = await qdrantClient.search(...);
 *
 * Connection pool is automatically managed. Safe for concurrent requests.
 */

import { ENV } from '$lib/server/env.server.js';
import { QdrantClient } from '@qdrant/js-client-rest';

let _instance: QdrantClient | null = null;

/**
 * Get the singleton Qdrant client instance.
 * Lazy-initializes on first call.
 */
export function getQdrantClient(): QdrantClient {
  if (!_instance) {
    _instance = new QdrantClient({
      url: ENV.QDRANT_URL || 'http://127.0.0.1:6333',
      timeout: 30000,
      apiKey: ENV.QDRANT_API_KEY,
      // Connection pooling: reuse HTTP connections across requests
      // The Qdrant JS client uses node-fetch which handles pooling automatically
    });
  }
  return _instance;
}

/**
 * Alias for common usage pattern.
 */
export const qdrantClient = new Proxy(
  {},
  {
    get: (_target, prop) => {
      const client = getQdrantClient();
      return (client as any)[prop];
    },
  }
) as QdrantClient;
