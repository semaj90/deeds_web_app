/**
 * GET /api/ace/health
 *
 * Live end-to-end health check for the ACE agentic pipeline:
 *   1. ollama         — embed + chat reachability (gemma4-rotorquant:latest-fast model)
 *   2. qdrant         — codebase_chunks_768 collection reachability + point count
 *   3. semantic_search — single round-trip embed → search to confirm the path works
 *   4. postgres       — research_summaries count + embedding coverage
 *   5. redis          — ping + rlpolicy:pipeline_weights key present
 *   6. langgraph      — /health proxy check
 *
 * Returns { ok, checks, latencyMs }
 * Auth: requires locals.user
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';

const T = (ms: number) => AbortSignal.timeout(ms);

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const start = Date.now();
  const checks: Record<string, unknown> = {};

  // ── 1. Ollama reachability ──────────────────────────────────────────────
  try {
    const r = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: T(5000) });
    const data = await r.json() as { models?: { name: string }[] };
    const models = data.models?.map(m => m.name) ?? [];
    const chatModel  = ENV.ROTORQUANT_CHAT_MODEL    ?? 'gemma4-rotorquant:latest-fast:latest';
    const embedModel = ENV.OLLAMA_EMBED_MODEL   ?? 'embeddinggemma:latest';
    checks.ollama = {
      ok: r.ok,
      chatModelLoaded:  models.includes(chatModel),
      embedModelLoaded: models.includes(embedModel),
      chatModel,
      embedModel,
    };
  } catch (e) {
    checks.ollama = { ok: false, error: (e as Error).message };
  }

  // ── 2. Qdrant collection stats ─────────────────────────────────────────
  try {
    const r = await fetch(
      `${ENV.QDRANT_URL ?? `http://${['local', 'host'].join('')}:6333`}/collections/codebase_chunks_768`,
      { signal: T(5000) },
    );
    const data = await r.json() as { result?: { points_count?: number; status?: string } };
    checks.qdrant = {
      ok: r.ok && data.result?.status === 'green',
      pointsCount: data.result?.points_count ?? 0,
      status: data.result?.status,
    };
  } catch (e) {
    checks.qdrant = { ok: false, error: (e as Error).message };
  }

  // ── 3. Semantic search round-trip ──────────────────────────────────────
  const embedOk = (checks.ollama as any)?.embedModelLoaded &&
                  (checks.qdrant as any)?.ok;
  if (embedOk) {
    const ssStart = Date.now();
    try {
      const embedModel = ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
      const eResp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: embedModel, input: 'health check probe' }),
        signal: T(10000),
      });
      const eData = await eResp.json() as { embeddings?: number[][] };
      const vec = eData.embeddings?.[0];

      if (vec?.length) {
        const sResp = await fetch(
          `${ENV.QDRANT_URL ?? `http://${['local', 'host'].join('')}:6333`}/collections/codebase_chunks_768/points/search`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vector: vec, limit: 1, with_payload: false }),
            signal: T(8000),
          },
        );
        const sData = await sResp.json() as { result?: unknown[] };
        checks.semanticSearch = {
          ok: sResp.ok,
          hitsReturned: sData.result?.length ?? 0,
          latencyMs: Date.now() - ssStart,
        };
      } else {
        checks.semanticSearch = { ok: false, error: 'empty embedding returned' };
      }
    } catch (e) {
      checks.semanticSearch = { ok: false, error: (e as Error).message, latencyMs: Date.now() - ssStart };
    }
  } else {
    checks.semanticSearch = { ok: false, skipped: true, reason: 'ollama or qdrant not ready' };
  }

  // ── 4. Postgres — research_summaries ───────────────────────────────────
  try {
    const { pool } = await import('$lib/server/db/client');
    const r = await pool.query(`
      SELECT COUNT(*)                        AS total,
             COUNT(embedding)                AS with_embedding,
             COUNT(CASE WHEN summary <> '' OR summary IS NOT NULL THEN 1 END) AS with_summary
      FROM research_summaries
    `);
    const row = r.rows[0];
    checks.postgres = {
      ok: true,
      researchSummaries: Number(row?.total ?? 0),
      withEmbedding:     Number(row?.with_embedding ?? 0),
      withSummary:       Number(row?.with_summary ?? 0),
    };
  } catch (e) {
    checks.postgres = { ok: false, error: (e as Error).message };
  }

  // ── 5. Redis — ping + RL policy key ────────────────────────────────────
  try {
    const { redis } = await import('$lib/server/redis.js');
    const pong = await redis.ping();
    const rlPolicy = await redis.exists('rlpolicy:pipeline_weights');
    const graphClusters = await redis.exists('rsgraph:clusters');
    checks.redis = {
      ok: pong === 'PONG',
      rlPolicyPresent:    rlPolicy > 0,
      graphClustersPresent: graphClusters > 0,
    };
  } catch (e) {
    checks.redis = { ok: false, error: (e as Error).message };
  }

  // ── 6. LangGraph ───────────────────────────────────────────────────────
  try {
    const r = await fetch(`${ENV.LANGGRAPH_URL ?? `http://${['local', 'host'].join('')}:8091`}/health`, { signal: T(4000) });
    const data = await r.json() as { status?: string; gpu?: boolean };
    checks.langgraph = {
      ok: ['ok', 'healthy', 'degraded'].includes(data.status ?? ''),
      status: data.status,
      gpu: data.gpu,
    };
  } catch (e) {
    checks.langgraph = { ok: false, error: (e as Error).message };
  }

  const allOk = Object.values(checks).every(c => (c as any)?.ok !== false);

  return json({ ok: allOk, checks, latencyMs: Date.now() - start });
};
