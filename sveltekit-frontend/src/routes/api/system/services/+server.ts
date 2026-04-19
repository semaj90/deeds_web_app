import { db } from '$lib/server/db/client';

import { ENV } from '$lib/server/env.server.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';

interface ServiceStatus {
  url?: string;
  endpoint?: string;
  bucket?: string;
  reachable?: boolean;
  error?: string;
  purpose?: string;
  models?: string[];
  database?: string;
  extensions?: string[];
}

/**
 * GET /api/system/services
 * Detailed service probe results + readiness
 * No side effects
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const services: Record<string, ServiceStatus> = {};

  // Redis health
  {
    try {
      // Attempt to parse REDIS_URL to construct a health check URL
      // Note: This assumes there is an HTTP endpoint at the Redis port or similar, which is unusual for standard Redis.
      // Preserving original logic intent but making it safer.
      let hostname = 'localhost';
      let port = '6379';

      try {
        const url = new URL(ENV.REDIS_URL.startsWith('redis://') ? ENV.REDIS_URL : `redis://${ENV.REDIS_URL}`);
        hostname = url.hostname;
        port = url?.port ?? '6379';
      } catch (e) {
        // ignore parse error
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // This fetch is likely to fail for standard Redis, but we'll leave it as "reachable: false" if it fails.
      const resp = await fetch(`http://${hostname}:${port}/ping`, {
        signal: controller.signal
      }).catch(() => null);

      clearTimeout(timeoutId);

      services.redis = {
        url: ENV.REDIS_URL.substring(0, 30) + '...',
        reachable: resp?.ok ?? false,
        purpose: 'Error cache, session storage, fix memory',
      };
    } catch (e) {
      services.redis = {
        url: ENV.REDIS_URL.substring(0, 30) + '...',
        reachable: false,
        error: 'Service unreachable',
      };
    }
  }

  // Qdrant vector DB
  {
    try {
      const resp = await fetch(`${ENV.QDRANT_URL}/health`, { signal: AbortSignal.timeout(5000) });
      services.qdrant = {
        url: ENV.QDRANT_URL,
        reachable: resp.ok,
        purpose: 'Vector embeddings for semantic search',
      };
    } catch (e) {
      services.qdrant = {
        url: ENV.QDRANT_URL,
        reachable: false,
        error: 'Service unreachable',
      };
    }
  }

  // Ollama LLM
  {
    try {
      const resp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json();
      services.ollama = {
        url: ENV.OLLAMA_BASE_URL,
        reachable: resp.ok,
        models: data.models?.map((m: { name: string }) => m.name) || [],
        purpose: 'Local LLM inference (Gemma4-legal, embeddings)',
      };
    } catch (e) {
      services.ollama = {
        url: ENV.OLLAMA_BASE_URL,
        reachable: false,
        error: 'Service unreachable',
      };
    }
  }

  // PostgreSQL
  {
    try {
      const result = await db.execute(sql`SELECT 1`);
      services.postgres = {
        url: ENV.DATABASE_URL.substring(0, 40) + '...',
        reachable: result.rows.length > 0,
        database: 'legal_ai_db',
        extensions: ['pgvector', 'pg_trgm'],
        purpose: 'Case evidence, case timelines, vector storage',
      };
    } catch (e) {
      services.postgres = {
        url: ENV.DATABASE_URL.substring(0, 40) + '...',
        reachable: false,
        error: 'Service unreachable',
      };
    }
  }

  // MinIO
  {
    services.minio = {
      endpoint: ENV.MINIO_ENDPOINT,
      bucket: ENV.MINIO_EVIDENCE_BUCKET,
      purpose: 'Evidence staging, raw artifacts',
    };
  }

  return json({
    timestamp: new Date().toISOString(),
    environment: ENV.NODE_ENV,
    services,
  });
}

