#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import Redis from 'ioredis';

const PORT = Number(process.env.CUVS_BENCH_PORT ?? 8794);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve('.tmp/cuvs-benchmark-smoke-latest.json');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const { Pool } = pg;

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });

  const query = 'where is auth?';
  let degraded = false;
  const degradedReasons = [];

  let healthJson = {
    ok: false,
    healthy: false,
    enabled: false,
    cuvs_available: false,
    collection: 'codebase_chunks_768',
    qdrant_url: 'http://127.0.0.1:6333',
    backend: 'qdrant',
    dim: 768,
  };
  let benchJson = {
    ok: false,
    backend: 'qdrant',
    qdrant_ms: null,
    cuvs_ms: null,
    rank_ms: null,
    cuvs_available: false,
    enabled: false,
    collection: 'codebase_chunks_768',
    query,
    top_k: 8,
    notes: [],
    candidates: [],
  };
  let rankJson = {
    ok: false,
    backend: 'cpu-rank',
    rank_ms: null,
    ranked: [],
    enabled: false,
    cuvs_available: false,
  };

  try {
    const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2500) });
    if (!health.ok) {
      degraded = true;
      degradedReasons.push(`health_http_${health.status}`);
    } else {
      healthJson = await health.json();
    }
  } catch (err) {
    degraded = true;
    degradedReasons.push(`health_failed:${err.message}`);
  }

  try {
    const benchmark = await fetch(`${BASE}/benchmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK: 8 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!benchmark.ok) {
      degraded = true;
      degradedReasons.push(`benchmark_http_${benchmark.status}`);
    } else {
      benchJson = await benchmark.json();
    }
  } catch (err) {
    degraded = true;
    degradedReasons.push(`benchmark_failed:${err.message}`);
  }

  try {
    const ranked = await fetch(`${BASE}/rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        candidates: benchJson.candidates ?? [],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!ranked.ok) {
      degraded = true;
      degradedReasons.push(`rank_http_${ranked.status}`);
    } else {
      rankJson = await ranked.json();
    }
  } catch (err) {
    degraded = true;
    degradedReasons.push(`rank_failed:${err.message}`);
  }

  if (!healthJson.healthy || !healthJson.cuvs_available) {
    degraded = true;
    if (!healthJson.healthy) degradedReasons.push('sidecar_unhealthy');
    if (!healthJson.cuvs_available) degradedReasons.push('cuvs_unavailable');
  }

  const degradedReason = degradedReasons.length > 0 ? degradedReasons.join(';') : 'none';

  const out = {
    health: healthJson,
    benchmark: benchJson,
    rank: rankJson,
    timestamp: new Date().toISOString(),
    degraded,
    degradedReason,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2));
  await persistTrace(out);
  console.log(`[cuvs-smoke] wrote ${OUT}`);
  console.log(`[cuvs-smoke] backend=${healthJson.backend} cuvs_available=${healthJson.cuvs_available}`);
  console.log(`[cuvs-smoke] qdrant_ms=${benchJson.qdrant_ms ?? 'n/a'} rank_ms=${rankJson.rank_ms ?? 'n/a'}`);
}

function stableTraceKey(out) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      query: out?.benchmark?.query ?? 'where is auth?',
      topK: out?.benchmark?.top_k ?? 0,
      backend: out?.health?.backend ?? 'qdrant',
      collection: out?.health?.collection ?? 'codebase_chunks_768',
      timestamp: out?.timestamp ?? '',
    }))
    .digest('hex')
    .slice(0, 24);
  return `cuvs:benchmark:${digest}`;
}

async function persistTrace(out) {
  const traceKey = stableTraceKey(out);
  const payload = JSON.stringify(out);
  const traceSummary = [
    `backend=${out?.health?.backend ?? 'qdrant'}`,
    `cuvs_available=${Boolean(out?.health?.cuvs_available)}`,
    `qdrant_ms=${out?.benchmark?.qdrant_ms ?? 'n/a'}`,
    `rank_ms=${out?.rank?.rank_ms ?? 'n/a'}`,
    `degraded=${Boolean(out?.degraded)}`,
    `degraded_reason=${out?.degradedReason ?? 'none'}`,
  ].join(' ');

  try {
    const redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    await redis.connect();
    await redis.set('cuvs:benchmark:latest', payload, 'EX', 86_400);
    await redis.set(traceKey, payload, 'EX', 86_400);
    await redis.hset('cuvs:benchmark:latest:meta', {
      traceKey,
      backend: String(out?.health?.backend ?? 'qdrant'),
      cuvs_available: String(Boolean(out?.health?.cuvs_available)),
      qdrant_ms: String(out?.benchmark?.qdrant_ms ?? ''),
      rank_ms: String(out?.rank?.rank_ms ?? ''),
      degraded: String(Boolean(out?.degraded)),
      degraded_reason: String(out?.degradedReason ?? 'none'),
      updated_at: new Date().toISOString(),
    });
    await redis.disconnect();
  } catch (err) {
    console.warn(`[cuvs-smoke] redis persist skipped: ${err?.message ?? err}`);
  }

  try {
    const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
    await pool.query(
      `INSERT INTO llm_context_cache (
        cache_key,
        model_name,
        model_quant,
        backend,
        tokenizer_hash,
        system_prompt_hash,
        tool_definitions_hash,
        repo_git_sha,
        corpus_hash,
        rag_bundle_hash,
        graph_snapshot_hash,
        context_pack_json,
        summary,
        chunk_ids,
        graph_paths,
        tool_policy,
        estimated_prefix_tokens,
        hit_count,
        created_at,
        last_used_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, now(), now()
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        model_name = EXCLUDED.model_name,
        model_quant = EXCLUDED.model_quant,
        backend = EXCLUDED.backend,
        context_pack_json = EXCLUDED.context_pack_json,
        summary = EXCLUDED.summary,
        last_used_at = now()`,
      [
        traceKey,
        'cuvs-benchmark',
        out?.health?.backend ?? 'qdrant',
        out?.health?.backend ?? 'qdrant',
        'benchmark',
        'benchmark',
        'benchmark',
        null,
        null,
        null,
        null,
        JSON.stringify(out),
        traceSummary,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify({ allowed: ['qdrant.search', 'cuvs.search'], forbidden: ['raw_full_file_dump'] }),
        0,
        0,
      ],
    );
    await pool.end();
  } catch (err) {
    console.warn(`[cuvs-smoke] postgres persist skipped: ${err?.message ?? err}`);
  }
}

main().catch((err) => {
  console.error(`[cuvs-smoke] failed: ${err.message}`);
  process.exit(1);
});
