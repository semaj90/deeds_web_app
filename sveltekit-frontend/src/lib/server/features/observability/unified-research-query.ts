/**
 * Unified Research Query — Orchestrates all analytics data sources.
 *
 * MAP phase (parallel, non-fatal):
 *   [A] research-cache    → Redis ZSET (qlora quality × feedback signals)
 *   [B] mapreduce-matrix  → cosine similarity hits (CouchDB glyph + rerank cache)
 *   [C] codebase-research → rg search patterns (TypeScript/SvelteKit 2)
 *   [D] web-research      → SearXNG + Firecrawl + GPU cosine rank
 *   [E] deep-research     → Ollama self-prompting with graph/feedback context
 *   [F] awk-aggregations  → AWK-style SQL score distribution (chunk_hit_log)
 *
 * REDUCE:
 *   Merge all topics → feedback × quality × pipeline coverage weighting
 *   → sorted unified topic list with provenance tags
 *
 * SYNTHESIZE:
 *   LangGraph supervisor state (multi-agent format)
 *   Ollama self-prompt chain (configurable depth)
 *   FastMCP tool hints (which MCP tools apply to each topic)
 *
 * Cache:
 *   Redis `unified:research:{userId}:{paramHash}` — 20-min TTL
 *   Force refresh via { rebuild: true }
 *
 * Firecrawl URL fetch:
 *   If opts.query is a URL (https?://...) → fetchUrlContent() via Firecrawl
 *   Falls back to HTML fetch → text extraction if no API key
 */

import { getRedis } from '$lib/server/redis.js';
import { pool }     from '$lib/server/db/client';
import { ENV }      from '$lib/server/env.server.js';
import { getOllamaEndpoint } from '$lib/server/ollama.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AwkAggregation {
  pipeline:      string;
  hitCount:      number;
  avgScore:      number;
  p50Score:      number;
  highQuality:   number;  // score ≥ 0.7
  mediumQuality: number;  // 0.4 ≤ score < 0.7
  lowQuality:    number;  // score < 0.4
}

export interface ScoreBucket {
  bucketStart: number;   // 0.0, 0.1, … 0.9
  count:       number;
  pipeline:    string;
}

export interface UnifiedTopic {
  id:          string;
  title:       string;
  selfPrompt:  string;
  pipeline:    string;
  priority:    'high' | 'medium' | 'low';
  score:       number;         // composite [0, 1]
  sources:     string[];       // which MAP stages contributed
  tags:        string[];
  mcpHints:    string[];       // MCP tool names that apply
}

export interface LangGraphMessage {
  role:    'user' | 'assistant' | 'tool';
  content: string;
  name?:   string;  // tool name for role=tool
}

export interface LangGraphState {
  messages:   LangGraphMessage[];
  next:       'research_cache' | 'matrix' | 'codebase' | 'web' | 'synthesis' | 'FINISH';
  step:       number;
  totalSteps: number;
  supervisor: { decision: string; confidence: number; nextAgent: string };
  accumulated: { topics: string[]; selfPrompts: string[]; pipelineHints: string[] };
}

export interface FetchedPageContent {
  url:      string;
  title:    string;
  markdown: string;
  source:   'firecrawl' | 'html-fallback';
}

export interface UnifiedResearchResult {
  // Source results (null if source skipped or errored)
  researchIndex:  { sketches: unknown[]; builtAt: string | null; totalByPipeline: Record<string, number> } | null;
  matrixAnalysis: { topChunks: unknown[]; pipelineCoverage: Record<string, number>; glyphContext: unknown[]; buildMs: number } | null;
  codebaseInsights: { topics: unknown[]; patterns: unknown[]; filesScanned: number } | null;
  webInsights:    { batches: unknown[]; totalSummaries: number } | null;
  deepResearch:   { topics: unknown[]; hotQueryTags: string[]; topPrompts: string[] } | null;
  fetchedPage:    FetchedPageContent | null;

  // Unified / reduced outputs
  aggregations:   { pipelineStats: AwkAggregation[]; scoreBuckets: ScoreBucket[] };
  unifiedTopics:  UnifiedTopic[];
  selfPromptChain: string[];

  // LangGraph supervisor state
  langGraphState: LangGraphState;

  meta: {
    userId:   string;
    query:    string;
    pipeline: string;
    sources:  string[];
    computeMs: number;
    cachedUntil: string;
  };
}

export interface UnifiedResearchOptions {
  query?:           string;
  pipeline?:        string;      // ace|rag|kag|dag|codebase|all
  domains?:         string[];    // codebase domain hints (typescript, sveltekit, ripgrep)
  depth?:           number;      // self-prompt chain depth 1-5
  days?:            number;      // lookback window for aggregations
  includeWeb?:      boolean;
  includeCodebase?: boolean;
  includeMatrix?:   boolean;
  rebuild?:         boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const UNIFIED_TTL   = 20 * 60;         // 20-min Redis cache
const CACHE_PREFIX  = 'unified:research:';
const MAX_TOPICS    = 20;

// AWK-style score buckets
const BUCKET_LABELS = ['0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9'];

// MCP tool hints per keyword domain
const MCP_HINTS: Array<[RegExp, string[]]> = [
  [/typescript|svelte|component|import/i, ['codebase:rg_search', 'analytics:codebase_research']],
  [/legal|statute|case|evidence|hearsay/i, ['analytics:deep_research', 'analytics:research_topics']],
  [/pipeline|rag|kag|dag|ace|retrieval/i, ['analytics:mapreduce_matrix', 'analytics:research_topics']],
  [/graph|neo4j|topology|centrality/i,    ['analytics:deep_research']],
  [/web|search|crawl|url|firecrawl/i,     ['analytics:web_research']],
];

// ── FNV-1a hash for cache key ──────────────────────────────────────────────────

function fnv1a(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < Math.min(text.length, 512); i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function paramHash(userId: string, opts: UnifiedResearchOptions): string {
  const key = `${userId}:${opts.query ?? ''}:${opts.pipeline ?? 'all'}:${(opts.domains ?? []).join(',')}:${opts.depth ?? 3}:${opts.days ?? 7}:${opts.includeWeb}:${opts.includeCodebase}:${opts.includeMatrix}`;
  return fnv1a(key);
}

// ── Firecrawl / HTML fetch ─────────────────────────────────────────────────────

async function fetchUrlContent(url: string): Promise<FetchedPageContent | null> {
  if (!url.match(/^https?:\/\//i)) return null;

  // Try Firecrawl if API key set
  const apiKey = ENV.FIRECRAWL_API_KEY;
  if (apiKey) {
    try {
      const FirecrawlModule = await import('@mendable/firecrawl-js');
      const FirecrawlApp = (FirecrawlModule.default ?? FirecrawlModule) as unknown as {
        new(config: { apiKey: string }): { scrapeUrl(url: string, opts: object): Promise<{ markdown?: string; metadata?: { title?: string } }> }
      };
      const app = new FirecrawlApp({ apiKey });
      const result = await app.scrapeUrl(url, { formats: ['markdown'] });
      if (result.markdown && result.markdown.length > 50) {
        return {
          url,
          title:    result.metadata?.title ?? url,
          markdown: result.markdown.slice(0, 8000),
          source:   'firecrawl',
        };
      }
    } catch { /* fall through */ }
  }

  // HTML fallback — fetch + strip tags
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Deeds-Legal-AI/1.0' },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html  = await res.text();
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) ?? [])[1] ?? url;
    const text  = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 6000);
    return { url, title, markdown: text, source: 'html-fallback' };
  } catch {
    return null;
  }
}

// ── AWK-style SQL aggregations ─────────────────────────────────────────────────

/**
 * AWK equivalent: awk '{sum[$pipeline]+=$score; n[$pipeline]++} END {for(p in sum) print p, sum[p]/n[p], ...}'
 * Grouped by pipeline with percentile and quality buckets.
 */
async function awkPipelineAggregations(days: number): Promise<AwkAggregation[]> {
  try {
    const interval = `${days} days`;
    const { rows } = await pool.query<{
      pipeline:      string;
      hit_count:     string;
      avg_score:     string | null;
      p50_score:     string | null;
      high_quality:  string;
      medium_quality: string;
      low_quality:   string;
    }>(
      `SELECT
         pipeline,
         COUNT(*)                                                    AS hit_count,
         ROUND(AVG(score)::numeric, 3)                              AS avg_score,
         ROUND(
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score)::numeric
           , 3)                                                      AS p50_score,
         COUNT(*) FILTER (WHERE score >= 0.7)                       AS high_quality,
         COUNT(*) FILTER (WHERE score >= 0.4 AND score < 0.7)       AS medium_quality,
         COUNT(*) FILTER (WHERE score < 0.4)                        AS low_quality
       FROM chunk_hit_log
       WHERE recorded_at > NOW() - $1::interval
       GROUP BY pipeline
       ORDER BY hit_count DESC`,
      [interval],
    );
    return rows.map(r => ({
      pipeline:      r.pipeline,
      hitCount:      parseInt(r.hit_count, 10),
      avgScore:      parseFloat(r.avg_score ?? '0'),
      p50Score:      parseFloat(r.p50_score ?? '0'),
      highQuality:   parseInt(r.high_quality, 10),
      mediumQuality: parseInt(r.medium_quality, 10),
      lowQuality:    parseInt(r.low_quality, 10),
    }));
  } catch {
    return [];
  }
}

/**
 * AWK equivalent: awk '{bucket=int($score/0.1)*10; counts[bucket]++}'
 * Score histogram with 0.1-wide buckets per pipeline.
 */
async function awkScoreBuckets(days: number): Promise<ScoreBucket[]> {
  try {
    const interval = `${days} days`;
    const { rows } = await pool.query<{
      bucket_start: string;
      count:        string;
      pipeline:     string;
    }>(
      `SELECT
         ROUND(FLOOR(score * 10) / 10, 1) AS bucket_start,
         COUNT(*)                          AS count,
         pipeline
       FROM chunk_hit_log
       WHERE recorded_at > NOW() - $1::interval
         AND score IS NOT NULL
       GROUP BY bucket_start, pipeline
       ORDER BY bucket_start, pipeline`,
      [interval],
    );
    return rows.map(r => ({
      bucketStart: parseFloat(r.bucket_start),
      count:       parseInt(r.count, 10),
      pipeline:    r.pipeline,
    }));
  } catch {
    return [];
  }
}

// ── MCP hint resolver ──────────────────────────────────────────────────────────

function resolveMcpHints(title: string, tags: string[]): string[] {
  const text = `${title} ${tags.join(' ')}`;
  const hints = new Set<string>();
  for (const [re, tools] of MCP_HINTS) {
    if (re.test(text)) tools.forEach(t => hints.add(t));
  }
  return [...hints];
}

// ── LangGraph supervisor state builder ────────────────────────────────────────

function buildLangGraphState(
  unifiedTopics: UnifiedTopic[],
  selfPromptChain: string[],
  completedSources: string[],
): LangGraphState {
  const messages: LangGraphMessage[] = [
    {
      role:    'user',
      content: `Unified research query across ${completedSources.join(', ')}`,
    },
  ];

  // Add one assistant message per completed agent step
  for (const src of completedSources) {
    messages.push({
      role:    'assistant',
      content: `Completed ${src} analysis. Found relevant topics.`,
      name:    src,
    });
  }

  // Synthesis message with top topics
  if (unifiedTopics.length > 0) {
    messages.push({
      role: 'tool',
      name: 'synthesis',
      content: JSON.stringify({
        topTopics:    unifiedTopics.slice(0, 5).map(t => t.title),
        selfPrompts:  selfPromptChain.slice(0, 3),
        pipelineHints: [...new Set(unifiedTopics.map(t => t.pipeline))],
      }),
    });
  }

  const highPriorityCount = unifiedTopics.filter(t => t.priority === 'high').length;
  const confidence        = Math.min(completedSources.length / 5, 1.0);

  return {
    messages,
    next:       'FINISH',
    step:       completedSources.length,
    totalSteps: 5,
    supervisor: {
      decision:  `Routing complete. ${highPriorityCount} high-priority topics found.`,
      confidence,
      nextAgent: 'FINISH',
    },
    accumulated: {
      topics:        unifiedTopics.slice(0, 10).map(t => t.title),
      selfPrompts:   selfPromptChain,
      pipelineHints: [...new Set(unifiedTopics.map(t => t.pipeline))],
    },
  };
}

// ── Ollama self-prompt chain ───────────────────────────────────────────────────

async function generateSelfPromptChain(
  seedTopics: UnifiedTopic[],
  depth: number,
): Promise<string[]> {
  if (!seedTopics.length || depth < 1) return [];

  const seed = seedTopics[0];
  const prompt =
    `You are a legal AI research assistant generating a self-prompting chain.\n` +
    `Given this research topic, produce exactly ${depth} follow-up research questions ` +
    `that go progressively deeper — each building on the previous answer.\n\n` +
    `Topic: "${seed.title}"\n` +
    `Self-prompt hint: "${seed.selfPrompt}"\n\n` +
    `Output ONLY the ${depth} questions, one per line, no numbering, no extra text.`;

  try {
    const { ollamaFetch } = await import('$lib/server/ollama.js');
    const res = await ollamaFetch(`${getOllamaEndpoint()}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:   ENV.ROTORQUANT_CHAT_MODEL,
        prompt,
        stream:  false,
        options: { temperature: 0.55, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { response?: string };
    return (data.response ?? '')
      .split('\n')
      .map((l: string) => l.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter((l: string) => l.length > 10)
      .slice(0, depth);
  } catch {
    return [];
  }
}

// ── Topic normalizer ───────────────────────────────────────────────────────────

function toUnifiedTopic(
  source: string,
  raw: { title?: string; selfPrompt?: string; pipeline?: string; priority?: string; score?: number; tags?: string[]; description?: string },
  index: number,
): UnifiedTopic {
  const title      = raw.title ?? `Topic ${index + 1}`;
  const selfPrompt = raw.selfPrompt ?? raw.description ?? `Investigate: ${title}`;
  const pipeline   = raw.pipeline ?? 'all';
  const tags       = raw.tags ?? [];
  const priority   = (raw.priority as UnifiedTopic['priority']) ?? 'medium';
  const score      = Math.min(raw.score ?? 0.5, 1.0);

  return {
    id:         `${source}-${fnv1a(title)}`,
    title,
    selfPrompt,
    pipeline,
    priority,
    score,
    sources:    [source],
    tags,
    mcpHints:   resolveMcpHints(title, tags),
  };
}

// ── Main orchestrator ──────────────────────────────────────────────────────────

export async function executeUnifiedResearch(
  userId: string,
  opts:   UnifiedResearchOptions = {},
): Promise<UnifiedResearchResult> {
  const start     = Date.now();
  const redis     = getRedis();
  const pipeline  = opts.pipeline ?? 'all';
  const days      = opts.days ?? 7;
  const depth     = Math.min(Math.max(opts.depth ?? 3, 1), 5);
  const query     = opts.query?.trim() ?? '';
  const isUrl     = /^https?:\/\//i.test(query);

  // Check cache
  if (!opts.rebuild) {
    const cacheKey = `${CACHE_PREFIX}${userId}:${paramHash(userId, opts)}`;
    const cached   = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as UnifiedResearchResult;
      } catch { /* fall through */ }
    }
  }

  const completedSources: string[] = [];

  // ── MAP — parallel, non-fatal ──────────────────────────────────────────────

  const [
    researchIndexResult,
    matrixResult,
    codebaseResult,
    webResult,
    deepResult,
    fetchedPage,
    pipelineStats,
    scoreBuckets,
  ] = await Promise.allSettled([
    // [A] Research cache index
    (async () => {
      const { queryResearchIndex, getResearchIndexStats } = await import('$lib/server/analytics/research-cache.js');
      const sketches = await queryResearchIndex(pipeline as never, 20);
      const stats    = await getResearchIndexStats();
      completedSources.push('research_cache');
      return { sketches, builtAt: stats.builtAt, totalByPipeline: stats.totalByPipeline };
    })(),

    // [B] MapReduce matrix (optional)
    opts.includeMatrix !== false
      ? (async () => {
          const { executeMapReduceAnalysis } = await import('$lib/server/analytics/mapreduce-matrix-analysis.js');
          const result = await executeMapReduceAnalysis(userId, { days, topK: 20, synthesize: false });
          completedSources.push('matrix');
          return {
            topChunks:       result.topChunks,
            pipelineCoverage: result.pipelineCoverage,
            glyphContext:    result.glyphTiles,
            buildMs:         result.buildMs,
          };
        })()
      : Promise.resolve(null),

    // [C] Codebase research / rg search (optional)
    opts.includeCodebase !== false
      ? (async () => {
          const { executeCodebaseResearch } = await import('$lib/server/analytics/codebase-research.js');
          const result = await executeCodebaseResearch(userId, {
            days,
            query: isUrl ? undefined : (query || undefined),
            synthesize: false,
          });
          completedSources.push('codebase');
          return { topics: result.topics, patterns: result.patterns, filesScanned: result.filesScanned };
        })()
      : Promise.resolve(null),

    // [D] Web research / Firecrawl (optional, only when explicitly requested or query provided)
    (opts.includeWeb && query && !isUrl)
      ? (async () => {
          const { crawlWebResearch } = await import('$lib/server/analytics/web-research-crawler.js');
          const batch = await crawlWebResearch(query, pipeline, 3);
          completedSources.push('web');
          return { batches: [batch], totalSummaries: batch.summaries.length };
        })()
      : Promise.resolve(null),

    // [E] Deep research (Ollama + graph + feedback)
    (async () => {
      const { generateDeepResearch } = await import('$lib/server/analytics/deep-research.js');
      const result = await generateDeepResearch(userId);
      completedSources.push('deep_research');
      return {
        topics:       result.topics,
        hotQueryTags: result.hotQueryTags,
        topPrompts:   result.topPrompts,
      };
    })(),

    // [F] Firecrawl URL fetch (when query is a URL)
    isUrl ? fetchUrlContent(query) : Promise.resolve(null),

    // [G] AWK aggregations — pipeline stats
    awkPipelineAggregations(days),

    // [H] AWK aggregations — score buckets
    awkScoreBuckets(days),
  ]);

  // Extract settled values
  const researchIndex   = researchIndexResult.status   === 'fulfilled' ? researchIndexResult.value   : null;
  const matrixAnalysis  = matrixResult.status           === 'fulfilled' ? matrixResult.value           : null;
  const codebaseInsights = codebaseResult.status        === 'fulfilled' ? codebaseResult.value         : null;
  const webInsights     = webResult.status              === 'fulfilled' ? webResult.value               : null;
  const deepResearch    = deepResult.status             === 'fulfilled' ? deepResult.value              : null;
  const fetchedPageOut  = fetchedPage.status            === 'fulfilled' ? fetchedPage.value             : null;
  const awkPipelines    = pipelineStats.status          === 'fulfilled' ? pipelineStats.value           : [];
  const awkBuckets      = scoreBuckets.status           === 'fulfilled' ? scoreBuckets.value            : [];

  // ── REDUCE — merge and score topics ───────────────────────────────────────

  const allTopics: UnifiedTopic[] = [];

  // From research cache sketches
  if (researchIndex?.sketches) {
    for (let i = 0; i < researchIndex.sketches.length; i++) {
      const s = researchIndex.sketches[i] as { query?: string; qualityTier?: string; entityTags?: string[]; pipelines?: string[]; compositeScore?: number };
      allTopics.push(toUnifiedTopic('research_cache', {
        title:      s.query ?? `Research topic ${i + 1}`,
        selfPrompt: `Investigate: ${s.query ?? 'this research topic'}`,
        pipeline:   (s.pipelines?.[0]) ?? pipeline,
        tags:       s.entityTags ?? [],
        score:      Math.min((s.compositeScore ?? 1) / 8, 1.0),
        priority:   (s.compositeScore ?? 0) > 4 ? 'high' : (s.compositeScore ?? 0) > 2 ? 'medium' : 'low',
      }, i));
    }
  }

  // From deep research
  if (deepResearch?.topics) {
    for (const t of deepResearch.topics as Array<{ title: string; selfPrompt?: string; pipelineHint?: string; priority?: string; tags?: string[] }>) {
      allTopics.push(toUnifiedTopic('deep_research', {
        title:      t.title,
        selfPrompt: t.selfPrompt,
        pipeline:   t.pipelineHint ?? pipeline,
        priority:   t.priority,
        tags:       t.tags ?? [],
      }, allTopics.length));
    }
  }

  // From codebase insights
  if (codebaseInsights?.topics) {
    for (const t of codebaseInsights.topics as Array<{ title: string; selfPrompt?: string; priority?: string; tags?: string[] }>) {
      allTopics.push(toUnifiedTopic('codebase', {
        title:      t.title,
        selfPrompt: t.selfPrompt,
        pipeline:   'codebase',
        priority:   t.priority,
        tags:       t.tags ?? [],
        score:      t.priority === 'high' ? 0.8 : t.priority === 'medium' ? 0.5 : 0.3,
      }, allTopics.length));
    }
  }

  // From web summaries
  if (webInsights?.batches) {
    for (const batch of webInsights.batches as Array<{ summaries: Array<{ title: string; entityTags?: string[]; relevanceScore?: number; pipeline?: string }> }>) {
      for (const s of batch.summaries) {
        allTopics.push(toUnifiedTopic('web', {
          title:    s.title,
          pipeline: s.pipeline ?? pipeline,
          tags:     s.entityTags ?? [],
          score:    s.relevanceScore ?? 0.5,
        }, allTopics.length));
      }
    }
  }

  // Deduplicate by title similarity (exact hash) and sort by score
  const seen     = new Set<string>();
  const deduped  = allTopics.filter(t => {
    const key = fnv1a(t.title.toLowerCase().replace(/\s+/g, ' ').trim());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => b.score - a.score);
  const unifiedTopics = deduped.slice(0, MAX_TOPICS);

  // ── SYNTHESIZE ────────────────────────────────────────────────────────────

  const selfPromptChain = await generateSelfPromptChain(unifiedTopics, depth);
  const langGraphState  = buildLangGraphState(unifiedTopics, selfPromptChain, completedSources);

  // ── CACHE + RETURN ────────────────────────────────────────────────────────

  const computeMs   = Date.now() - start;
  const cachedUntil = new Date(Date.now() + UNIFIED_TTL * 1000).toISOString();

  const result: UnifiedResearchResult = {
    researchIndex,
    matrixAnalysis,
    codebaseInsights,
    webInsights,
    deepResearch,
    fetchedPage:    fetchedPageOut,
    aggregations:   { pipelineStats: awkPipelines, scoreBuckets: awkBuckets },
    unifiedTopics,
    selfPromptChain,
    langGraphState,
    meta: {
      userId,
      query,
      pipeline,
      sources:    completedSources,
      computeMs,
      cachedUntil,
    },
  };

  // Cache (non-blocking, MatrixRow has Float64Array → convert to plain number[])
  const cacheKey = `${CACHE_PREFIX}${userId}:${paramHash(userId, opts)}`;
  const cachePayload = JSON.stringify(result, (_k, v) =>
    v instanceof Float64Array ? Array.from(v) : v,
  );
  redis.set(cacheKey, cachePayload, 'EX', UNIFIED_TTL).catch(() => {});

  return result;
}

export async function invalidateUnifiedResearchCache(userId: string): Promise<number> {
  const redis   = getRedis();
  const pattern = `${CACHE_PREFIX}${userId}:*`;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
    return keys.length;
  } catch {
    return 0;
  }
}

/** Quick stats: pipeline aggregations only (no Ollama calls). */
export async function getUnifiedAggregations(days = 7): Promise<{
  pipelineStats: AwkAggregation[];
  scoreBuckets:  ScoreBucket[];
  bucketLabels:  string[];
}> {
  const [pipelineStats, scoreBuckets] = await Promise.all([
    awkPipelineAggregations(days),
    awkScoreBuckets(days),
  ]);
  return { pipelineStats, scoreBuckets, bucketLabels: BUCKET_LABELS };
}
