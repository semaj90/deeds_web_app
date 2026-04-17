/**
 * HMM ACE Analyzer
 *
 * Applies the section HMM to assembled ACE context sequences for:
 *
 *   1. Narrative flow scoring — how coherent is the glyph section sequence?
 *      Uses transition matrix log-probabilities as the flow metric.
 *
 *   2. Graph compression hints — adjacent same-section glyphs with high
 *      confidence → merge candidate; unexpected section jumps → split boundary.
 *      Written to Neo4j SIMILAR_TOPOLOGY edge weights.
 *
 *   3. Interim inference — assembles a structured ACE context from the
 *      glyph-prompt-cache (L0.5) in <10ms while synthesis.generate queues
 *      on RabbitMQ waiting for GPU VRAM. Returns immediately via SSE event 1;
 *      synthesis result arrives as SSE event 2 and replaces it.
 *
 *   4. Unsupervised user analytics — each HMM decode is logged to Langfuse
 *      (traceGraph) and a Redis sorted set (hmm:user:{userId}:sections) so
 *      the system learns which sections each user queries most. This feeds
 *      graph compression priority: high-affinity sections get denser clusters.
 */

import type { GlyphRecord, GlyphSection } from '$lib/server/types/glyph.js';
import { hmmStateToGlyphSection } from '$lib/server/types/glyph.js';
import { predictChunk, tokenize, type HMMRawState, type HMMPrediction } from './hmm-section-classifier.js';
import { getFragment } from '$lib/server/glyph-prompt-cache.js';
import { traceGraph, traceCache } from '$lib/server/observability/langfuse.js';
import { getRedis } from '$lib/server/redis.js';

// ─── Section transition log-probs (mirrors TRANSITIONS in classifier) ─────────

const LOG_TRANS: Record<string, Partial<Record<string, number>>> = {
  PARTIES:        { JURISDICTION: Math.log(0.9), FACTS: Math.log(0.1) },
  JURISDICTION:   { FACTS: Math.log(0.8), LEGAL_AUTHORITY: Math.log(0.2) },
  FACTS:          { LEGAL_AUTHORITY: Math.log(0.7), CLAIMS: Math.log(0.3) },
  LEGAL_AUTHORITY:{ CLAIMS: Math.log(0.8), FACTS: Math.log(0.2) },
  CLAIMS:         { PRAYER: Math.log(0.6), HOLDING: Math.log(0.4) },
  PRAYER:         { HOLDING: Math.log(0.9), PARTIES: Math.log(0.1) },
  HOLDING:        { PARTIES: Math.log(0.1), HOLDING: Math.log(0.9) },
};

const LOG_UNKNOWN = Math.log(1 / 7); // uniform fallback

function transLogProb(from: GlyphSection | HMMRawState, to: GlyphSection | HMMRawState): number {
  return (LOG_TRANS[from] as Record<string, number> | undefined)?.[to] ?? LOG_UNKNOWN;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CompressionHint {
  glyphIdA: string;
  glyphIdB: string;
  /** merge: same section + high confidence → single Neo4j node */
  action: 'merge' | 'split' | 'keep';
  reason: string;
  confidence: number;
}

export interface ACEFlowAnalysis {
  /** 0–1 coherence score. 1 = follows canonical legal section order perfectly */
  flowScore: number;
  /** Unique sections present in the glyph sequence */
  sectionCoverage: GlyphSection[];
  /** Pairs where section jumped unexpectedly (log-prob below threshold) */
  gaps: Array<{ fromSection: GlyphSection; toSection: GlyphSection; glyphIdA: string; glyphIdB: string }>;
  compressionHints: CompressionHint[];
  dominantSection: GlyphSection;
  /** HMM confidence per glyph (index-aligned to input array) */
  perGlyphConfidence: number[];
}

export interface InterimInference {
  /** ACE context assembled from L0.5 glyph-prompt-cache, ready to stream */
  context: string;
  /** Section HMM identified for query — use as Qdrant sectionBias */
  sectionBias: GlyphSection;
  /** How the interim context was sourced */
  cacheSource: 'glyph-prompt' | 'fresh-fragment' | 'empty';
  /** 0-1 narrative flow quality of the assembled context */
  flowScore: number;
  hmmLatencyMs: number;
  /** false while RabbitMQ synthesis is still queued/processing */
  readyForSynthesis: false;
}

// ─── Flow scoring ─────────────────────────────────────────────────────────────

const FLOW_GAP_THRESHOLD = Math.log(0.05); // below this = unexpected transition

/**
 * Score how well a sequence of GlyphSections follows the canonical legal
 * document order.  Uses transition log-probabilities summed over all adjacent
 * pairs, normalized to 0–1.
 */
export function scoreNarrativeFlow(sections: GlyphSection[]): number {
  if (sections.length < 2) return 1;
  let totalLogP = 0;
  let pairs = 0;
  for (let i = 0; i < sections.length - 1; i++) {
    if (sections[i] === 'UNKNOWN' || sections[i + 1] === 'UNKNOWN') continue;
    totalLogP += transLogProb(sections[i], sections[i + 1]);
    pairs++;
  }
  if (pairs === 0) return 1;
  // Normalize: worst possible avg log-prob ≈ LOG_UNKNOWN (-1.95), best ≈ 0
  const avgLogP = totalLogP / pairs;
  return Math.max(0, Math.min(1, 1 + avgLogP / Math.abs(LOG_UNKNOWN)));
}

// ─── ACE flow analysis ────────────────────────────────────────────────────────

/**
 * Analyze the section sequence across a pool of GlyphRecords.
 * Produces flow score, gap detection, and graph compression hints.
 *
 * Traces to Langfuse under 'graph:hmm-ace-flow'.
 */
export async function analyzeACEFlow(
  glyphs: GlyphRecord[],
  opts: { userId?: string; caseId?: string } = {}
): Promise<ACEFlowAnalysis> {
  return traceGraph('hmm-ace-flow', { glyphCount: glyphs.length, ...opts }, async () => {
    if (glyphs.length === 0) {
      return {
        flowScore: 1,
        sectionCoverage: [],
        gaps: [],
        compressionHints: [],
        dominantSection: 'UNKNOWN' as GlyphSection,
        perGlyphConfidence: [],
      };
    }

    // Run HMM on each glyph's semantic content to get per-glyph confidence
    const predictions: HMMPrediction[] = glyphs.map(g =>
      predictChunk(g.semantic.content ?? g.semantic.summary)
    );

    // Use stored section where available; fall back to HMM prediction
    const resolvedSections: GlyphSection[] = glyphs.map((g, i) => {
      if (g.semantic.section !== 'UNKNOWN') return g.semantic.section;
      return hmmStateToGlyphSection(predictions[i].primaryState);
    });

    const perGlyphConfidence = predictions.map(p => p.confidence);

    // Flow score over the resolved section sequence
    const flowScore = scoreNarrativeFlow(resolvedSections);

    // Gaps: adjacent pairs with unexpectedly low transition probability
    const gaps: ACEFlowAnalysis['gaps'] = [];
    for (let i = 0; i < resolvedSections.length - 1; i++) {
      const logP = transLogProb(resolvedSections[i], resolvedSections[i + 1]);
      if (logP < FLOW_GAP_THRESHOLD) {
        gaps.push({
          fromSection: resolvedSections[i],
          toSection: resolvedSections[i + 1],
          glyphIdA: glyphs[i].glyphId,
          glyphIdB: glyphs[i + 1].glyphId,
        });
      }
    }

    // Compression hints
    const compressionHints = getCompressionHints(glyphs, resolvedSections, perGlyphConfidence);

    // Dominant section (mode)
    const sectionCounts = new Map<GlyphSection, number>();
    for (const s of resolvedSections) sectionCounts.set(s, (sectionCounts.get(s) ?? 0) + 1);
    const dominantSection = [...sectionCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const sectionCoverage = [...new Set(resolvedSections)];

    // Track section affinity in Redis for user analytics (fire-and-forget)
    if (opts.userId) {
      _trackSectionAffinity(opts.userId, dominantSection).catch(() => {});
    }

    return {
      flowScore,
      sectionCoverage,
      gaps,
      compressionHints,
      dominantSection,
      perGlyphConfidence,
    };
  });
}

// ─── Compression hints ────────────────────────────────────────────────────────

const MERGE_CONFIDENCE_THRESHOLD = 0.7;
const SPLIT_LOG_THRESHOLD = Math.log(0.08);

/**
 * Produce merge/split recommendations for Neo4j SIMILAR_TOPOLOGY edge weights.
 * Consumed by codebase-neo4j-sync.ts when writing graph edges.
 */
export function getCompressionHints(
  glyphs: GlyphRecord[],
  sections?: GlyphSection[],
  confidences?: number[]
): CompressionHint[] {
  const resolvedSections = sections ?? glyphs.map(g => g.semantic.section);
  const resolvedConf = confidences ?? glyphs.map(() => 0.5);
  const hints: CompressionHint[] = [];

  for (let i = 0; i < glyphs.length - 1; i++) {
    const sA = resolvedSections[i];
    const sB = resolvedSections[i + 1];
    const confA = resolvedConf[i];
    const confB = resolvedConf[i + 1];
    const avgConf = (confA + confB) / 2;
    const logP = transLogProb(sA, sB);

    if (sA === sB && avgConf >= MERGE_CONFIDENCE_THRESHOLD) {
      hints.push({
        glyphIdA: glyphs[i].glyphId,
        glyphIdB: glyphs[i + 1].glyphId,
        action: 'merge',
        reason: `same section (${sA}), confidence ${avgConf.toFixed(2)}`,
        confidence: avgConf,
      });
    } else if (logP < SPLIT_LOG_THRESHOLD && sA !== 'UNKNOWN' && sB !== 'UNKNOWN') {
      hints.push({
        glyphIdA: glyphs[i].glyphId,
        glyphIdB: glyphs[i + 1].glyphId,
        action: 'split',
        reason: `unexpected section jump ${sA}→${sB} (log-p=${logP.toFixed(2)})`,
        confidence: avgConf,
      });
    } else {
      hints.push({
        glyphIdA: glyphs[i].glyphId,
        glyphIdB: glyphs[i + 1].glyphId,
        action: 'keep',
        reason: `normal transition ${sA}→${sB}`,
        confidence: avgConf,
      });
    }
  }
  return hints;
}

// ─── Interim inference (cache fast-path) ─────────────────────────────────────

/**
 * Assemble a structured ACE context from the glyph-prompt-cache (L0.5) in <10ms
 * while synthesis.generate is queued on RabbitMQ awaiting GPU VRAM.
 *
 * Call pattern (SSE endpoint):
 *   // Phase 1 — immediate (HMM + cache)
 *   const interim = await getInterimInference(query, glyphs, { userId });
 *   stream.send({ type: 'interim', ...interim });
 *
 *   // Phase 2 — after GPU synthesis completes (~25s)
 *   const synthesis = await pollSynthesisResult(jobId);
 *   stream.send({ type: 'final', ...synthesis });
 *
 * Traces to Langfuse under 'cache:hmm-interim'.
 */
export async function getInterimInference(
  query: string,
  glyphs: GlyphRecord[],
  opts: { userId?: string } = {}
): Promise<InterimInference> {
  const t0 = Date.now();

  return traceCache('hmm-interim', { userId: opts.userId, glyphCount: glyphs.length }, async () => {
    // 1. Classify query section → sectionBias for retrieval
    const queryTokens = tokenize(query);
    const queryPrediction = predictChunk(queryTokens.join(' '));
    const sectionBias = hmmStateToGlyphSection(queryPrediction.primaryState);

    // 2. Assemble context from glyph-prompt-cache (L0.5)
    //    Sort by section order to maximize narrative coherence
    const sectionOrder: Record<GlyphSection, number> = {
      PARTIES: 0, JURISDICTION: 1, FACTS: 2, LEGAL_AUTHORITY: 3,
      CLAIMS: 4, PRAYER_HOLDING: 5, UNKNOWN: 6,
    };
    const sorted = [...glyphs].sort(
      (a, b) => (sectionOrder[a.semantic.section] ?? 6) - (sectionOrder[b.semantic.section] ?? 6)
    );

    const fragments: string[] = [];
    let cacheHits = 0;
    for (const g of sorted) {
      const key = g.render.promptCacheKey ?? `glyph:${g.glyphId}`;
      const cached = getFragment(key);
      if (cached) {
        fragments.push(cached);
        cacheHits++;
      } else if (g.semantic.summary) {
        // Build minimal fragment inline rather than returning nothing
        const lines: string[] = [];
        if (g.semantic.section !== 'UNKNOWN') lines.push(`[${g.semantic.section}]`);
        lines.push(g.semantic.summary);
        fragments.push(lines.join('\n'));
      }
    }

    const context = fragments.join('\n\n---\n\n');
    const cacheSource: InterimInference['cacheSource'] =
      cacheHits === sorted.length ? 'glyph-prompt'
      : cacheHits > 0            ? 'fresh-fragment'
      :                            'empty';

    // 3. Flow score on the sorted sections (section-ordered = best possible flow)
    const flowScore = scoreNarrativeFlow(sorted.map(g => g.semantic.section));

    // 4. Track cache hit analytics per user
    if (opts.userId) {
      _trackCacheHit(opts.userId, cacheSource, sectionBias).catch(() => {});
    }

    return {
      context,
      sectionBias,
      cacheSource,
      flowScore,
      hmmLatencyMs: Date.now() - t0,
      readyForSynthesis: false,
    };
  });
}

/**
 * Classify a query string to its most likely legal section.
 * Lightweight alias used by SSE/retrieval to set Qdrant sectionBias.
 */
export function classifyQuerySection(query: string): { section: GlyphSection; confidence: number } {
  const prediction = predictChunk(query);
  return {
    section: hmmStateToGlyphSection(prediction.primaryState),
    confidence: prediction.confidence,
  };
}

// ─── User analytics (fire-and-forget Redis) ───────────────────────────────────

/** Redis sorted set: hmm:user:{userId}:sections — member=section, score=count */
async function _trackSectionAffinity(userId: string, section: GlyphSection): Promise<void> {
  try {
    const redis = getRedis();
    const key = `hmm:user:${userId}:sections`;
    await redis.zincrby(key, 1, section);
    await redis.expire(key, 90 * 24 * 60 * 60); // 90-day TTL
  } catch {
    // Non-fatal — analytics should never block the pipeline
  }
}

/** Redis sorted set: hmm:user:{userId}:cache — member=cacheSource, score=count */
async function _trackCacheHit(
  userId: string,
  source: InterimInference['cacheSource'],
  section: GlyphSection
): Promise<void> {
  try {
    const redis = getRedis();
    const cacheKey = `hmm:user:${userId}:cache`;
    await redis.zincrby(cacheKey, 1, source);
    await redis.expire(cacheKey, 90 * 24 * 60 * 60);
    // Also bump section affinity from cache path
    await _trackSectionAffinity(userId, section);
  } catch {
    // Non-fatal
  }
}

/**
 * Retrieve top sections for a user — consumed by graph compression priority
 * and ACE context token budget allocation.
 *
 * Returns sections sorted by query frequency, highest first.
 */
export async function getUserSectionAffinity(
  userId: string,
  topK = 3
): Promise<Array<{ section: GlyphSection; score: number }>> {
  try {
    const redis = getRedis();
    const key = `hmm:user:${userId}:sections`;
    // ZREVRANGE with WITHSCORES returns [member, score, member, score, ...]
    const raw = await redis.zrevrange(key, 0, topK - 1, 'WITHSCORES');
    const results: Array<{ section: GlyphSection; score: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      results.push({ section: raw[i] as GlyphSection, score: parseFloat(raw[i + 1]) });
    }
    return results;
  } catch {
    return [];
  }
}