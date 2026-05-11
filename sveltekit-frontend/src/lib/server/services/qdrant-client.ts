/**
 * Qdrant Client - lightweight wrapper for vector operations
 * Used by drizzle.ts for hybrid vector search and embedding storage
 */

import { ENV } from '$lib/server/env.server.js';
import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = ENV.QDRANT_URL;

let client: QdrantClient | null = null;

function getClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({ url: QDRANT_URL });
  }
  return client;
}

const qdrantClient = {
  async search(params: {
    collectionName: string;
    vector: number[];
    limit?: number;
    filter?: Record<string, unknown>;
  }): Promise<unknown[]> {
    try {
      const results = await getClient().search(params.collectionName, {
        vector: params.vector,
        limit: params.limit ?? 10,
        filter: params.filter as any,
        with_payload: true,
      });
      return results;
    } catch (err) {
      console.warn('[qdrant-client] Search failed:', err);
      return [];
    }
  },

  async upsert(params: {
    collectionName: string;
    points: Array<{ id: string; vector: number[]; payload?: Record<string, unknown> }>;
  }): Promise<void> {
    try {
      await getClient().upsert(params.collectionName, {
        wait: true,
        points: params.points,
      });
    } catch (err) {
      console.warn('[qdrant-client] Upsert failed:', err);
    }
  },
};

export default qdrantClient;