import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import {
  type SemanticPromptPacket,
  type RouterDecision,
  normalizePrompt,
  SEMANTIC_HIT_SCORE,
  SEMANTIC_CTX_SCORE,
  OPENCODE_RULE_PREFIX,
  OPENCODE_FIX_PREFIX,
} from '$lib/server/ai/prompt-packet.js';
import {
  getExactMatch,
  setExactMatch,
  getCachedRouterDecision,
  setCachedRouterDecision,
  searchSimilarPackets,
  writePromptPacket,
  getOpenCodeCard,
  incrementStat,
  listOpenCodeRules,
  type SemanticSearchResult,
} from '$lib/server/cache/semantic-valkey.js';

// ── Embedding helper ──────────────────────────────────────────────────────────
// Uses the SvelteKit /api/embed endpoint (Redis L1 + Bifrost L2 cached).
// Falls back to direct Ollama /api/embeddings when dev server is unavailable.

const EMBED_URL   = 'http://127.0.0.1:5173/api/embed';
const OLLAMA_URL  = 'http://127.0.0.1:11434';
const EMBED_MODEL = 'embeddinggemma:latest';

async function embed(text: string): Promise<Float32Array | null> {
  // Try SvelteKit embed endpoint first (cached)
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: EMBED_MODEL }),
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json() as { embedding?: number[] };
      if (Array.isArray(data.embedding)) return new Float32Array(data.embedding);
    }
  } catch { /* fall through */ }

  // Direct Ollama fallback
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json() as { embedding?: number[] };
      if (Array.isArray(data.embedding)) return new Float32Array(data.embedding);
    }
  } catch { /* embedding unavailable */ }

  return null;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ── Router result ─────────────────────────────────────────────────────────────

export interface RouterResult {
  decision: RouterDecision;
  answer?: string;                        // set on exact_hit or semantic_hit
  contextCards?: string[];                // set on semantic_context — inject into prompt
  topPacket?: SemanticPromptPacket;       // best semantic hit (for logging)
  score?: number;
  durationMs: number;
}

// ── Main router gate ──────────────────────────────────────────────────────────

/**
 * Route a prompt through the Semantic Valkey cache layers before calling Gemma4.
 *
 * Decision ladder:
 *   1. exact_hit    — SHA-256 match in prompt:exact:v1:*  → return cached answer
 *   2. semantic_hit — cosine ≥ 0.92                      → return (or patch) cached answer
 *   3. semantic_ctx — cosine 0.78–0.91                   → inject top-5 as context cards
 *   4. model_call   — score < 0.78                       → call model with no cache help
 *
 * The router does NOT call the model — callers do that when decision = 'model_call'
 * or 'semantic_context', using the returned contextCards.
 */
export async function routePrompt(
  redis: Redis,
  rawPrompt: string,
  opts: {
    model?: string;
    kindFilter?: string;   // 'prompt' | 'rule' | 'fix' | 'source_ref'
    k?: number;
  } = {},
): Promise<RouterResult> {
  const t0 = Date.now();
  const normalized = normalizePrompt(rawPrompt);
  const hash = sha256(normalized);

  // ── L0: exact match ───────────────────────────────────────────────────────
  const exact = await getExactMatch(redis, hash);
  if (exact) {
    await incrementStat(redis, 'exact_hits');
    await setCachedRouterDecision(redis, hash, 'exact_hit');
    return { decision: 'exact_hit', answer: exact, durationMs: Date.now() - t0 };
  }

  // Check cached router decision (skip re-embedding when we already know the outcome)
  const cachedDecision = await getCachedRouterDecision(redis, hash);
  if (cachedDecision === 'model_call') {
    await incrementStat(redis, 'model_calls');
    return { decision: 'model_call', durationMs: Date.now() - t0 };
  }

  // ── Embed ─────────────────────────────────────────────────────────────────
  const embedding = await embed(normalized);
  if (!embedding) {
    // Embedding unavailable — skip to model call
    await incrementStat(redis, 'misses');
    return { decision: 'model_call', durationMs: Date.now() - t0 };
  }

  // ── L1.5: semantic search ─────────────────────────────────────────────────
  const hits = await searchSimilarPackets(redis, embedding, {
    k: opts.k ?? 10,
    kind: opts.kindFilter,
    minScore: SEMANTIC_CTX_SCORE,
  });

  if (!hits.length) {
    await incrementStat(redis, 'misses');
    await setCachedRouterDecision(redis, hash, 'model_call', 300);
    return { decision: 'model_call', durationMs: Date.now() - t0 };
  }

  const best = hits[0];

  // semantic_hit — high confidence, return cached answer directly
  if (best.score >= SEMANTIC_HIT_SCORE && best.packet.answer) {
    await incrementStat(redis, 'semantic_hits');
    await setCachedRouterDecision(redis, hash, 'semantic_hit', 3600);
    return {
      decision: 'semantic_hit',
      answer: best.packet.answer,
      topPacket: best.packet,
      score: best.score,
      durationMs: Date.now() - t0,
    };
  }

  // semantic_context — moderate confidence, inject context cards
  await incrementStat(redis, 'context_injections');
  await setCachedRouterDecision(redis, hash, 'semantic_context', 900);

  const contextCards = hits.slice(0, 5).map(buildContextCard);

  return {
    decision: 'semantic_context',
    contextCards,
    topPacket: best.packet,
    score: best.score,
    durationMs: Date.now() - t0,
  };
}

function buildContextCard(hit: SemanticSearchResult): string {
  const p = hit.packet;
  const label = p.kind === 'rule' ? '[Rule]'
              : p.kind === 'fix'  ? '[Fix]'
              : p.kind === 'source_ref' ? '[File]'
              : '[Prior]';
  const refs = p.sourceRefs.length ? `\nSources: ${p.sourceRefs.slice(0, 3).join(', ')}` : '';
  return `${label} ${p.summary}${refs}`;
}

// ── Store result after model call ─────────────────────────────────────────────

/**
 * Call after a successful model response to populate the cache for future hits.
 * Pass the embedding returned by embed() during routePrompt — don't re-embed.
 */
export async function cacheModelAnswer(
  redis: Redis,
  opts: {
    rawPrompt: string;
    answer: string;
    model: string;
    sourceRefs?: string[];
    tags?: string[];
    ttlSeconds?: number;
  },
): Promise<void> {
  const normalized = normalizePrompt(opts.rawPrompt);
  const hash = sha256(normalized);
  const ttl = opts.ttlSeconds ?? 3600;

  // Always store exact match for zero-cost future hits
  await setExactMatch(redis, hash, opts.answer, ttl);

  // Build and store semantic packet (requires a fresh embedding)
  const embedding = await embed(normalized);
  if (!embedding) return;

  const packet: SemanticPromptPacket = {
    id: hash,
    kind: 'prompt',
    inputHash: hash,
    normalizedPrompt: normalized,
    summary: opts.answer.slice(0, 200),
    tags: opts.tags ?? [],
    sourceRefs: opts.sourceRefs ?? [],
    model: opts.model,
    answer: opts.answer,
    createdAt: new Date().toISOString(),
    ttlSeconds: ttl,
  };

  await writePromptPacket(redis, packet, embedding);
}

// ── OpenCode context injection ────────────────────────────────────────────────

/**
 * Fetch relevant OpenCode rule/fix cards for a given task description.
 * Used by OpenCode AGENTS.md to pull context from Valkey instead of loading large files.
 */
export async function fetchOpenCodeContext(
  redis: Redis,
  taskDescription: string,
  opts: { maxCards?: number } = {},
): Promise<string[]> {
  const maxCards = opts.maxCards ?? 6;

  // 1. Vector search for semantically relevant cards (rules + fixes)
  const embedding = await embed(taskDescription);
  const cards: string[] = [];

  if (embedding) {
    const ruleHits = await searchSimilarPackets(redis, embedding, {
      k: Math.ceil(maxCards / 2),
      kind: 'rule',
      minScore: 0.70,
    });
    const fixHits = await searchSimilarPackets(redis, embedding, {
      k: Math.ceil(maxCards / 2),
      kind: 'fix',
      minScore: 0.70,
    });
    for (const h of [...ruleHits, ...fixHits].slice(0, maxCards)) {
      cards.push(buildContextCard(h));
    }
  }

  // 2. If vector search returned nothing, fall back to listing all rule keys
  if (!cards.length) {
    const rules = await listOpenCodeRules(redis);
    for (const r of rules.slice(0, maxCards)) {
      cards.push(`[Rule] ${r.summary}`);
    }
  }

  return cards;
}

/**
 * Read a single OpenCode card by prefix + topic.
 * Useful for targeted lookups: "fetch the oldstring-mismatch fix card".
 */
export async function getOpenCodeFixCard(
  redis: Redis,
  errorTopic: string,
): Promise<string | null> {
  const key = `${OPENCODE_FIX_PREFIX}${errorTopic}`;
  const card = await getOpenCodeCard(redis, key);
  return card ? `[Fix: ${card.topic}] ${card.summary}` : null;
}

export async function getOpenCodeRuleCard(
  redis: Redis,
  topic: string,
): Promise<string | null> {
  const key = `${OPENCODE_RULE_PREFIX}${topic}`;
  const card = await getOpenCodeCard(redis, key);
  return card ? `[Rule: ${card.topic}] ${card.summary}` : null;
}
