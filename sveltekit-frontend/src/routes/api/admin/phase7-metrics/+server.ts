import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Pool } from 'pg';
import Redis from 'ioredis';

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

export const GET: RequestHandler = async () => {
  try {
    // Fetch Postgres metrics
    const pgResult = await pgPool.query(`
      SELECT
        COUNT(*) AS total_summaries,
        COUNT(CASE WHEN updated_at > NOW() - INTERVAL '5 minutes' THEN 1 END) AS recent_5min,
        ROUND(COUNT(CASE WHEN updated_at > NOW() - INTERVAL '5 minutes' THEN 1 END) / 5.0, 2) AS summaries_per_min
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary <> ''
    `);

    const { total_summaries, recent_5min, summaries_per_min } = pgResult.rows[0] || {
      total_summaries: 0,
      recent_5min: 0,
      summaries_per_min: 0,
    };

    // Fetch Redis/Valkey cache metrics
    let bitfrost_keys = 0;
    let bitfrost_terms = 0;
    let redis_status: 'connected' | 'disconnected' = 'disconnected';

    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }

      // Count bitfrost:* keys
      const keys = await redis.scan(0, 'MATCH', 'bitfrost:*', 'COUNT', '10000');
      if (keys && keys[1]) {
        bitfrost_keys = keys[1].length;
      }

      // Count bitfrost:term:* keys (ngrams)
      const terms = await redis.scan(0, 'MATCH', 'bitfrost:term:*', 'COUNT', '1000');
      if (terms && terms[1]) {
        bitfrost_terms = terms[1].length;
      }

      redis_status = 'connected';
    } catch (err) {
      console.error('Redis error:', err);
      redis_status = 'disconnected';
    }

    // Check service health (simple probes)
    let postgres_status: 'connected' | 'disconnected' = 'connected';
    let gemma4_status: 'connected' | 'disconnected' = 'disconnected';

    try {
      const response = await fetch('http://127.0.0.1:8090/v1/models', {
        signal: AbortSignal.timeout(2000),
      });
      gemma4_status = response.ok ? 'connected' : 'disconnected';
    } catch (err) {
      gemma4_status = 'disconnected';
    }

    return json({
      total_summaries: parseInt(total_summaries || '0'),
      recent_5min: parseInt(recent_5min || '0'),
      summaries_per_min: parseFloat(summaries_per_min || '0'),
      bitfrost_keys: bitfrost_keys,
      bitfrost_terms: bitfrost_terms,
      llm_concurrency: 2, // Hardcoded in Phase 7 worker
      queue_depth: 0, // Can be queried if needed
      redis_status,
      postgres_status,
      gemma4_status,
      last_update: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Metrics error:', err);
    return json(
      {
        error: 'Failed to fetch metrics',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
