#!/usr/bin/env npx tsx
/**
 * preflight.ts — Validate all service dependencies before summarize-clusters-pg.ts runs.
 *
 * Checks (in order, fail-fast):
 *   1. Postgres — connect + verify expected DB name + table existence
 *   2. Ollama — reachability
 *   3. Model availability — chat model + embed model
 *   4. Redis — optional, warn only
 *
 * Usage:
 *   npx tsx scripts/preflight.ts                  # standalone check
 *   import { runPreflight } from './preflight.js'  # programmatic use
 */

import pg from 'pg';

// ── Config (same env vars as summarize-clusters-pg.ts) ────────────────────

const PG_URL      = process.env.DATABASE_URL      ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const OLLAMA_URL  = process.env.OLLAMA_URL         ?? 'http://localhost:11434';
const MODEL       = process.env.OLLAMA_MODEL       ?? 'gemma4-rotorquant:latest';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const REDIS_URL   = process.env.REDIS_URL          ?? 'redis://localhost:6379';

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    postgres: boolean;
    ollamaReachable: boolean;
    chatModel: boolean;
    embedModel: boolean;
    redis: boolean | null; // null = not checked
  };
}

// ── Individual checks ──────────────────────────────────────────────────────

async function assertPostgres(url: string): Promise<{ ok: boolean; error?: string }> {
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const client = await pool.connect();
    try {
      // Verify we're on the right DB and the expected tables exist
      const { rows: dbRow } = await client.query('SELECT current_database() AS db');
      const dbName = dbRow[0]?.db as string;
      if (!dbName.includes('legal_ai')) {
        return { ok: false, error: `Connected to unexpected database "${dbName}". Check DATABASE_URL.` };
      }

      // Check port from connection string
      const portMatch = url.match(/:(\d{4,5})\//);
      const port = portMatch ? portMatch[1] : 'unknown';
      if (port === '5434') {
        return { ok: false, error: `DATABASE_URL uses port 5434 (test/proxy port). Use port 5432 for primary Postgres.` };
      }

      // Verify required tables
      const { rows: tables } = await client.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('codebase_chunk_index', 'cluster_summaries')
      `);
      const found = new Set(tables.map((r: any) => r.tablename));
      const missing = ['codebase_chunk_index', 'cluster_summaries'].filter(t => !found.has(t));
      if (missing.length > 0) {
        return { ok: false, error: `Missing required tables: ${missing.join(', ')}. Run DB migrations first.` };
      }

      return { ok: true };
    } finally {
      client.release();
      await pool.end();
    }
  } catch (e: any) {
    await pool.end().catch(() => {});
    const msg = e.message ?? String(e);
    if (msg.includes('ECONNREFUSED')) {
      const portMatch = url.match(/:(\d{4,5})\//);
      return { ok: false, error: `Postgres refused connection on port ${portMatch?.[1] ?? 'unknown'}. Is Postgres running?` };
    }
    return { ok: false, error: `Postgres connection failed: ${msg}` };
  }
}

async function assertOllama(baseUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { ok: false, error: `Ollama returned HTTP ${res.status} on /api/tags` };
    return { ok: true };
  } catch (e: any) {
    const msg = e.message ?? String(e);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
      return { ok: false, error: `Ollama not reachable at ${baseUrl}. Is Ollama running?` };
    }
    return { ok: false, error: `Ollama health check failed: ${msg}` };
  }
}

async function assertModel(baseUrl: string, modelName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return { ok: false, error: `Could not list models: HTTP ${res.status}` };
    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = data.models ?? [];
    const found = models.some(m => m.name === modelName || m.name.startsWith(modelName.split(':')[0]));
    if (!found) {
      const available = models.map(m => m.name).join(', ') || '(none)';
      return { ok: false, error: `Model "${modelName}" not found. Available: ${available}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Model check failed for "${modelName}": ${(e as Error).message}` };
  }
}

async function assertRedis(redisUrl: string): Promise<{ ok: boolean; warning?: string }> {
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3_000)),
    ]);
    await client.disconnect().catch(() => {});
    return { ok: true };
  } catch {
    return { ok: false, warning: `Redis not reachable at ${redisUrl} — cache disabled (non-fatal)` };
  }
}

// ── Main preflight runner ──────────────────────────────────────────────────

export async function runPreflight(opts?: {
  pgUrl?: string;
  ollamaUrl?: string;
  model?: string;
  embedModel?: string;
  redisUrl?: string;
  skipRedis?: boolean;
}): Promise<PreflightResult> {
  const pgUrl      = opts?.pgUrl      ?? PG_URL;
  const ollamaUrl  = opts?.ollamaUrl  ?? OLLAMA_URL;
  const model      = opts?.model      ?? MODEL;
  const embedModel = opts?.embedModel ?? EMBED_MODEL;
  const redisUrl   = opts?.redisUrl   ?? REDIS_URL;
  const skipRedis  = opts?.skipRedis  ?? false;

  const errors: string[] = [];
  const warnings: string[] = [];
  const checks = {
    postgres: false,
    ollamaReachable: false,
    chatModel: false,
    embedModel: false,
    redis: null as boolean | null,
  };

  // 1. Postgres (fatal)
  const pgResult = await assertPostgres(pgUrl);
  checks.postgres = pgResult.ok;
  if (!pgResult.ok) errors.push(pgResult.error!);

  // 2. Ollama reachability (fatal)
  const ollamaResult = await assertOllama(ollamaUrl);
  checks.ollamaReachable = ollamaResult.ok;
  if (!ollamaResult.ok) {
    errors.push(ollamaResult.error!);
    // No point checking models if Ollama is down
    return { ok: false, errors, warnings, checks };
  }

  // 3. Chat model (fatal)
  const chatResult = await assertModel(ollamaUrl, model);
  checks.chatModel = chatResult.ok;
  if (!chatResult.ok) errors.push(chatResult.error!);

  // 4. Embed model (fatal)
  const embedResult = await assertModel(ollamaUrl, embedModel);
  checks.embedModel = embedResult.ok;
  if (!embedResult.ok) errors.push(embedResult.error!);

  // 5. Redis (warn-only)
  if (!skipRedis) {
    const redisResult = await assertRedis(redisUrl);
    checks.redis = redisResult.ok;
    if (!redisResult.ok) warnings.push(redisResult.warning!);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}

// ── CLI entrypoint ────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('preflight.ts') ||
    process.argv[1]?.endsWith('preflight.js')) {
  const result = await runPreflight();

  console.log('\n=== Preflight Check ===');
  console.log(`Postgres:       ${result.checks.postgres     ? '✓' : '✗'}`);
  console.log(`Ollama:         ${result.checks.ollamaReachable ? '✓' : '✗'}`);
  console.log(`Chat model:     ${result.checks.chatModel    ? '✓' : '✗'}  (${MODEL})`);
  console.log(`Embed model:    ${result.checks.embedModel   ? '✓' : '✗'}  (${EMBED_MODEL})`);
  console.log(`Redis:          ${result.checks.redis === null ? '—' : result.checks.redis ? '✓' : '⚠ (non-fatal)'}`);

  if (result.warnings.length) {
    console.log('\nWarnings:');
    for (const w of result.warnings) console.warn(`  ⚠ ${w}`);
  }

  if (!result.ok) {
    console.error('\nPreflight FAILED — fix these before running summarize-clusters-pg.ts:');
    for (const e of result.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log('\nPreflight PASSED ✓\n');
}
