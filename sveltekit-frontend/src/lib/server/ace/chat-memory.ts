/**
 * chat-memory.ts — past chat recall via Qdrant `chat_messages` collection.
 *
 * Writes (fire-and-forget): after every chat POST, embed the message and
 * upsert to Qdrant. The Postgres row is authoritative; Qdrant is an index
 * for semantic search over prior conversations.
 *
 * Reads: ACE context-assembler calls recallPastChats() with the current
 * query embedding. Returns a small, scoped slice of prior messages to
 * inject as memory context.
 *
 * The Postgres chat_messages table has no embedding column on disk — we
 * intentionally keep the embedding only in Qdrant to avoid schema drift.
 */

import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';

const QDRANT_URL = ENV.QDRANT_URL ?? 'http://localhost:6333';
const OLLAMA_URL = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const COLLECTION = 'chat_messages';
const VECTOR_NAME = 'message';
const EMBED_MODEL = 'embeddinggemma:latest';

/** Redis key mirroring /api/chat/memory/settings — same key both sides. */
const SETTINGS_KEY = 'chat_memory:settings';
const DEFAULT_SETTINGS = { enabled: true, scoreThreshold: 0.65 };

/** Rolling metrics — admin page reads these for the observability panel.
 *  Keys use HINCRBY/HINCRBYFLOAT so there's no read-modify-write race. */
const METRICS_KEY = 'chat_memory:metrics';

/** In-memory settings cache to avoid hitting Redis on every recall call.
 *  5-second TTL — admin toggles propagate within 5s, zero overhead in between. */
let _settingsCache: { value: typeof DEFAULT_SETTINGS; fetchedAt: number } | null = null;
const SETTINGS_CACHE_TTL_MS = 5000;

export async function getChatMemorySettings(): Promise<typeof DEFAULT_SETTINGS> {
	const now = Date.now();
	if (_settingsCache && now - _settingsCache.fetchedAt < SETTINGS_CACHE_TTL_MS) {
		return _settingsCache.value;
	}
	try {
		const redis = getRedis();
		const raw = await redis.get(SETTINGS_KEY);
		if (!raw) {
			_settingsCache = { value: DEFAULT_SETTINGS, fetchedAt: now };
			return DEFAULT_SETTINGS;
		}
		const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_SETTINGS>;
		const value = {
			enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
			scoreThreshold:
				typeof parsed.scoreThreshold === 'number' &&
				parsed.scoreThreshold >= 0 &&
				parsed.scoreThreshold <= 1
					? parsed.scoreThreshold
					: DEFAULT_SETTINGS.scoreThreshold,
		};
		_settingsCache = { value, fetchedAt: now };
		return value;
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export interface RecalledChatMessage {
  id: string | number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  score: number;
}

export interface RecallOptions {
  /** Exclude the current session so the model doesn't echo itself back. */
  excludeSessionId?: string;
  /** Cosine-similarity floor. Default 0.6. */
  scoreThreshold?: number;
  /** Only recall messages newer than this cutoff (ms since epoch). */
  sinceMs?: number;
  /** Hard cap on returned items. Default 5. */
  limit?: number;
}

/**
 * Search past chat messages by query embedding.
 * Returns [] on any failure — never throws to callers.
 */
export async function recallPastChats(
  queryEmbedding: number[],
  opts: RecallOptions = {},
): Promise<RecalledChatMessage[]> {
  if (!queryEmbedding?.length) return [];

  // Runtime toggle: admin can disable recall without redeploy. Callers that
  // need to bypass the toggle (e.g. the admin search console) pass an explicit
  // scoreThreshold, which is interpreted as "I know what I'm doing."
  const settings = await getChatMemorySettings();
  if (!settings.enabled && opts.scoreThreshold === undefined) {
    return [];
  }

  const scoreThreshold = opts.scoreThreshold ?? settings.scoreThreshold ?? 0.6;
  const limit = Math.min(opts.limit ?? 5, 20);

  const filter: Record<string, unknown> | undefined = buildFilter(opts);
  const startedAt = Date.now();

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: { name: VECTOR_NAME, vector: queryEmbedding },
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
        with_vector: false,
        ...(filter ? { filter } : {}),
      }),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      void recordMetrics({ calls: 1, hits: 0, totalScore: 0, latencyMs: Date.now() - startedAt, failures: 1 });
      return [];
    }
    const data = (await res.json()) as {
      result?: Array<{
        id: string | number;
        score: number;
        payload?: {
          sessionId?: string;
          role?: string;
          content?: string;
          timestamp?: number;
        };
      }>;
    };

    const hits = (data.result ?? [])
      .filter((p) => p.payload?.content && p.payload?.sessionId)
      .map((p) => ({
        id: p.id,
        sessionId: String(p.payload!.sessionId),
        role: (p.payload!.role as RecalledChatMessage['role']) ?? 'user',
        content: String(p.payload!.content),
        timestamp: Number(p.payload!.timestamp ?? 0),
        score: p.score,
      }));

    void recordMetrics({
      calls: 1,
      hits: hits.length,
      totalScore: hits.reduce((s, h) => s + h.score, 0),
      latencyMs: Date.now() - startedAt,
      failures: 0,
    });

    return hits;
  } catch {
    void recordMetrics({ calls: 1, hits: 0, totalScore: 0, latencyMs: Date.now() - startedAt, failures: 1 });
    return [];
  }
}

/** Fire-and-forget rolling counters for the admin observability panel. */
async function recordMetrics(m: {
  calls: number;
  hits: number;
  totalScore: number;
  latencyMs: number;
  failures: number;
}): Promise<void> {
  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    pipeline.hincrby(METRICS_KEY, 'calls', m.calls);
    pipeline.hincrby(METRICS_KEY, 'hits', m.hits);
    pipeline.hincrby(METRICS_KEY, 'failures', m.failures);
    pipeline.hincrby(METRICS_KEY, 'latencyMsTotal', m.latencyMs);
    if (m.totalScore > 0) {
      pipeline.hincrbyfloat(METRICS_KEY, 'scoreTotal', m.totalScore);
    }
    await pipeline.exec();
  } catch {
    /* non-fatal */
  }
}

/** Admin-facing read of rolling metrics. Returns zeroes when no calls yet. */
export async function readChatMemoryMetrics(): Promise<{
  calls: number;
  hits: number;
  failures: number;
  avgLatencyMs: number;
  avgHitsPerCall: number;
  avgScore: number;
}> {
  try {
    const redis = getRedis();
    const raw = await redis.hgetall(METRICS_KEY);
    const calls = Number(raw.calls ?? 0);
    const hits = Number(raw.hits ?? 0);
    const failures = Number(raw.failures ?? 0);
    const latencyMsTotal = Number(raw.latencyMsTotal ?? 0);
    const scoreTotal = Number(raw.scoreTotal ?? 0);
    return {
      calls,
      hits,
      failures,
      avgLatencyMs: calls > 0 ? Math.round(latencyMsTotal / calls) : 0,
      avgHitsPerCall: calls > 0 ? Number((hits / calls).toFixed(2)) : 0,
      avgScore: hits > 0 ? Number((scoreTotal / hits).toFixed(3)) : 0,
    };
  } catch {
    return { calls: 0, hits: 0, failures: 0, avgLatencyMs: 0, avgHitsPerCall: 0, avgScore: 0 };
  }
}

/** Reset metrics counters. Admin-facing. */
export async function resetChatMemoryMetrics(): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.del(METRICS_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Upsert a chat message into the Qdrant index. Fire-and-forget — caller
 * should NOT await this on the request path (or should .catch()).
 */
export async function indexChatMessage(
  message: {
    id: string | number;
    sessionId: string;
    role: string;
    content: string;
    timestamp?: number;
  },
  embedding: number[],
): Promise<boolean> {
  if (!embedding?.length) return false;
  if (!message.content?.trim()) return false;

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [
          {
            id: message.id,
            vector: { [VECTOR_NAME]: embedding },
            payload: {
              sessionId: message.sessionId,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp ?? Date.now(),
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * One-shot helper: embed a chat message via Ollama, then upsert to Qdrant.
 * Intended for fire-and-forget use in chat POST handlers.
 * Never throws — returns false on any failure (embed, network, Qdrant).
 *
 * Skip criteria (returns false without side effects):
 *   - system role (no retrieval value)
 *   - content shorter than 8 chars (noise)
 *
 * Usage:
 *   void recordChatMessageForRecall({ id: msgId, sessionId, role, content });
 */
export async function recordChatMessageForRecall(msg: {
  id: string | number;
  sessionId: string;
  role: string;
  content: string;
}): Promise<boolean> {
  if (msg.role === 'system') return false;
  if (!msg.content || msg.content.trim().length < 8) return false;

  const truncated = msg.content.slice(0, 2000);
  const qdrantId = typeof msg.id === 'number' ? msg.id : hashToQdrantId(String(msg.id));

  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: truncated }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { embedding?: number[] };
    if (!data.embedding?.length) return false;

    return await indexChatMessage(
      {
        id: qdrantId,
        sessionId: msg.sessionId,
        role: msg.role,
        content: truncated,
        timestamp: Date.now(),
      },
      data.embedding,
    );
  } catch {
    return false;
  }
}

/**
 * Convert an arbitrary string id to a stable unsigned 53-bit integer
 * acceptable to Qdrant (which rejects string ids unless they are UUIDs).
 *
 * Exported so backfill + live-write paths produce the same ID for a
 * given Postgres row, giving us idempotent upserts.
 */
export function hashToQdrantId(s: string): number {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return Number(h & 0x1fffffffffffffn);
}

function buildFilter(opts: RecallOptions): Record<string, unknown> | undefined {
  const must_not: Array<Record<string, unknown>> = [];
  const must: Array<Record<string, unknown>> = [];

  if (opts.excludeSessionId) {
    must_not.push({ key: 'sessionId', match: { value: opts.excludeSessionId } });
  }
  if (typeof opts.sinceMs === 'number') {
    must.push({ key: 'timestamp', range: { gte: opts.sinceMs } });
  }

  if (!must.length && !must_not.length) return undefined;
  return { ...(must.length ? { must } : {}), ...(must_not.length ? { must_not } : {}) };
}
