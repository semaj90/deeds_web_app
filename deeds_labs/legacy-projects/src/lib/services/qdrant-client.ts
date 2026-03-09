/**
 * Resilient Qdrant client
 *
 * - Tries to import @qdrant/js-client-rest dynamically (if installed)
 * - Falls back to HTTP REST calls using fetch
 *
 * Exports a factory that returns an object with methods:
 *  - search(collection, { vector, limit, with_payload, filter })
 *  - getCollections()
 *  - createCollection(name, config)
 *  - upsert(collection, points)
 */

import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';

function httpHeaders() {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (QDRANT_API_KEY) h['Authorization'] = `ApiKey ${QDRANT_API_KEY}`;
  return h;
}

function httpClient() {
  return {
    async search(collection: string, opts: any) {
      // opts: { vector, limit, with_payload, filter }
      const body: any = {
        vector: opts.vector,
        limit: opts.limit,
        with_payload: opts.with_payload !== false,
      };
      if (opts.filter) body.filter = opts.filter;
      const url = `${QDRANT_URL}/collections/${encodeURIComponent(collection)}/points/search`;
      const res = await fetch(url, {
        method: 'POST',
        headers: httpHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Qdrant HTTP search failed: ${res.status} ${await res.text()}`);
      const json: any = await res.json();
      // transform to SDK-like shape
      return (json.result || []).map((r: any) => ({
        id: r.id,
        score: r.score ?? (r.payload && r.payload._score) ?? 0,
        payload: r.payload,
      }));
    },

    async getCollections() {
      const url = `${QDRANT_URL}/collections`;
      const res = await fetch(url, { headers: httpHeaders() });
      if (!res.ok) throw new Error(`Qdrant HTTP getCollections failed: ${res.status}`);
      return res.json();
    },

    async createCollection(name: string, cfg: any) {
      const url = `${QDRANT_URL}/collections/${encodeURIComponent(name)}`;
      const body = { vectors: cfg.vectors ?? cfg, params: cfg.params ?? {} };
      const res = await fetch(url, {
        method: 'PUT',
        headers: httpHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok)
        throw new Error(`Qdrant HTTP createCollection failed: ${res.status} ${await res.text()}`);
      return res.json();
    },

    async createPayloadIndex(collection: string, field: string, type: string) {
      // v1.11+ supports payload index endpoints; ignore if not supported
      try {
        const url = `${QDRANT_URL}/collections/${encodeURIComponent(collection)}/index`;
        const res = await fetch(url, {
          method: 'POST',
          headers: httpHeaders(),
          body: JSON.stringify({ payload_schema: { [field]: { type } } }),
        });
        if (!res.ok) throw new Error(`createPayloadIndex failed: ${res.status}`);
        return res.json();
      } catch (e) {
        return null;
      }
    },

    async upsert(collection: string, points: any[]) {
      const url = `${QDRANT_URL}/collections/${encodeURIComponent(collection)}/points?wait=true`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: httpHeaders(),
        body: JSON.stringify({ points }),
      });
      if (!res.ok) throw new Error(`Qdrant upsert failed: ${res.status} ${await res.text()}`);
      return res.json();
    },
  };
}

export default function createClient() {
  // Try dynamic import of SDK
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sdk = require('@qdrant/js-client-rest');
    if (sdk && sdk.QdrantClient) {
      const client = new sdk.QdrantClient({
        url: QDRANT_URL,
        apiKey: QDRANT_API_KEY,
      });
      return {
        async search(collection: string, opts: any) {
          // SDK variant expects vector in "vector" param or filter object
          const res = await client.search(collection, {
            vector: opts.vector,
            limit: opts.limit ?? 10,
            filter: opts.filter,
            withPayload: opts.with_payload !== false,
          });
          return (res.result || []).map((r: any) => ({
            id: r.id,
            score: r.score ?? r.payload?._score ?? 0,
            payload: r.payload,
          }));
        },
        getCollections: async () => await client.getCollections(),
        createCollection: async (name: string, cfg: any) =>
          await client.createCollection(name, cfg),
        createPayloadIndex: async (collection: string, field: string, type: string) => {
          if (typeof client.createPayloadIndex === 'function')
            return await client.createPayloadIndex(collection, {
              field_name: field,
              field_schema: { type },
            });
          return null;
        },
        upsert: async (collection: string, points: any[]) =>
          await client.upsert(collection, { points }),
      };
    }
  } catch {
    // fallback to HTTP client
  }

  return httpClient();
}
