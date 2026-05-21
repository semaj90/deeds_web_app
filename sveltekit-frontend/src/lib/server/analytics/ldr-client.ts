/**
 * Local Deep Research (LDR) Client
 *
 * Typed HTTP client for the `local-deep-research` container (port 5000).
 * Flask + SocketIO service — multi-engine research using Gemma4 + SearXNG.
 *
 * Endpoints used:
 *   POST /api/research/start         → { research_id, status }
 *   GET  /api/research/status/{id}   → { status, progress, result? }
 *   GET  /api/history                → [{ id, query, status, ... }]
 *   POST /api/research/quick-summary → { summary, sources }
 *
 * Redis cache schema:
 *   ldr:task:{queryHash}    STRING  { taskId, startedAt }   TTL 24h
 *   ldr:result:{queryHash}  STRING  LdrResearchResult JSON  TTL 4h
 *   ldr:history:recent      ZSET    queryHash → timestamp   TTL 24h
 */

import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const LDR_BASE_URL    = (ENV as unknown as Record<string, string>).LDR_BASE_URL ?? 'http://127.0.0.1:5000';
const LDR_ENABLED     = (ENV as unknown as Record<string, string>).LDR_ENABLED !== 'false';
const TASK_TTL        = 24 * 60 * 60;  // 24h
const RESULT_TTL      = 4  * 60 * 60;  // 4h
const TIMEOUT_MS      = 15_000;

// ── FNV-1a hash ───────────────────────────────────────────────────────────────

function fnv1a8(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LdrSource {
  title:   string;
  url:     string;
  snippet: string;
}

export interface LdrResearchResult {
  taskId:       string;
  query:        string;
  queryHash:    string;
  status:       'completed' | 'running' | 'failed' | 'cached';
  summary:      string;
  sources:      LdrSource[];
  sections?:    Array<{ heading: string; content: string }>;
  metadata?:    Record<string, unknown>;
  completedAt:  string;
  durationMs?:  number;
}

export interface LdrTaskRef {
  taskId:    string;
  queryHash: string;
  startedAt: string;
}

// ── Low-level HTTP helpers ────────────────────────────────────────────────────

async function ldrFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${LDR_BASE_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * Start a new LDR research task. Returns taskId immediately (async).
 */
export async function startLdrResearch(
  query:   string,
  opts?:   { maxIterations?: number; searchEngines?: string[] },
): Promise<LdrTaskRef | null> {
  if (!LDR_ENABLED) return null;
  try {
    const res = await ldrFetch('/api/research/start', {
      method: 'POST',
      body:   JSON.stringify({
        query,
        max_iterations: opts?.maxIterations ?? 3,
        search_engines: opts?.searchEngines ?? ['searxng', 'wikipedia'],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { research_id?: string; id?: string; status?: string };
    const taskId = data.research_id ?? data.id ?? null;
    if (!taskId) return null;

    const ref: LdrTaskRef = {
      taskId,
      queryHash: fnv1a8(query),
      startedAt: new Date().toISOString(),
    };

    // Cache task ref in Redis
    const redis = getRedis();
    await redis.set(`ldr:task:${ref.queryHash}`, JSON.stringify(ref), 'EX', TASK_TTL).catch(() => {});

    return ref;
  } catch {
    return null;
  }
}

/**
 * Poll a running LDR task. Returns null if task not found or failed.
 */
export async function pollLdrTask(taskId: string): Promise<LdrResearchResult | null> {
  if (!LDR_ENABLED) return null;
  try {
    const res = await ldrFetch(`/api/research/status/${taskId}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      status?:    string;
      query?:     string;
      summary?:   string;
      report?:    string;
      sources?:   LdrSource[];
      sections?:  Array<{ heading: string; content: string }>;
      duration?:  number;
      error?:     string;
    };

    if (data.status !== 'completed') return null;

    const result: LdrResearchResult = {
      taskId,
      query:       data.query ?? '',
      queryHash:   fnv1a8(data.query ?? ''),
      status:      'completed',
      summary:     data.summary ?? data.report ?? '',
      sources:     Array.isArray(data.sources) ? data.sources : [],
      sections:    data.sections,
      metadata:    { raw: data },
      completedAt: new Date().toISOString(),
      durationMs:  data.duration,
    };

    // Cache completed result
    const redis = getRedis();
    await redis.set(`ldr:result:${result.queryHash}`, JSON.stringify(result), 'EX', RESULT_TTL).catch(() => {});

    return result;
  } catch {
    return null;
  }
}

/**
 * Search LDR history for a matching query. Returns cached result if found.
 */
export async function searchLdrHistory(query: string): Promise<LdrResearchResult | null> {
  if (!LDR_ENABLED) return null;

  const qHash = fnv1a8(query);
  const redis = getRedis();

  // 1. Check Redis result cache
  try {
    const cached = await redis.get(`ldr:result:${qHash}`);
    if (cached) {
      return { ...(JSON.parse(cached) as LdrResearchResult), status: 'cached' };
    }
  } catch { /* cache miss */ }

  // 2. Check running task
  try {
    const taskRefStr = await redis.get(`ldr:task:${qHash}`);
    if (taskRefStr) {
      const ref = JSON.parse(taskRefStr) as LdrTaskRef;
      const completed = await pollLdrTask(ref.taskId);
      if (completed) return completed;
    }
  } catch { /* ignore */ }

  // 3. Hit LDR history API for matching past research
  try {
    const res = await ldrFetch(`/api/history?limit=20`);
    if (!res.ok) return null;
    const data = await res.json() as Array<{
      id?: string;
      research_id?: string;
      query?: string;
      status?: string;
      summary?: string;
      sources?: LdrSource[];
    }>;

    // Find closest query match (simple lowercase includes)
    const ql = query.toLowerCase();
    const match = data.find(r =>
      r.status === 'completed' &&
      (r.query?.toLowerCase().includes(ql) || ql.includes(r.query?.toLowerCase() ?? ''))
    );

    if (!match) return null;

    const taskId = match.id ?? match.research_id ?? '';
    return {
      taskId,
      query:       match.query ?? query,
      queryHash:   fnv1a8(match.query ?? query),
      status:      'completed',
      summary:     match.summary ?? '',
      sources:     Array.isArray(match.sources) ? match.sources : [],
      completedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Quick synchronous summary (LDR one-shot mode, ~5s).
 */
export async function ldrQuickSummary(query: string): Promise<string | null> {
  if (!LDR_ENABLED) return null;
  try {
    const res = await ldrFetch('/api/research/quick-summary', {
      method: 'POST',
      body:   JSON.stringify({ query, max_results: 5 }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { summary?: string };
    return data.summary?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Health check — returns true if LDR is reachable.
 */
export async function ldrHealthCheck(): Promise<boolean> {
  if (!LDR_ENABLED) return false;
  try {
    const res = await fetch(`${LDR_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
