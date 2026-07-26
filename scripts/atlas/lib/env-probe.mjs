/**
 * Environment probe — resolves connection credentials from .env files
 * with explicit override=true so dotenv wins over process environment.
 *
 * Returns typed connection parameters. Never logs secret values.
 *
 * Usage:
 *   import { probeEnv } from './lib/env-probe.mjs';
 *   const env = probeEnv();
 *   if (!env.postgres.password_present) throw new Error('PG password missing');
 */

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../sveltekit-frontend');

let _loaded = false;
function ensureLoaded() {
  if (_loaded) return;
  // override: true so .env.local wins over process environment
  dotenv.config({ path: join(ROOT, '.env') });
  dotenv.config({ path: join(ROOT, '.env.local'), override: true });
  _loaded = true;
}

export function probeEnv() {
  ensureLoaded();

  const pgPassword = process.env.DB_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const redisPassword = process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD;

  return {
    postgres: {
      host:             process.env.DB_HOST     || process.env.PGHOST     || '127.0.0.1',
      port:    parseInt(process.env.DB_PORT     || process.env.PGPORT     || '5434'),
      database:         process.env.DB_NAME     || process.env.PGDATABASE || 'legal_ai_db',
      user:             process.env.DB_USER     || process.env.PGUSER     || 'legal_admin',
      password:         pgPassword,
      password_present: !!pgPassword,
      password_source:  process.env.DB_PASSWORD ? 'DB_PASSWORD'
                      : process.env.PGPASSWORD  ? 'PGPASSWORD'
                      : process.env.POSTGRES_PASSWORD ? 'POSTGRES_PASSWORD'
                      : null,
    },
    redis: {
      host:             process.env.REDIS_HOST  || '127.0.0.1',
      port:    parseInt(process.env.REDIS_PORT  || '6379'),
      password:         redisPassword,
      password_present: !!redisPassword,
      password_source:  process.env.REDIS_PASSWORD  ? 'REDIS_PASSWORD'
                      : process.env.VALKEY_PASSWORD ? 'VALKEY_PASSWORD'
                      : null,
    },
    qdrant: {
      url:              process.env.QDRANT_URL  || 'http://127.0.0.1:6333',
      collection:       process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768',
      auth_mode:        'none',
    },
  };
}

/**
 * Returns a pg.Pool config object. Throws if password is not configured.
 */
export function pgConfig(overrides = {}) {
  const env = probeEnv();
  if (!env.postgres.password_present) {
    throw new Error(`PostgreSQL password is not configured. Set DB_PASSWORD or PGPASSWORD in .env.local`);
  }
  return {
    host:                    env.postgres.host,
    port:                    env.postgres.port,
    database:                env.postgres.database,
    user:                    env.postgres.user,
    password:                env.postgres.password,
    connectionTimeoutMillis: 15000,
    ...overrides,
  };
}

/**
 * Prints a redacted summary of resolved env — safe to log.
 */
export function printEnvSummary() {
  const env = probeEnv();
  console.log('Environment probe:');
  console.log(`  postgres: ${env.postgres.host}:${env.postgres.port}/${env.postgres.database} user=${env.postgres.user} pass_present=${env.postgres.password_present} source=${env.postgres.password_source}`);
  console.log(`  redis:    ${env.redis.host}:${env.redis.port} pass_present=${env.redis.password_present} source=${env.redis.password_source}`);
  console.log(`  qdrant:   ${env.qdrant.url} collection=${env.qdrant.collection}`);
}
