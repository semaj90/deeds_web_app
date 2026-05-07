/**
 * HMM Wiki Logger — 4D Topology Store
 *
 * Writes HMM flow analysis results as wiki notes (wiki:note:hmm:{hash}) into the
 * Karpathy 4D topological datastore.  Caches aggressively: if a note for the
 * same glyph-pool hash exists in Redis it is returned immediately (no re-run).
 *
 * 4D coordinate contract:
 *   x, y  — SOM BMU position of the dominant glyph in the pool
 *   z      — narrative flowScore ∈ [0,1] from HMM transition log-probs
 *   w      — dominant section numeric (PARTIES=0…UNKNOWN=6); encodes legal
 *             position in the 4D space — queries cluster by legal section axis
 *
 * These coordinates are MCP-searchable via trace.kag_search (Redis SCAN +
 * optional Qdrant sectionBias injection).
 */

import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';
import type { GlyphRecord, GlyphSection } from '$lib/server/types/glyph.js';
import type { ACEFlowAnalysis } from '$lib/server/analysis/hmm-ace-analyzer.js';

// ── 4D coordinate constants ──────────────────────────────────────────────────

export const SECTION_W: Record<GlyphSection, number> = {
  PARTIES:        0,
  JURISDICTION:   1,
  FACTS:          2,
  LEGAL_AUTHORITY: 3,
  CLAIMS:         4,
  PRAYER_HOLDING: 5,
  UNKNOWN:        6,
};

const REDIS_PREFIX = 'wiki:note:hmm:';
const REDIS_TTL    = 6 * 60 * 60; // 6h — matches wiki:note:* TTL convention
const CACHE_HIT_KEY_PREFIX = 'hmm:flow:hit:'; // tracks whether note was cache-returned

// ── Types ────────────────────────────────────────────────────────────────────

export interface HMMWikiNote {
  /** wiki:note:hmm:{hash} — stable, deterministic, content-addressed */
  stableKey: string;
  kind: 'hmm_analysis';
  /** Source glyphs (ids only) */
  glyphIds: string[];
  /** Flow analysis output */
  flowScore: number;
  dominantSection: GlyphSection;
  sectionCoverage: GlyphSection[];
  compressionHints: ACEFlowAnalysis['compressionHints'];
  gaps: ACEFlowAnalysis['gaps'];
  perGlyphConfidence: number[];
  /** 4D coordinates — x/y from dominant glyph SOM, z = flowScore, w = section */
  x: number;
  y: number;
  z: number;
  w: number;
  /** Context the note was created in */
  userId?: string;
  caseId?: string;
  createdAt: string;
  /** false = freshly computed; true = returned from Redis cache */
  fromCache: boolean;
}

export interface HMMLogResult {
  note: HMMWikiNote;
  /** How many milliseconds the HMM analysis took (0 if cache hit) */
  analysisMs: number;
  /** Redis cache key that was checked/written */
  cacheKey: string;
  fromCache: boolean;
}

// ── Content hash ─────────────────────────────────────────────────────────────

/**
 * Stable SHA-256 hash of the glyph pool — identical pools produce identical
 * keys, so the cache is content-addressed not time-addressed.
 */
export function glyphPoolHash(glyphs: GlyphRecord[]): string {
  const ids = glyphs.map(g => g.glyphId).sort().join('|');
  return createHash('sha256').update(ids).digest('hex').slice(0, 24);
}

// ── 4D coordinate derivation ─────────────────────────────────────────────────

/**
 * Pick the dominant glyph's SOM position for x/y.
 * Falls back to (0, 0) if no SOM data is present.
 */
function dominantSOMCoords(
  glyphs: GlyphRecord[],
  dominant: GlyphSection
): { x: number; y: number } {
  const dominated = glyphs.find(g => g.semantic.section === dominant);
  const anyGlyph  = dominated ?? glyphs[0];
  return {
    x: (anyGlyph?.topology?.gridX ?? anyGlyph?.topology?.somCluster ?? 0),
    y: (anyGlyph?.topology?.gridY ?? 0),
  };
}

// ── Cache-first logger ───────────────────────────────────────────────────────

/**
 * Log HMM analysis as a 4D wiki note.
 *
 * Cache-first: if a note for this exact glyph pool already exists in Redis
 * within the 6h TTL, it is returned immediately and `fromCache = true`.
 * Only on a miss does the function write to Redis (and optionally CouchDB).
 *
 * Use `force = true` to bypass the cache check and always recompute.
 */
export async function logHMMAnalysis(
  analysis: ACEFlowAnalysis,
  glyphs: GlyphRecord[],
  opts: { userId?: string; caseId?: string; force?: boolean } = {}
): Promise<HMMLogResult> {
  const t0 = Date.now();
  const hash = glyphPoolHash(glyphs);
  const cacheKey = REDIS_PREFIX + hash;

  let redis: ReturnType<typeof getRedis> | null = null;
  try {
    redis = getRedis();
  } catch {
    // Redis unavailable — still produce note, skip cache
  }

  // ── Cache read ──
  if (!opts.force && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const note = JSON.parse(cached) as HMMWikiNote;
        return { note: { ...note, fromCache: true }, analysisMs: 0, cacheKey, fromCache: true };
      }
    } catch {
      // Non-fatal cache miss
    }
  }

  // ── Derive 4D coordinates ──
  const som = dominantSOMCoords(glyphs, analysis.dominantSection);
  const z   = analysis.flowScore;
  const w   = SECTION_W[analysis.dominantSection] ?? SECTION_W.UNKNOWN;

  const note: HMMWikiNote = {
    stableKey:          cacheKey,
    kind:               'hmm_analysis',
    glyphIds:           glyphs.map(g => g.glyphId),
    flowScore:          analysis.flowScore,
    dominantSection:    analysis.dominantSection,
    sectionCoverage:    analysis.sectionCoverage,
    compressionHints:   analysis.compressionHints,
    gaps:               analysis.gaps,
    perGlyphConfidence: analysis.perGlyphConfidence,
    x:                  som.x,
    y:                  som.y,
    z,
    w,
    userId:             opts.userId,
    caseId:             opts.caseId,
    createdAt:          new Date().toISOString(),
    fromCache:          false,
  };

  // ── Cache write ──
  if (redis) {
    try {
      await redis.setex(cacheKey, REDIS_TTL, JSON.stringify(note));
      // Track hit-count key so callers can measure cache warming over time
      await redis.sadd('hmm:flow:known_ids', hash).catch(() => {});
    } catch {
      // Non-fatal
    }
  }

  const analysisMs = Date.now() - t0;
  return { note, analysisMs, cacheKey, fromCache: false };
}

// ── Batch loop helper ─────────────────────────────────────────────────────────

/**
 * Run logHMMAnalysis over multiple (analysis, glyphs) pairs sequentially,
 * short-circuiting on cache hits.  Returns results in input order.
 *
 * "Incrementally updating unless cache" — each iteration is skipped if Redis
 * already holds a fresh note for that glyph pool.
 */
export async function logHMMBatch(
  pairs: Array<{ analysis: ACEFlowAnalysis; glyphs: GlyphRecord[] }>,
  opts: { userId?: string; caseId?: string; force?: boolean } = {}
): Promise<HMMLogResult[]> {
  const results: HMMLogResult[] = [];
  for (const { analysis, glyphs } of pairs) {
    const r = await logHMMAnalysis(analysis, glyphs, opts);
    results.push(r);
  }
  return results;
}

// ── MCP search helper (Redis SCAN) ────────────────────────────────────────────

/**
 * Scan Redis for all cached HMM wiki notes and return them sorted by flowScore.
 * The TRACE MCP `trace.kag_search` tool calls this to surface high-flow pools.
 *
 * Returns at most `limit` notes.  Does not hit Qdrant — pure Redis 4D lookup.
 */
export async function scanHMMNotes(
  filter: { minFlowScore?: number; section?: GlyphSection } = {},
  limit = 20
): Promise<HMMWikiNote[]> {
  let redis: ReturnType<typeof getRedis>;
  try {
    redis = getRedis();
  } catch {
    return [];
  }

  const notes: HMMWikiNote[] = [];
  let cursor = '0';
  try {
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', REDIS_PREFIX + '*', 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        const raws = await redis.mget(...keys);
        for (const raw of raws) {
          if (!raw) continue;
          try {
            const note = JSON.parse(raw) as HMMWikiNote;
            if (filter.minFlowScore !== undefined && note.z < filter.minFlowScore) continue;
            if (filter.section && note.dominantSection !== filter.section) continue;
            notes.push(note);
          } catch { /* skip malformed */ }
        }
      }
    } while (cursor !== '0' && notes.length < limit * 2);
  } catch {
    return notes;
  }

  return notes
    .sort((a, b) => b.z - a.z)   // descending flowScore = best narrative coherence first
    .slice(0, limit);
}
