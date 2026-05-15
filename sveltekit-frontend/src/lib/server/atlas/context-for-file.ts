/**
 * context-for-file — single entry point that answers
 *
 *   "Given this file path, what should the agent know before touching it?"
 *
 * Wraps the atlas + prompt-mapper + Redis directory cards + Karpathy/authority
 * neighbours into a compact, typed context packet. Read-only: never calls
 * Qdrant, never embeds, never mutates state. ~10ms warm (atlas cached),
 * ~50ms cold (Redis fetch + JSON.parse).
 *
 * Used by:
 *   - MCP tool       codebase.context_for_file (TRACE :8788)
 *   - HTTP endpoint  /api/ace/recommendations
 *   - Claude Code skill (.claude/skills/codebase-todo-recommendations.md)
 *   - UI atlas-context panel (planned)
 *
 * Composition order (cheapest → most expensive):
 *   1. normalize path
 *   2. atlas.files[] lookup (in-memory, O(n) but n ≤ ~7k) for this file's row
 *   3. Redis ace:atlas:dir:<slug>  → directory card with peers + tools + tags
 *   4. neighbours.{authority,karpathy} lookup via path aliases
 *   5. buildPromptCards filtered by agentsDir → top-N peer cards
 *   6. recommendedActions derived from gate flags + dirty + risk
 */

import type { Redis } from 'ioredis';
import { loadAtlas } from './atlas-loader.js';

// Lazy-import getRedis so the MCP server (which runs outside SvelteKit's
// bundler and can't resolve `$lib/...` aliases via tsx) can call this module
// as long as it injects its own Redis client. SvelteKit consumers that omit
// `opts.redis` still get the default per-process pool below.
async function defaultGetRedis(): Promise<Redis | null> {
  try {
    const mod = await import('$lib/server/redis.js' as string);
    return mod.getRedis();
  } catch {
    return null;
  }
}
import { type AtlasFile, rowToFile } from './types.js';
import { buildPromptCards, type PromptCard } from './prompt-mapper.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CodebaseContextForFile {
  /** Path as the caller passed it (kept for IDE / Claude Code links). */
  filePath: string;
  /** Atlas-normalized path (no src/ or sveltekit-frontend/ prefix). */
  normalizedPath: string;

  /** Small ownership / routing summary for the retrieval ladder. */
  retrieval: {
    exactPath: string;
    directoryPath: string;
    agentsDir?: string;
    peerScope: 'agentsDir' | 'cluster' | 'none';
  };

  directory: {
    path:        string;
    rank:        number;
    agentsDir?:  string;
    topo:        string[];
    clusters:    string[];
    tags:        string[];
    tools:       string[];
    constraints: string[];
  };

  file: {
    graphAuthorityScore?: number;
    graphPageRank?:       number;
    karpathyBlend?:       number;
    karpathyAttention?:   number;
    hitCount?:            number;
    /**
     * Live demand signal from chunk_hit_log (last N hours, Redis-cached).
     * `hits` × `avgRerank` = `hotScore` — the squashed value feeds fileRank.
     */
    hitDemand?: {
      hits:        number;
      hotScore:    number;
      avgRerank:   number;
      lastHitAt?:  string;
    };
    dirty?:               boolean;
    rank:                 number;
    reasons:              string[];
  };

  /** Top peer cards for the same agentsDir / cluster (capped at ~6). */
  promptCards: PromptCard[];

  /**
   * Imperative bullets the agent should consider before editing.
   * Derived from atlas signals — never invents rules from thin air.
   */
  recommendedActions: string[];

  provenance: {
    atlas:        'redis' | 'fs' | 'cache' | 'empty';
    generatedAt?: string;
    sources:     string[];
  };
}

export interface ContextForFileOptions {
  /** Cap on prompt cards returned. Default 6. */
  peerLimit?: number;
  /** Force reload of atlas / Redis data. Default false (use 5min cache). */
  forceReload?: boolean;
  /**
   * Optional injected Redis client. The TRACE MCP server runs outside the
   * SvelteKit bundler and can't resolve `$lib/server/redis.js`, so it passes
   * its own ioredis instance. Falls back to getRedis() when omitted.
   */
  redis?: Redis | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeAtlasPath(path: string): string {
  return String(path)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^src\//, '');
}

function pathAliases(path: string): string[] {
  const p       = String(path).replace(/\\/g, '/').replace(/^\.?\//, '');
  const noSrc   = p.replace(/^src\//, '');
  const withSrc = p.startsWith('src/') ? p : `src/${p}`;
  return Array.from(new Set([p, noSrc, withSrc]));
}

function dirOf(filePath: string): string {
  const p = filePath.replace(/\\/g, '/');
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function dirSlug(dir: string): string {
  return dir.replace(/[/()]/g, '_');
}

function lookupByPath<T>(map: Record<string, T> | undefined, path: string): T | undefined {
  if (!map) return undefined;
  for (const key of pathAliases(path)) {
    const v = map[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

function safeParse<T = Record<string, unknown>>(raw: unknown): T | null {
  if (typeof raw === 'object' && raw !== null) return raw as T;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── Directory card shape (mirrors build-atlas-index.mjs output) ──────────────
//
// Keys are intentionally cryptic in Redis to keep the JSON small (~3-5KB per
// dir × 918 dirs = ~3-4MB). We expand them to readable names in the response.
interface RawDirCard {
  d?:        string;            // directory path
  a?:        string;            // LLMS.md path
  p?:        string;            // parent LLMS.md path
  n?:        number;            // file count
  clusters?: string[];
  topo?:     string[];
  tools?:    string[];
  tags?:     string[];
  pr?:       number;
  auth?:     number;
  avgAuth?:  number;
  kgpu?:     number;
  hits?:     number;
  dirty?:    boolean;
  rank?:     number;
  top?:      string[];
  constraints?: string[];
}

async function loadDirectoryCard(
  redis: Redis | null,
  dir: string,
): Promise<RawDirCard | null> {
  if (!redis) return null;
  // build-atlas-index.mjs writes slugs from the src/-prefixed shape
  // ('src_lib_server_db'), but callers may pass either the normalized
  // shape ('lib/server/db') or the original ('src/lib/server/db'). Try
  // both forms — first match wins.
  const candidates = [
    dirSlug(dir),
    dirSlug(`src/${dir}`),
    dirSlug(dir.replace(/^src\//, '')),
  ];
  const seen = new Set<string>();
  for (const slug of candidates) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    try {
      const raw = await redis.get(`ace:atlas:dir:${slug}`);
      const parsed = safeParse<RawDirCard>(raw);
      if (parsed) return parsed;
    } catch { /* try next */ }
  }
  return null;
}

async function loadDirtySet(redis: Redis | null): Promise<Set<string>> {
  if (!redis) return new Set();
  try {
    const arr = await redis.smembers('ace:rank:dirty_files');
    return new Set(arr.map(normalizeAtlasPath));
  } catch {
    return new Set();
  }
}

interface HitDemand {
  hits:        number;
  hot_score:   number;
  avg_rerank:  number;
  last_hit_at: string | null;
}

/**
 * Pull demand signal from `ace:rank:demand` (1h TTL hash, seeded by
 * `scripts/seed-hit-demand.mjs` from `chunk_hit_log` aggregations).
 * Returns null if the hash is missing or the file isn't hot — the rank
 * formula degrades gracefully to 0 contribution from this lane.
 */
async function loadHitDemand(
  redis: Redis | null,
  normalizedPath: string,
): Promise<HitDemand | null> {
  if (!redis) return null;
  try {
    const raw = await redis.hget('ace:rank:demand', normalizedPath);
    return safeParse<HitDemand>(raw);
  } catch {
    return null;
  }
}

// ── Recommended-actions synthesis ────────────────────────────────────────────
//
// Pure-atlas — only emits actions the data actually justifies. Caller layers
// (MCP tool / UI) can stack additional suggestions on top.
function buildRecommendedActions(
  file: AtlasFile | null,
  dirCard: RawDirCard | null,
  isDirty: boolean,
  karpathyBlend: number | null,
): string[] {
  const out: string[] = [];

  if (isDirty) {
    out.push('Recently changed — verify dirty file passes the existing test surface before adding more changes.');
  }

  if (file) {
    if (file.ga >= 0.4) {
      out.push(`High graph authority (${file.ga.toFixed(2)}) — changes here ripple widely; prefer the smallest diff that satisfies the requirement.`);
    }
    if (file.h >= 5) {
      out.push(`Frequently retrieved (${file.h} ACE hits) — agents already lean on this file; preserve external behaviour.`);
    }
    if (file.rules > 0 || file.tools > 0) {
      out.push(`${file.rules} rule(s) / ${file.tools} tool entry(s) in nearest LLMS.md — read those before editing.`);
    }
    if (karpathyBlend != null && karpathyBlend >= 2.5) {
      out.push(`Karpathy GPU blend ${karpathyBlend.toFixed(2)} — top-tier composite priority; treat as a stabilization target.`);
    }
  }

  if (dirCard?.constraints?.length) {
    out.push(`Directory constraints in scope: ${dirCard.constraints.slice(0, 4).join('; ')}.`);
  }

  if (dirCard?.tools?.length) {
    out.push(`Allowed tooling for this scope: ${dirCard.tools.slice(0, 6).join(', ')}.`);
  }

  if (out.length === 0) {
    out.push('No atlas flags raised — proceed but still patch the smallest surface and run the targeted smoke before committing.');
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Build a single CodebaseContextForFile packet. Always returns a valid object
 * even when atlas is empty — degraded fields stay undefined / 0 / [].
 */
export async function contextForFile(
  rawPath: string,
  opts: ContextForFileOptions = {},
): Promise<CodebaseContextForFile> {
  const { peerLimit = 6, forceReload = false, redis: redisOverride = null } = opts;
  const sources: string[] = [];

  const filePath       = String(rawPath ?? '');
  const normalizedPath = normalizeAtlasPath(filePath);
  const directory      = dirOf(normalizedPath);

  // ── Atlas (cached) ─────────────────────────────────────────────────────────
  const { atlas, neighbours, source: atlasSource } = await loadAtlas(forceReload);
  if (atlas.files.length > 0) sources.push(`atlas(${atlas.files.length} files)`);

  // Find the file row by trying every alias until one matches atlas.files[].f
  let row: AtlasFile | null = null;
  if (atlas.files.length > 0) {
    const aliases = new Set(pathAliases(filePath));
    aliases.add(normalizedPath);
    for (const idx of atlas.files.keys()) {
      const candidate = rowToFile(atlas.files[idx], atlas.schema);
      if (aliases.has(candidate.f)) { row = candidate; break; }
    }
  }

  // ── Redis: dirty set + directory card ─────────────────────────────────────
  // Prefer the injected client (MCP server scenario); fall back to the
  // SvelteKit per-process pool. Either is fine — both expose the same API
  // surface we need (smembers / get).
  let redis: Redis | null = redisOverride;
  if (!redis) {
    redis = await defaultGetRedis();
  }

  const [dirtySet, dirCard, hitDemand] = await Promise.all([
    loadDirtySet(redis),
    loadDirectoryCard(redis, directory),
    loadHitDemand(redis, normalizedPath),
  ]);
  if (dirCard) sources.push(`dir-card(${directory})`);
  if (hitDemand && hitDemand.hits > 0) sources.push(`hit-demand(hits=${hitDemand.hits})`);
  const isDirty = dirtySet.has(normalizedPath);

  // ── Karpathy + authority neighbours via path aliases ──────────────────────
  const karpRaw = lookupByPath(neighbours.karpathy, filePath);
  const authRaw = lookupByPath(neighbours.authority, filePath);
  const karp    = safeParse<{ pr?: number; attn?: number; authority?: number; blend?: number }>(karpRaw);
  const auth    = safeParse<{ ga?: number; pr?: number; cluster?: string }>(authRaw);
  if (karp) sources.push('karpathy');
  if (auth) sources.push('authority');

  const graphAuthorityScore = row?.ga ?? auth?.ga;
  const graphPageRank       = row?.pr ?? auth?.pr ?? karp?.pr;
  const karpathyBlend       = karp?.blend ?? null;
  const karpathyAttention   = karp?.attn  ?? null;

  // ── Peer prompt cards: prefer agentsDir filter, fall back to cluster ──────
  let peerScope: 'agentsDir' | 'cluster' | 'none' = 'none';
  const promptCards = await (async (): Promise<PromptCard[]> => {
    if (atlas.files.length === 0) return [];
    if (row?.a) {
      const cards = await buildPromptCards({
        topN: peerLimit,
        filter: { agentsDir: row.a },
      });
      if (cards.length) {
        peerScope = 'agentsDir';
        sources.push(`peers(agentsDir=${row.a})`);
        return cards;
      }
    }
    if (row?.c) {
      const cards = await buildPromptCards({
        topN: peerLimit,
        filter: { cluster: row.c },
      });
      if (cards.length) {
        peerScope = 'cluster';
        sources.push(`peers(cluster=${row.c})`);
        return cards;
      }
    }
    return [];
  })();

  // ── File rank synthesis (deterministic) ───────────────────────────────────
  // Hit-demand normalization: `hot_score` is unbounded (hits × avg_rerank).
  // Observed range in cold dev: 0-5; in production: 0-50+. Use logarithmic
  // squashing so a few warm hits produce signal without one hot file
  // dominating the rank when the demand window is short.
  const demandHotRaw   = hitDemand?.hot_score ?? 0;
  const demandSquashed = demandHotRaw > 0 ? Math.min(1, Math.log1p(demandHotRaw) / Math.log1p(20)) : 0;

  const fileReasons: string[] = [];
  if (graphAuthorityScore != null) fileReasons.push(`authority=${graphAuthorityScore.toFixed(2)}`);
  if (graphPageRank != null && graphPageRank > 0) fileReasons.push(`PR=${graphPageRank.toFixed(2)}`);
  if (karpathyBlend != null) fileReasons.push(`gpu_blend=${karpathyBlend.toFixed(2)}`);
  if (karpathyAttention != null && karpathyAttention >= 0.95) fileReasons.push('high-attention');
  if (isDirty) fileReasons.push('dirty');
  if (hitDemand && hitDemand.hits > 0) fileReasons.push(`demand=${hitDemand.hits}×${hitDemand.avg_rerank.toFixed(2)}`);
  if (dirCard?.clusters?.length) fileReasons.push(`dir-clusters=${dirCard.clusters.length}`);

  // Weights re-balanced to make room for demand without over-rotating away
  // from the structural signals (authority/PR/karpathy still dominate at 80%).
  // Demand at 12% means 5+ recent hot hits beats a one-off dirty flag (10%)
  // but won't overwhelm a top-authority file with no recent traffic.
  const fileRank =
    0.36 * (graphAuthorityScore ?? 0) +
    0.18 * Math.min(1, (graphPageRank ?? 0) / 8) +    // PR observed range 0..8
    0.13 * (karpathyAttention ?? 0) +
    0.13 * (karpathyBlend != null ? Math.min(1, karpathyBlend / 3.5) : 0) +
    0.12 * demandSquashed +                            // NEW — chunk_hit_log demand
    (isDirty ? 0.08 : 0);

  // ── Assemble packet ───────────────────────────────────────────────────────
  return {
    filePath,
    normalizedPath,
    retrieval: {
      exactPath: filePath,
      directoryPath: dirCard?.d ?? directory,
      agentsDir: row?.a ?? dirCard?.a,
      peerScope,
    },
    directory: {
      path:        dirCard?.d ?? directory,
      rank:        dirCard?.rank ?? 0,
      agentsDir:   row?.a ?? dirCard?.a,
      topo:        dirCard?.topo     ?? (row?.tc ? [row.tc] : []),
      clusters:    dirCard?.clusters ?? (row?.c ? [row.c]  : []),
      tags:        dirCard?.tags     ?? [],
      tools:       dirCard?.tools    ?? [],
      constraints: dirCard?.constraints ?? [],
    },
    file: {
      graphAuthorityScore,
      graphPageRank,
      karpathyBlend:     karpathyBlend     ?? undefined,
      karpathyAttention: karpathyAttention ?? undefined,
      // Live demand from chunk_hit_log (1h Redis cache, seed-hit-demand.mjs);
      // falls back to atlas-baked counts when Redis miss.
      hitCount:          hitDemand?.hits ?? row?.h ?? dirCard?.hits,
      hitDemand:         hitDemand
        ? {
            hits:        hitDemand.hits,
            hotScore:    hitDemand.hot_score,
            avgRerank:   hitDemand.avg_rerank,
            lastHitAt:   hitDemand.last_hit_at ?? undefined,
          }
        : undefined,
      dirty:             isDirty,
      rank:              Math.round(fileRank * 1000) / 1000,
      reasons:           fileReasons,
    },
    promptCards,
    recommendedActions: buildRecommendedActions(row, dirCard, isDirty, karpathyBlend),
    provenance: {
      atlas:        atlasSource,
      generatedAt:  atlas.generated_at,
      sources,
    },
  };
}
