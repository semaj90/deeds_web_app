/**
 * Adaptive Prefetch — MapReduce-style recommendation engine for inference.
 *
 * After the first retrieval pass, this module:
 *   1. MAP   — independently scores each candidate signal source
 *   2. REDUCE — merges signal scores into a ranked recommendation list
 *   3. PREFETCH — enumerates Redis/Qdrant/Postgres keys to warm before
 *                 Gemma4 issues follow-up tool calls
 *
 * Output flows into retrievalTrace.adaptiveRecommendations so every
 * decision is observable in the TRACE timeline.
 *
 * Pipeline position:
 *   query → HMM → axis-weighted quaternion rerank → graph scoring
 *     → adaptive-prefetch → Gemma4 context packet
 */

import type { GlyphSection } from '$lib/server/types/glyph.js';
import { hmmAxisMultiplier } from '$lib/server/search/quaternion-manifold.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrefetchInput {
  query:        string;
  hmmSection:   GlyphSection;
  hmmConf:      number;
  /** Top Qdrant chunk IDs from the current retrieval pass */
  topChunkIds:  string[];
  /** SOM BMU of the query or top chunk */
  topSomRow?:   number | null;
  topSomCol?:   number | null;
  /** Engram DYM suggestions (from engram-bigram / engram-memory) */
  engramSuggestions?: string[];
  /** Graph neighbor IDs from the current KAG pass */
  graphNeighborIds?:  string[];
}

export interface AdaptiveRecommendations {
  /** Chunk IDs to prefetch into L1/L2 cache before Gemma4's next tool call */
  recommendedChunks:  string[];
  /** MCP tool names Gemma4 is likely to call next, based on HMM state */
  recommendedTools:   string[];
  /** Redis/Qdrant cache keys to warm (for background prefetch workers) */
  prefetchKeys:       string[];
  /** HMM-derived axis weights [w=reward, x=som_x, y=som_y, z=semantic_z] */
  axisWeights:        [number, number, number, number];
  /** Human-readable explanation of each recommendation */
  why:                string[];
  durationMs:         number;
}

// ── Tool recommendation table ─────────────────────────────────────────────────

/**
 * Which MCP tools are most useful per HMM section.
 *
 * LEGAL_AUTHORITY → statute lookup, KAG graph expansion (citations)
 * FACTS           → evidence search, timeline reconstruction
 * CLAIMS          → reasoning search, prior similar claims
 * PRAYER_HOLDING  → case outcome search, holding summaries
 * JURISDICTION    → court/venue lookup, jurisdiction filter
 * PARTIES         → person-of-interest lookup, entity graph
 * UNKNOWN         → broad KAG + RAG fallback
 */
const SECTION_TOOLS: Record<GlyphSection, string[]> = {
  LEGAL_AUTHORITY: ['trace.kag_search', 'graph.expand_neighborhood', 'trace.explain_retrieval'],
  FACTS:           ['topology.search_near', 'trace.kag_search', 'clusters.get_summary_lenses'],
  CLAIMS:          ['trace.kag_search', 'graph.shortest_path', 'trace.explain_retrieval'],
  PRAYER_HOLDING:  ['trace.kag_search', 'clusters.get_summary_lenses', 'trace.explain_retrieval'],
  JURISDICTION:    ['topology.search_near', 'trace.kag_search'],
  PARTIES:         ['graph.expand_neighborhood', 'trace.kag_search'],
  UNKNOWN:         ['trace.kag_search', 'topology.search_near'],
};

// ── SOM neighbour enumeration ─────────────────────────────────────────────────

function somNeighbourCells(row: number, col: number, radius = 1): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && c >= 0) cells.push([r, c]);
    }
  }
  return cells;
}

// ── MAP phase — score each signal source independently ────────────────────────

interface MappedSignal {
  source:  'qdrant' | 'som' | 'graph' | 'engram' | 'hmm_tool';
  id:      string;
  score:   number;
  why:     string;
}

function mapSignals(input: PrefetchInput): MappedSignal[] {
  const signals: MappedSignal[] = [];

  // Qdrant chunk signals: top chunks get high base score
  for (let i = 0; i < input.topChunkIds.length; i++) {
    signals.push({
      source: 'qdrant',
      id:     input.topChunkIds[i],
      score:  1 - i * 0.08,  // rank decay: 1.0, 0.92, 0.84, ...
      why:    `qdrant rank ${i + 1}`,
    });
  }

  // SOM neighbour signals: adjacent cells are spatially related
  if (input.topSomRow != null && input.topSomCol != null) {
    const neighbours = somNeighbourCells(input.topSomRow, input.topSomCol, 1);
    for (const [r, c] of neighbours) {
      signals.push({
        source: 'som',
        id:     `som:${r}:${c}`,
        score:  0.65,
        why:    `SOM neighbour (${r},${c}) of query cell (${input.topSomRow},${input.topSomCol})`,
      });
    }
  }

  // Graph neighbor signals: known-adjacent documents are high-value
  for (const nid of (input.graphNeighborIds ?? [])) {
    signals.push({
      source: 'graph',
      id:     nid,
      score:  0.72,
      why:    'graph neighbor from KAG expansion',
    });
  }

  // Engram signals: historically co-occurring queries → related memory regions
  for (const suggestion of (input.engramSuggestions ?? [])) {
    signals.push({
      source: 'engram',
      id:     `engram:${suggestion.slice(0, 40)}`,
      score:  0.58,
      why:    `engram next-query: "${suggestion}"`,
    });
  }

  // HMM tool signals: map section → likely next MCP tool calls
  const tools = SECTION_TOOLS[input.hmmSection] ?? SECTION_TOOLS.UNKNOWN;
  for (const tool of tools) {
    signals.push({
      source: 'hmm_tool',
      id:     tool,
      score:  0.80 * input.hmmConf + 0.40 * (1 - input.hmmConf),  // confidence-weighted
      why:    `HMM section ${input.hmmSection} (conf ${input.hmmConf.toFixed(2)}) → ${tool}`,
    });
  }

  return signals;
}

// ── REDUCE phase — merge signals into ranked recommendations ──────────────────

interface ReducedRecommendation {
  id:       string;
  score:    number;
  sources:  string[];
  why:      string[];
}

function reduceSignals(signals: MappedSignal[]): ReducedRecommendation[] {
  const byId = new Map<string, ReducedRecommendation>();

  for (const s of signals) {
    const existing = byId.get(s.id);
    if (existing) {
      // Additive fusion: log(1 + score) dampens diminishing returns
      existing.score += Math.log1p(s.score);
      existing.sources.push(s.source);
      existing.why.push(s.why);
    } else {
      byId.set(s.id, {
        id:      s.id,
        score:   s.score,
        sources: [s.source],
        why:     [s.why],
      });
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build adaptive prefetch recommendations for the current retrieval pass.
 *
 * Pure function — no I/O.  Call this after graph-reranker and before
 * assembling the Gemma4 context packet.  Results are logged to
 * `retrievalTrace.adaptiveRecommendations`.
 */
export function buildAdaptivePrefetch(input: PrefetchInput): AdaptiveRecommendations {
  const t0 = Date.now();

  // MAP: score all signal sources independently
  const signals = mapSignals(input);

  // REDUCE: merge + rank
  const reduced = reduceSignals(signals);

  // Split into chunks vs tools
  const chunkRecs  = reduced.filter(r => !r.id.startsWith('trace.') && !r.id.startsWith('topology.') && !r.id.startsWith('graph.') && !r.id.startsWith('clusters.'));
  const toolRecs   = reduced.filter(r => r.id.startsWith('trace.') || r.id.startsWith('topology.') || r.id.startsWith('graph.') || r.id.startsWith('clusters.'));

  const recommendedChunks = chunkRecs.slice(0, 10).map(r => r.id);
  const recommendedTools  = toolRecs.slice(0, 4).map(r => r.id);

  // Prefetch keys: Redis cache patterns for warm-up
  const prefetchKeys: string[] = [
    ...input.topChunkIds.map(id => `ace:chunk:${id}`),
    // SOM cell texture tiles
    ...(input.topSomRow != null && input.topSomCol != null
      ? somNeighbourCells(input.topSomRow, input.topSomCol, 1)
          .map(([r, c]) => `som:bow:${r}:${c}`)
      : []),
    // Graph neighbor KAG nodes
    ...(input.graphNeighborIds ?? []).slice(0, 5).map(id => `kag:node:${id}`),
    // Engram next-query ring
    `ace:engram:dym:${input.query.slice(0, 32).replace(/\s+/g, '_')}`,
  ];

  // Axis weights for the TRACE log
  const mult = hmmAxisMultiplier(input.hmmSection, input.hmmConf);
  const axisWeights: [number, number, number, number] = [mult.w, mult.x, mult.y, mult.z];

  // Collect top-level why entries
  const topWhy = reduced.slice(0, 6).flatMap(r => r.why.slice(0, 1));

  return {
    recommendedChunks,
    recommendedTools,
    prefetchKeys,
    axisWeights,
    why:       topWhy,
    durationMs: Date.now() - t0,
  };
}
