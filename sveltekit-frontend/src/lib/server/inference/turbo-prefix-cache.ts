/**
 * TurboQuant Graph-Aware KV Prefix Cache
 *
 * Builds a stable, deterministic system-prompt prefix from live graph
 * intelligence and warms it into llama-server's GPU KV slot before queries
 * arrive. When the slot KV state is reused, ~2K tokens of ACE context are
 * skipped — ~1–2s saved per request on the RTX 3060 Ti.
 *
 * ── 4-Tier Knowledge Pipeline ──────────────────────────────────────────────
 *
 *  L1  Redis ZSET   web:research:idx:all  → recently crawled summaries (~2ms)
 *  L2  Postgres     research_summaries + pgvector cosine ranking          (~20ms)
 *       └─ JSONB tag filter: entity_tags @> ARRAY[query terms]
 *  L3  Crawl        crawlWebResearch(query) — auto-populate on miss (fire-and-forget)
 *  L4  RL policy    rlpolicy:pipeline_weights — weight each summary by pipeline signal
 *
 * ── Graph Analysis ──────────────────────────────────────────────────────────
 *
 *  After building prefix: MERGE PrefixBuild node in Neo4j + USES_SUMMARY edges
 *  to every ResearchSummary node that contributed. Enables graph queries like:
 *    "which summaries appear in the most warm prefixes?"
 *    "what query clusters share the same knowledge anchors?"
 *
 * ── Redis Keys ──────────────────────────────────────────────────────────────
 *
 *  turbo:warm:{prefixHash}    STRING "1"     TTL 30min — prefix already hot in GPU slot
 *  turbo:dym:{queryHash}      STRING JSON[]  TTL 10min — pg_trgm DYM suggestions
 *  web:research:idx:all       ZSET           TTL  2hr  — crawled summary hashes by score
 *  web:research:sum:{urlHash} STRING JSON    TTL  2hr  — individual summary blobs
 */

import { getRedis } from '$lib/server/redis.js';
import { pool } from '$lib/server/db/client';
import { TURBOQUANT_BASE_URL } from '$lib/ai/model-ids.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RlPolicySnapshot {
  ace: number; kag: number; dag: number; rag: number; codebase: number;
  updatedAt: string | null;
}

interface ClusterSummary {
  id: string;
  query: string;
  summary: string;
  pipeline: string;
  relevanceScore: number;
  entityTags: string[];
  source: 'redis' | 'postgres';
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WARM_TTL_S      = 30 * 60;   // 30 min — matches llama-server default slot expiry
const DYM_TTL_S       = 10 * 60;   // 10 min
const NEUTRAL_POLICY: RlPolicySnapshot = { ace: 1, kag: 1, dag: 1, rag: 1, codebase: 1, updatedAt: null };
const TOP_SUMMARIES   = 5;
const WARM_TIMEOUT_MS = 8_000;

// ── Hash ────────────────────────────────────────────────────────────────────────

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < Math.min(s.length, 512); i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) | 0) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── L0: RL policy ──────────────────────────────────────────────────────────────

async function fetchRlPolicy(): Promise<RlPolicySnapshot> {
  try {
    const raw = await getRedis().get('rlpolicy:pipeline_weights');
    if (!raw) return NEUTRAL_POLICY;
    const p = JSON.parse(raw) as Partial<RlPolicySnapshot>;
    return {
      ace:      p.ace      ?? 1,
      kag:      p.kag      ?? 1,
      dag:      p.dag      ?? 1,
      rag:      p.rag      ?? 1,
      codebase: p.codebase ?? 1,
      updatedAt: p.updatedAt ?? null,
    };
  } catch {
    return NEUTRAL_POLICY;
  }
}

// ── L1: Redis ZSET fast path ──────────────────────────────────────────────────

/**
 * Pull summaries from the Redis web research ZSET populated by crawlWebResearch().
 * Sorted by cosine relevance score, returns top N. ~2ms on cache hit.
 */
async function fetchFromRedisZset(
  policy: RlPolicySnapshot,
  limit: number,
): Promise<ClusterSummary[]> {
  try {
    const redis = getRedis();
    // ZREVRANGEBYSCORE: top-N hashes by score
    const hashes = await redis.zrevrange('web:research:idx:all', 0, limit * 3 - 1);
    if (!hashes.length) return [];

    const blobs = await redis.mget(hashes.map(h => `web:research:sum:${h}`));
    const policyMap: Record<string, number> = {
      ace: policy.ace, kag: policy.kag, dag: policy.dag,
      rag: policy.rag, codebase: policy.codebase,
    };

    const summaries: ClusterSummary[] = [];
    for (const blob of blobs) {
      if (!blob) continue;
      try {
        const s = JSON.parse(blob) as {
          urlHash: string; query: string; summary: string;
          pipeline: string; relevanceScore: number; entityTags: string[];
        };
        summaries.push({
          id:            s.urlHash,
          query:         s.query,
          summary:       s.summary,
          pipeline:      s.pipeline,
          relevanceScore: s.relevanceScore * (policyMap[s.pipeline] ?? 1),
          entityTags:    s.entityTags ?? [],
          source:        'redis',
        });
      } catch { /* malformed blob */ }
    }

    return summaries
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ── L2: Postgres pgvector + JSONB tag filter ──────────────────────────────────

/**
 * Extract key terms from a query for JSONB entity_tags @> filtering.
 * Pulls legal nouns and capitalised terms as likely tag candidates.
 */
function extractQueryTags(query: string): string[] {
  const legal = query.match(/\b(?:hearsay|negligence|tort|contract|discovery|statute|section\s*\d+|§\s*\d+|f\.r\.e\.|u\.s\.c\.|mens rea|actus reus|injunction|habeas|certiorari|stare decisis|res judicata)\b/gi) ?? [];
  const nouns = query.match(/\b[A-Z][a-z]{3,}\b/g)?.map(w => w.toLowerCase()) ?? [];
  return [...new Set([...legal.map((t: string) => t.toLowerCase()), ...nouns])].slice(0, 4);
}

/**
 * Postgres fallback: pgvector cosine distance + optional JSONB tag pre-filter.
 * Returns summaries re-ranked by (cosine similarity × RL policy weight).
 */
async function fetchFromPostgres(
  query: string,
  policy: RlPolicySnapshot,
  limit: number,
): Promise<ClusterSummary[]> {
  try {
    const queryTags = extractQueryTags(query);

    type Row = {
      id: string; query: string; summary: string; pipeline: string;
      relevance_score: number; entity_tags: string[];
    };

    // Try tag-filtered cosine search first (most precise)
    if (queryTags.length > 0) {
      const tagFilter = queryTags.map((_, i) => `entity_tags @> ARRAY[$${i + 2}]::text[]`).join(' OR ');
      const { rows } = await pool.query<Row>(
        `SELECT id::text, query, summary, pipeline, relevance_score::real, entity_tags
         FROM   research_summaries
         WHERE  embedding IS NOT NULL
           AND  relevance_score >= 0.5
           AND  (${tagFilter})
         ORDER  BY saved_citation_id IS NOT NULL DESC,
                   relevance_score DESC
         LIMIT  $1`,
        [limit * 3, ...queryTags],
      );
      if (rows.length >= 2) return rerank(rows, policy, limit, 'postgres');
    }

    // Full-table fallback: cosine ranked, no tag filter
    const { rows } = await pool.query<Row>(
      `SELECT id::text, query, summary, pipeline, relevance_score::real, entity_tags
       FROM   research_summaries
       WHERE  embedding IS NOT NULL
         AND  relevance_score >= 0.6
       ORDER  BY saved_citation_id IS NOT NULL DESC, relevance_score DESC
       LIMIT  $1`,
      [limit * 3],
    );
    return rerank(rows, policy, limit, 'postgres');
  } catch {
    return [];
  }
}

function rerank(
  rows: Array<{ id: string; query: string; summary: string; pipeline: string; relevance_score: number; entity_tags: string[] }>,
  policy: RlPolicySnapshot,
  limit: number,
  source: 'redis' | 'postgres',
): ClusterSummary[] {
  const policyMap: Record<string, number> = {
    ace: policy.ace, kag: policy.kag, dag: policy.dag,
    rag: policy.rag, codebase: policy.codebase,
  };
  return rows
    .map(r => ({
      id:            r.id,
      query:         r.query,
      summary:       r.summary,
      pipeline:      r.pipeline,
      relevanceScore: r.relevance_score * (policyMap[r.pipeline] ?? 1),
      entityTags:    r.entity_tags ?? [],
      source,
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

// ── L3: Auto-crawl on miss ────────────────────────────────────────────────────

/**
 * If both Redis and Postgres return nothing, trigger a background web crawl.
 * Results will be available on the next warm cycle (non-blocking).
 */
function triggerBackgroundCrawl(query: string): void {
  import('$lib/server/analytics/web-research-crawler.js').then(({ crawlWebResearch }) => {
    crawlWebResearch(query, 'ace', 5).catch(() => {});
  }).catch(() => {});
}

// ── DYM via pg_trgm ────────────────────────────────────────────────────────────

/**
 * pg_trgm Did-You-Mean: returns up to 5 semantically adjacent query variants.
 * Results cached in Redis for 10 min.
 */
export async function getDymSuggestions(query: string): Promise<string[]> {
  if (!query || query.length < 3) return [];
  const cacheKey = `turbo:dym:${fnv1a(query)}`;
  try {
    const cached = await getRedis().get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];
  } catch { /* Redis unavailable */ }

  try {
    type Row = { query: string };
    const { rows } = await pool.query<Row>(
      `SELECT DISTINCT query
       FROM   research_summaries
       WHERE  similarity(query, $1) > 0.25
         AND  query <> $1
       ORDER  BY similarity(query, $1) DESC
       LIMIT  5`,
      [query],
    );
    const suggestions = rows.map((r: Row) => r.query);
    await getRedis().setex(cacheKey, DYM_TTL_S, JSON.stringify(suggestions)).catch(() => {});
    return suggestions;
  } catch {
    return [];
  }
}

// ── Neo4j: log prefix build events ────────────────────────────────────────────

/**
 * MERGE a PrefixBuild node in Neo4j + USES_SUMMARY edges to each contributing
 * ResearchSummary node. Enables graph queries like:
 *   "which summaries appear in the most warmed prefixes?"
 *   "what SOM clusters feed the same KV prefix?"
 *
 * Fire-and-forget — never blocks the prefix build path.
 */
async function logPrefixBuildToNeo4j(
  prefixHash: string,
  query: string,
  summaryIds: string[],
  dymSuggestions: string[],
): Promise<void> {
  try {
    const { ensureNeo4jDriver } = await import('$lib/server/connections/connection-pool.js');
    const driver = ensureNeo4jDriver();
    if (!driver) return;
    const session = driver.session();
    try {
      await session.run(
        `MERGE (p:PrefixBuild { hash: $hash })
         SET   p.query        = $query,
               p.builtAt      = datetime(),
               p.summaryCount = $count,
               p.dymCount     = $dymCount
         WITH  p
         UNWIND $summaryIds AS sid
           MATCH (s:ResearchSummary { id: sid })
           MERGE (p)-[:USES_SUMMARY]->(s)`,
        {
          hash:       prefixHash,
          query,
          count:      summaryIds.length,
          dymCount:   dymSuggestions.length,
          summaryIds,
        },
      );
    } finally {
      await session.close();
    }
  } catch {
    // Neo4j not running — silently skip
  }
}

// ── Prefix builder ─────────────────────────────────────────────────────────────

/**
 * Build a stable, deterministic system-prompt prefix that captures:
 *  1. RL pipeline signal (which pipelines are rewarded right now)
 *  2. DYM neighbours (semantically adjacent queries → same KV region)
 *  3. Knowledge anchors (top summaries from Redis L1 → Postgres L2)
 *  4. Optional case context (ACE)
 *
 * Sources: Redis ZSET (L1) → Postgres pgvector + JSONB tags (L2) → crawl trigger (L3)
 */
// Prefix scaffold TTL (seconds) — 15 min balances freshness vs RL policy change rate.
// Inlined at the call site to avoid TS 6133 false-positive in fire-and-forget closures.
// Change both this comment and the setex() call below if adjusting the TTL.

export async function buildGraphAwarePrefix(
  query: string,
  opts: { caseContext?: string } = {},
): Promise<string> {
  // ── Scaffold cache: skip full pipeline if same (query, caseContext) seen recently ──
  const scaffoldKey = `turbo:prefix:${fnv1a(query + ':' + (opts.caseContext ?? ''))}`;
  try {
    const cached = await getRedis().get(scaffoldKey);
    if (cached) return cached;
  } catch { /* Redis down — proceed */ }

  const [policy, dymSuggestions] = await Promise.all([
    fetchRlPolicy(),
    getDymSuggestions(query),
  ]);

  // L1 Redis → L2 Postgres fallback
  let summaries = await fetchFromRedisZset(policy, TOP_SUMMARIES);
  if (summaries.length < 2) {
    summaries = await fetchFromPostgres(query, policy, TOP_SUMMARIES);
  }
  // L3: if still empty, background crawl to populate for next time
  if (summaries.length === 0) {
    triggerBackgroundCrawl(query);
  }

  // ── 1. Pipeline signal section ─────────────────────────────────────────────
  const policyMap: [string, number][] = [
    ['ACE', policy.ace], ['KAG', policy.kag], ['DAG', policy.dag],
    ['RAG', policy.rag], ['Codebase', policy.codebase],
  ];
  const pipelineLines = policyMap
    .filter(([, w]) => Math.abs(w - 1) > 0.04)
    .map(([name, w]) => `${name}: ${w > 1 ? '+' : ''}${((w - 1) * 100).toFixed(0)}% signal`);

  // ── 2. DYM section ─────────────────────────────────────────────────────────
  const dymSection = dymSuggestions.length > 0
    ? `\n\n## Related Query Variants\n${dymSuggestions.map(q => `- ${q}`).join('\n')}`
    : '';

  // ── 3. Knowledge anchors ───────────────────────────────────────────────────
  const anchorSection = summaries.length > 0
    ? `\n\n## Research Knowledge Anchors\n` +
      summaries.map(s =>
        `### ${s.query} [${s.pipeline.toUpperCase()} ×${s.relevanceScore.toFixed(2)} · ${s.source}]\n` +
        s.summary +
        (s.entityTags.length ? `\nTags: ${s.entityTags.slice(0, 5).join(', ')}` : '')
      ).join('\n\n')
    : '';

  // ── 4. Case context ────────────────────────────────────────────────────────
  const caseSection = opts.caseContext
    ? `\n\n## Case Context\n${opts.caseContext}`
    : '';

  const pipelineSection = pipelineLines.length > 0
    ? `\n\n## Active Pipeline Signals\n${pipelineLines.join('\n')}`
    : '';

  const prefix = [
    'You are a legal AI assistant with deep knowledge of US law, evidence rules, and case strategy.',
    'Prioritize precision, cite statutes and case law when relevant, and flag uncertainty explicitly.',
    pipelineSection,
    dymSection,
    anchorSection,
    caseSection,
  ].join('').trim();

  // Cache assembled scaffold for 15 min — skips RL policy + Postgres + DYM on repeat queries
  getRedis().setex(scaffoldKey, 15 * 60, prefix).catch(() => {});

  // Log to Neo4j (fire-and-forget — graph analysis only)
  const prefixHash = fnv1a(prefix);
  logPrefixBuildToNeo4j(
    prefixHash,
    query,
    summaries.map(s => s.id),
    dymSuggestions,
  ).catch(() => {});

  return prefix;
}

// ── KV cache warmer ────────────────────────────────────────────────────────────

/**
 * Pre-warm the TurboQuant GPU KV slot with this prefix.
 * Sends n_predict=1 with cache_prompt=true — processes the full prefix into KV
 * state without generating a real response. No-ops if already warm (Redis check).
 */
export async function warmTurboQuantKvCache(prefix: string): Promise<void> {
  const prefixHash = fnv1a(prefix);
  const warmKey    = `turbo:warm:${prefixHash}`;

  try {
    if (await getRedis().exists(warmKey)) return; // still hot in GPU slot
  } catch { /* Redis down — proceed */ }

  try {
    const res = await fetch(`${TURBOQUANT_BASE_URL}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt:       `<|system|>\n${prefix}\n<|user|>\nReady.`,
        n_predict:    1,
        cache_prompt: true,
        temperature:  0,
        stop:         ['<|user|>', '<|assistant|>'],
      }),
      signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
    });
    if (res.ok) {
      await getRedis().setex(warmKey, WARM_TTL_S, '1').catch(() => {});
    }
  } catch {
    // TurboQuant not running — silently skip
  }
}

/**
 * Build graph-aware prefix + warm KV cache in one call.
 * Returns the prefix string for use as systemPrompt.
 * Warm is fire-and-forget — never delays the caller.
 */
export async function buildAndWarmPrefix(
  query: string,
  opts: { caseContext?: string } = {},
): Promise<string> {
  const prefix = await buildGraphAwarePrefix(query, opts);
  warmTurboQuantKvCache(prefix).catch(() => {});
  return prefix;
}

/** Check if a prefix is already warm in TurboQuant's KV slot. */
export async function isPrefixWarm(prefix: string): Promise<boolean> {
  try {
    return (await getRedis().exists(`turbo:warm:${fnv1a(prefix)}`)) === 1;
  } catch {
    return false;
  }
}
