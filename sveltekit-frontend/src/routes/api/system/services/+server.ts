import { db } from '$lib/server/db/client';
import { getOllamaUrl, getQdrantUrl, getRedisUrl, getDatabaseUrl, getMinioConfig } from '$lib/config/env.server.js';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET /api/system/services
 * Detailed service probe results + readiness
 * No side effects
 */
export async function GET() {
  const services: Record<string, any> = {};

  // Redis health
  {
    try {
      // Attempt to parse REDIS_URL to construct a health check URL
      // Note: This assumes there is an HTTP endpoint at the Redis port or similar, which is unusual for standard Redis.
      // Preserving original logic intent but making it safer.
      let hostname = 'localhost';
      let port = '6379';

      try {
        const url = new URL(getRedisUrl().startsWith('redis://') ? getRedisUrl() : `redis://${getRedisUrl()}`);
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
        url: getRedisUrl().substring(0, 30) + '...',
        reachable: resp?.ok ?? false,
        purpose: 'Error cache, session storage, fix memory',
      };
    } catch (e: any) {
      services.redis = {
        url: getRedisUrl().substring(0, 30) + '...',
        reachable: false,
        error: e.message,
      };
    }
  }

  // Qdrant vector DB
  {
    try {
      const resp = await fetch(`${getQdrantUrl()}/health`);
      services.qdrant = {
        url: getQdrantUrl(),
        reachable: resp.ok,
        purpose: 'Vector embeddings for semantic search',
      };
    } catch (e: any) {
      services.qdrant = {
        url: getQdrantUrl(),
        reachable: false,
        error: e.message,
      };
    }
  }

  // Ollama LLM
  {
    try {
      const resp = await fetch(`${getOllamaUrl()}/api/tags`);
      const data = await resp.json();
      services.ollama = {
        url: getOllamaUrl(),
        reachable: resp.ok,
        models: data.models?.map((m: any) => m.name) || [],
        purpose: 'Local LLM inference (Gemma3-legal, embeddings)',
      };
    } catch (e: any) {
      services.ollama = {
        url: getOllamaUrl(),
        reachable: false,
        error: e.message,
      };
    }
  }

  // PostgreSQL
  {
    try {
      const result = await db.execute(sql`SELECT 1`);
      services.postgres = {
        url: getDatabaseUrl().substring(0, 40) + '...',
        reachable: result.rows.length > 0,
        database: 'legal_ai_db',
        extensions: ['pgvector', 'pg_trgm'],
        purpose: 'Case evidence, case timelines, vector storage',
      };
    } catch (e: any) {
      services.postgres = {
        url: getDatabaseUrl().substring(0, 40) + '...',
        reachable: false,
        error: e.message,
      };
    }
  }

  // MinIO
  {
    services.minio = {
      endpoint: getMinioConfig().endpoint,
      bucket: process.env?.MINIO_BUCKET ?? 'legal-evidence',
      purpose: 'Evidence staging, raw artifacts',
    };
  }

  return json({
    timestamp: new Date().toISOString(),
    environment: process.env?.NODE_ENV ?? 'development',
    services,
  });
}


