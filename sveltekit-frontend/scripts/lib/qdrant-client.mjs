/**
 * scripts/lib/qdrant-client.mjs
 *
 * Centralized Qdrant HTTP client for Node.js scripts.
 *
 * TRANSPORT: Forces IPv4 (family:4) to avoid QDRANT_HOST_IPV6_RELAY_COLLISION.
 * On Windows 10 + WSL2 + Docker Desktop, wslrelay squats on ::1:<port> while
 * Docker's backend owns :::port. Node's DNS resolver prefers ::1, hitting
 * wslrelay which RSTs the connection. family:4 bypasses this.
 *
 * CONNECTION REUSE: keepAlive agent (maxSockets:8) prevents TIME_WAIT storms
 * from bulk scrolls/patches that each open hundreds of short-lived sockets.
 *
 * Usage:
 *   import { qdrant } from '../lib/qdrant-client.mjs';
 *
 *   const collections = await qdrant.get('/collections');
 *   const result = await qdrant.post('/collections/foo/points/scroll', { limit: 100, with_payload: true });
 *   await qdrant.post('/collections/foo/points/payload', { points: ids, payload: { field: val } });
 */

import http from 'node:http';
import { env } from 'node:process';

// ── Configuration ─────────────────────────────────────────────────────────────

const QDRANT_URL = (env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');

// Parse host/port from URL to allow forced family:4
const _parsed = new URL(QDRANT_URL);
const QDRANT_HOST = _parsed.hostname;
const QDRANT_PORT = parseInt(_parsed.port || '6333', 10);

// ── IPv4-pinned keepalive agent ───────────────────────────────────────────────

export const qdrantAgent = new http.Agent({
  keepAlive: true,
  family: 4,           // force IPv4 — bypasses wslrelay on ::1
  maxSockets: 8,
  maxFreeSockets: 4,
  timeout: 30_000,
});

// ── Low-level request helper ──────────────────────────────────────────────────

function request(method, path, body, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const opts = {
      agent: qdrantAgent,
      hostname: QDRANT_HOST,
      port: QDRANT_PORT,
      family: 4,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error(`Qdrant ${method} ${path} — invalid JSON response (status ${res.statusCode})`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Qdrant ${method} ${path} — timeout after ${timeoutMs}ms`));
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export const qdrant = {
  /** GET /path → parsed JSON result */
  get: (path, timeoutMs) => request('GET', path, undefined, timeoutMs),

  /** POST /path with body → parsed JSON result */
  post: (path, body, timeoutMs) => request('POST', path, body, timeoutMs),

  /** PUT /path with body → parsed JSON result */
  put: (path, body, timeoutMs) => request('PUT', path, body, timeoutMs),

  /** DELETE /path → parsed JSON result */
  del: (path, timeoutMs) => request('DELETE', path, undefined, timeoutMs),

  /**
   * Scroll all points in a collection with automatic pagination.
   * Yields batches of points.
   *
   * @param {string} collection
   * @param {object} opts - { limit, withPayload, withVector, filter }
   * @yields {object[]} batch of points
   */
  async *scroll(collection, { limit = 200, withPayload = true, withVector = false, filter } = {}) {
    let offset = null;
    let guard = 0;
    while (guard++ < 2000) {
      const body = { limit, with_payload: withPayload, with_vector: withVector };
      if (offset !== null) body.offset = offset;
      if (filter) body.filter = filter;

      const res = await request('POST', `/collections/${collection}/points/scroll`, body, 30_000);
      const points = res?.result?.points ?? [];
      if (!points.length) break;
      yield points;

      const next = res?.result?.next_page_offset;
      if (next === null || next === undefined) break;
      offset = next;
    }
  },

  /**
   * Patch payload on a batch of point IDs.
   * Automatically chunks ids into batches of `chunkSize`.
   *
   * @param {string} collection
   * @param {(string|number)[]} ids
   * @param {object} payload
   * @param {number} [chunkSize=100]
   * @returns {Promise<{patched:number, failed:number}>}
   */
  async patchPayload(collection, ids, payload, chunkSize = 100) {
    let patched = 0, failed = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = ids.slice(i, i + chunkSize);
      try {
        const r = await request('POST', `/collections/${collection}/points/payload`, { points: batch, payload }, 20_000);
        if (r?.status === 'ok' || r?.result?.status === 'acknowledged') {
          patched += batch.length;
        } else {
          failed += batch.length;
        }
      } catch {
        failed += batch.length;
      }
    }
    return { patched, failed };
  },

  /** Health check — returns true if Qdrant responds */
  async healthz() {
    try {
      const r = await request('GET', '/healthz', undefined, 5_000);
      return r === 'healthz check passed' || typeof r === 'object';
    } catch {
      // Also try the raw string response
      return new Promise((resolve) => {
        const req = http.request({ agent: qdrantAgent, hostname: QDRANT_HOST, port: QDRANT_PORT, family: 4, path: '/healthz', method: 'GET' }, (res) => {
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => resolve(body.includes('healthz check passed')));
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => { req.destroy(); resolve(false); });
        req.end();
      });
    }
  },

  /** Base URL used (for logging) */
  get baseUrl() { return QDRANT_URL; },
};
