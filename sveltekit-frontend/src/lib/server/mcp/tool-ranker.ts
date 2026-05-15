/**
 * FastMCP tool-call ranking — recommends the top tools for a given HMM state.
 *
 * ACE calls rankTools() before passing control to Gemma4, so Gemma sees a
 * pre-filtered, priority-ordered tool list rather than the full unranked set.
 *
 * Score formula (all components ∈ [0, 1]):
 *   toolScore = hmmFit × 0.35
 *             + expectedGain × 0.25
 *             + priorSuccessRate × 0.20
 *             + cacheWarmth × 0.10
 *             - latencyPenalty × 0.05
 *             - riskPenalty × 0.05
 *
 * Scores are then multiplied by HMM confidence (0 → neutral 0.5 score).
 */

import type { GlyphSection } from '$lib/server/types/glyph.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToolKind = 'search' | 'graph' | 'trace' | 'test' | 'summary' | 'rerank';
export type ToolRisk = 'read_only' | 'write' | 'dangerous';

export interface TraceToolProfile {
  name:               string;
  kind:               ToolKind;
  /** Input manifold the tool accepts (e.g. 'query', 'chunkId', 'traceId') */
  accepts:            string[];
  /** Output manifold the tool produces (e.g. 'chunks', 'reranked', 'summary') */
  produces:           string[];
  /** HMM sections where this tool typically outperforms alternatives */
  bestForHmmSections: GlyphSection[];
  /** Average observed latency in ms — 0 means unknown */
  avgLatencyMs:       number;
  /** Average observed gain score — 0 means no history */
  avgGainScore:       number;
  /** Invocation risk level */
  risk:               ToolRisk;
}

export interface RankedTool {
  profile: TraceToolProfile;
  score:   number;
  /** Short human-readable explanation of why this tool was ranked here */
  why:     string[];
}

export interface ToolRankingRequest {
  hmmSection:   GlyphSection;
  confidence:   number;
  /** If provided, only tools whose `accepts` includes one of these are returned */
  inputManifold?: string[];
  /** Maximum tools to return (default 3) */
  limit?:        number;
}

// ── Tool registry ─────────────────────────────────────────────────────────────

/** Reference latency bands (ms) for normalisation */
const FAST_MS   = 50;
const SLOW_MS   = 2000;

/** Risk penalty weights */
const RISK_PENALTY: Record<ToolRisk, number> = {
  read_only: 0.0,
  write:     0.3,
  dangerous: 0.8,
};

/** Built-in tool profiles — extend at runtime via registerTool(). */
const TOOL_REGISTRY = new Map<string, TraceToolProfile>();

export function registerTool(profile: TraceToolProfile): void {
  TOOL_REGISTRY.set(profile.name, profile);
}

export function getToolRegistry(): ReadonlyMap<string, TraceToolProfile> {
  return TOOL_REGISTRY;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score a single tool against the current HMM context.
 * Returns a value in [0, 1].
 */
export function scoreToolForContext(
  tool:        TraceToolProfile,
  section:     GlyphSection,
  confidence:  number,
  cacheWarmth = 0,
): { score: number; why: string[] } {
  const why: string[] = [];

  // HMM fit: does this tool declare affinity for the current section?
  const hmmFit = tool.bestForHmmSections.includes(section) ? 1.0 : 0.2;
  if (hmmFit > 0.5) why.push(`best_for_${section.toLowerCase()}`);

  // Expected gain from tool history
  const expectedGain = Math.min(1, tool.avgGainScore);
  if (expectedGain > 0.6) why.push('high_prior_gain');

  // Prior success rate — derived from success / (success + failure) via avgGainScore proxy
  const priorSuccessRate = expectedGain;

  // Cache warmth (caller-supplied — from Redis prefetch keys)
  const cacheWarmthNorm = Math.min(1, cacheWarmth);
  if (cacheWarmthNorm > 0.5) why.push('cache_warm');

  // Latency penalty: normalised within FAST_MS–SLOW_MS band
  const latencyRaw   = tool.avgLatencyMs > 0 ? tool.avgLatencyMs : FAST_MS;
  const latencyNorm  = Math.min(1, Math.max(0, (latencyRaw - FAST_MS) / (SLOW_MS - FAST_MS)));
  if (latencyNorm < 0.2) why.push('fast_tool');

  // Risk penalty
  const riskPenalty  = RISK_PENALTY[tool.risk];
  if (riskPenalty === 0) why.push('read_only_safe');

  const rawScore =
    hmmFit          * 0.35 +
    expectedGain    * 0.25 +
    priorSuccessRate* 0.20 +
    cacheWarmthNorm * 0.10 -
    latencyNorm     * 0.05 -
    riskPenalty     * 0.05;

  // Confidence gate: blend toward 0.5 when confidence is low
  const c     = Math.max(0, Math.min(1, confidence));
  const score = Math.max(0, Math.min(1, 0.5 * (1 - c) + rawScore * c));

  return { score, why };
}

/**
 * Rank all registered tools for a given HMM context and return the top-N.
 */
export function rankTools(req: ToolRankingRequest): RankedTool[] {
  const { hmmSection, confidence, inputManifold, limit = 3 } = req;

  const candidates: RankedTool[] = [];

  for (const tool of TOOL_REGISTRY.values()) {
    // Filter by input manifold compatibility when specified
    if (inputManifold && inputManifold.length > 0) {
      const compatible = inputManifold.some((m) => tool.accepts.includes(m));
      if (!compatible) continue;
    }

    const { score, why } = scoreToolForContext(tool, hmmSection, confidence);
    candidates.push({ profile: tool, score, why });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// ── Default tool profiles ─────────────────────────────────────────────────────

const DEFAULT_TOOLS: TraceToolProfile[] = [
  {
    name:               'trace.kag_search',
    kind:               'search',
    accepts:            ['query'],
    produces:           ['chunks'],
    bestForHmmSections: ['LEGAL_AUTHORITY', 'FACTS', 'JURISDICTION'],
    avgLatencyMs:       120,
    avgGainScore:       0.72,
    risk:               'read_only',
  },
  {
    name:               'topology.search_near',
    kind:               'graph',
    accepts:            ['query', 'manifold4'],
    produces:           ['chunks', 'topology_nodes'],
    bestForHmmSections: ['FACTS', 'JURISDICTION', 'PARTIES'],
    avgLatencyMs:       200,
    avgGainScore:       0.65,
    risk:               'read_only',
  },
  {
    name:               'graph.expand_neighborhood',
    kind:               'graph',
    accepts:            ['chunkId', 'nodeId'],
    produces:           ['chunks', 'edges'],
    bestForHmmSections: ['LEGAL_AUTHORITY', 'CLAIMS'],
    avgLatencyMs:       180,
    avgGainScore:       0.68,
    risk:               'read_only',
  },
  {
    name:               'graph.fetch_rerank',
    kind:               'rerank',
    accepts:            ['chunks', 'query', 'manifold4'],
    produces:           ['reranked'],
    bestForHmmSections: ['LEGAL_AUTHORITY', 'CLAIMS', 'PRAYER_HOLDING'],
    avgLatencyMs:       80,
    avgGainScore:       0.75,
    risk:               'read_only',
  },
  {
    name:               'graph.shortest_path',
    kind:               'graph',
    accepts:            ['nodeId'],
    produces:           ['path', 'edges'],
    bestForHmmSections: ['JURISDICTION', 'CLAIMS'],
    avgLatencyMs:       300,
    avgGainScore:       0.55,
    risk:               'read_only',
  },
  {
    name:               'clusters.get_summary_lenses',
    kind:               'summary',
    accepts:            ['query', 'clusterId'],
    produces:           ['summary', 'chunks'],
    bestForHmmSections: ['LEGAL_AUTHORITY', 'FACTS', 'CLAIMS'],
    avgLatencyMs:       250,
    avgGainScore:       0.70,
    risk:               'read_only',
  },
  {
    name:               'trace.explain_retrieval',
    kind:               'trace',
    accepts:            ['traceId', 'query'],
    produces:           ['explanation'],
    bestForHmmSections: ['UNKNOWN', 'CLAIMS'],
    avgLatencyMs:       150,
    avgGainScore:       0.60,
    risk:               'read_only',
  },
  {
    name:               'ops.run_targeted_test',
    kind:               'test',
    accepts:            ['filePath', 'testName'],
    produces:           ['testResult'],
    bestForHmmSections: ['UNKNOWN'],
    avgLatencyMs:       8000,
    avgGainScore:       0.50,
    risk:               'write',
  },
];

// Register defaults at module load time
for (const t of DEFAULT_TOOLS) {
  TOOL_REGISTRY.set(t.name, t);
}

// ── Per-HMM shortcut lists (for ACE fast-path without scoring) ────────────────

/**
 * Return the canonical tool order for a section — fast path when confidence
 * is high and cacheWarmth data is unavailable (e.g. cold start).
 */
export function defaultToolsForSection(section: GlyphSection): string[] {
  const MAP: Record<GlyphSection, string[]> = {
    LEGAL_AUTHORITY: ['trace.kag_search', 'graph.fetch_rerank', 'clusters.get_summary_lenses'],
    FACTS:           ['trace.kag_search', 'topology.search_near', 'clusters.get_summary_lenses'],
    CLAIMS:          ['graph.fetch_rerank', 'graph.expand_neighborhood', 'trace.kag_search'],
    PRAYER_HOLDING:  ['graph.fetch_rerank', 'trace.kag_search', 'trace.explain_retrieval'],
    JURISDICTION:    ['topology.search_near', 'trace.kag_search', 'graph.shortest_path'],
    PARTIES:         ['topology.search_near', 'trace.kag_search', 'clusters.get_summary_lenses'],
    UNKNOWN:         ['trace.kag_search', 'trace.explain_retrieval', 'graph.fetch_rerank'],
  };
  return MAP[section] ?? MAP.UNKNOWN;
}

/**
 * Update a tool's avg latency and gain score in-memory (no DB write).
 * Callers should persist to tool_call_stats table asynchronously.
 */
export function updateToolStats(
  toolName:    string,
  latencyMs:   number,
  gainScore:   number,
  succeeded:   boolean,
  hmmSection?: GlyphSection,
): void {
  const tool = TOOL_REGISTRY.get(toolName);
  if (!tool) return;
  // Exponential moving average (α=0.2)
  const α = 0.2;
  tool.avgLatencyMs  = tool.avgLatencyMs  > 0
    ? tool.avgLatencyMs  * (1 - α) + latencyMs * α
    : latencyMs;
  tool.avgGainScore  = tool.avgGainScore  > 0
    ? tool.avgGainScore  * (1 - α) + gainScore * α
    : gainScore;
  if (hmmSection) {
    persistToolStatsToDb(toolName, hmmSection, latencyMs, gainScore, succeeded).catch(() => {});
  }
}

// ── DB persistence (async, fire-and-forget safe) ──────────────────────────────

/**
 * Persist tool call outcome to tool_call_stats table.
 * Upserts using ON CONFLICT DO UPDATE — safe to call fire-and-forget.
 */
export async function persistToolStatsToDb(
  toolName: string,
  hmmSection: GlyphSection,
  latencyMs: number,
  gainScore: number,
  succeeded: boolean,
): Promise<void> {
  // @ts-expect-error tsgo pre-stable: $lib alias not resolved for named pool export
  const { pool } = await import('$lib/server/db/client.js');
  await pool.query(
    `INSERT INTO tool_call_stats
       (tool_name, hmm_section, success_count, failure_count, avg_latency_ms, avg_gain_score, last_used_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (tool_name, hmm_section) DO UPDATE SET
       success_count   = tool_call_stats.success_count + EXCLUDED.success_count,
       failure_count   = tool_call_stats.failure_count + EXCLUDED.failure_count,
       avg_latency_ms  = tool_call_stats.avg_latency_ms  * 0.8 + EXCLUDED.avg_latency_ms  * 0.2,
       avg_gain_score  = tool_call_stats.avg_gain_score  * 0.8 + EXCLUDED.avg_gain_score  * 0.2,
       last_used_at    = now()`,
    [toolName, hmmSection, succeeded ? 1 : 0, succeeded ? 0 : 1, latencyMs, gainScore],
  );
}

/**
 * Load persisted stats from DB and update the in-memory registry (EMA merge).
 * Call once at server startup or on demand — non-fatal if DB unavailable.
 */
export async function loadToolStatsFromDb(): Promise<void> {
  try {
    // @ts-expect-error tsgo pre-stable: $lib alias not resolved for named pool export
    const { pool } = await import('$lib/server/db/client.js');
    const { rows } = await pool.query<{
      tool_name: string;
      avg_latency_ms: number;
      avg_gain_score: number;
    }>(
      `SELECT tool_name,
              avg(avg_latency_ms) AS avg_latency_ms,
              avg(avg_gain_score) AS avg_gain_score
       FROM tool_call_stats
       GROUP BY tool_name`,
    );
    for (const row of rows) {
      const tool = TOOL_REGISTRY.get(row.tool_name);
      if (!tool) continue;
      const α = 0.3;
      if (row.avg_latency_ms > 0)
        tool.avgLatencyMs = tool.avgLatencyMs > 0
          ? tool.avgLatencyMs * (1 - α) + Number(row.avg_latency_ms) * α
          : Number(row.avg_latency_ms);
      if (row.avg_gain_score > 0)
        tool.avgGainScore = tool.avgGainScore > 0
          ? tool.avgGainScore * (1 - α) + Number(row.avg_gain_score) * α
          : Number(row.avg_gain_score);
    }
  } catch { /* non-fatal — in-memory defaults remain */ }
}
