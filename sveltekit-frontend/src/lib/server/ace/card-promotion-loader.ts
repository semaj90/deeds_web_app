/**
 * Card Promotion Loader — Atlas Memory Lifecycle
 *
 * Loads card promotion states from the outcome ledger and makes them
 * available for ranking boosts in ACE context assembly.
 *
 * Maps sourceRef → { state, boost, usageCount, rewardRate }
 *
 * Promotion States:
 * - fresh (0 uses): boost 1.0× (baseline)
 * - engaged (1-3 uses): boost 1.2× (showing promise)
 * - warm (4+ uses, reward>0.6): boost 1.8× (valuable, proven)
 * - hot (80%+ reuse rate): boost 3.0× (critical resource)
 * - archived (30d unused): boost 0.1× (evict from L1 cache)
 */

import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

export interface CardPromotionState {
  state: 'fresh' | 'engaged' | 'warm' | 'hot' | 'archived';
  boost: number;
  usageCount: number;
  rewardCount: number;
  rewardRate: number;
  totalReward: number;
  graphVersion: string;
  lastUpdated: string;
}

interface SourceRefPerformanceData {
  [sourceRef: string]: {
    sourceRef: string;
    usageCount: number;
    rewardCount: number;
    rewardRate: number;
    avgReward: number;
    totalReward: number;
    promotionState: string;
    authority: number;
    toolCount: number;
    graphVersion: string;
    lastUpdated: string;
  };
}

// Cache promotion states in memory (reload on each request for freshness)
// In production, this could be backed by Redis with 1-hour TTL
let cachedPromotionStates: Map<string, CardPromotionState> | null = null;
let cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load card promotion states from memory/rewards/sourceRef-performance.json
 *
 * Returns empty Map if file doesn't exist (graceful degradation)
 */
export function loadCardPromotionStates(): Map<string, CardPromotionState> {
  const now = Date.now();

  // Return cached version if still fresh
  if (cachedPromotionStates && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedPromotionStates;
  }

  const ledgerPath = join(process.cwd(), 'memory', 'rewards', 'sourceRef-performance.json');

  if (!existsSync(ledgerPath)) {
    // No promotion data yet — return empty map (system will use baseline boosts)
    cachedPromotionStates = new Map();
    cacheLoadedAt = now;
    return cachedPromotionStates;
  }

  try {
    const rawData = readFileSync(ledgerPath, 'utf-8');
    const data: SourceRefPerformanceData = JSON.parse(rawData);

    const states = new Map<string, CardPromotionState>();

    for (const [sourceRef, perf] of Object.entries(data)) {
      const state = perf.promotionState as
        | 'fresh'
        | 'engaged'
        | 'warm'
        | 'hot'
        | 'archived';

      // Map promotion state to ranking boost
      const boostMap: Record<string, number> = {
        fresh: 1.0,
        engaged: 1.2,
        warm: 1.8,
        hot: 3.0,
        archived: 0.1,
      };

      states.set(sourceRef, {
        state,
        boost: boostMap[state] ?? 1.0,
        usageCount: perf.usageCount,
        rewardCount: perf.rewardCount,
        rewardRate: perf.rewardRate,
        totalReward: perf.totalReward,
        graphVersion: perf.graphVersion,
        lastUpdated: perf.lastUpdated,
      });
    }

    cachedPromotionStates = states;
    cacheLoadedAt = now;
    return states;
  } catch (err) {
    console.warn(
      `[card-promotion-loader] Failed to load promotion states: ${err instanceof Error ? err.message : String(err)}`
    );

    // Graceful degradation: return empty map so system continues without boosts
    cachedPromotionStates = new Map();
    cacheLoadedAt = now;
    return cachedPromotionStates;
  }
}

/**
 * Get promotion state for a single sourceRef
 *
 * If not found in ledger, returns baseline "fresh" state with 1.0× boost
 */
export function getCardPromotionState(sourceRef: string): CardPromotionState {
  const states = loadCardPromotionStates();

  return (
    states.get(sourceRef) ?? {
      state: 'fresh',
      boost: 1.0,
      usageCount: 0,
      rewardCount: 0,
      rewardRate: 0,
      totalReward: 0,
      graphVersion: 'unknown',
      lastUpdated: new Date().toISOString(),
    }
  );
}

/**
 * Apply promotion boost to a chunk score
 *
 * @param baseScore - Original similarity/relevance score
 * @param sourceRef - Source reference to look up
 * @returns Boosted score (baseScore * promotion.boost)
 *
 * Example:
 *   baseScore: 0.85 (Qdrant cosine similarity)
 *   sourceRef: "sveltekit-frontend/src/lib/server/cache/cache-config.ts"
 *   state: "hot" (3.0× boost)
 *   result: 0.85 * 3.0 = 2.55 (ranks first)
 */
export function applyPromotionBoost(baseScore: number, sourceRef: string): number {
  const promotion = getCardPromotionState(sourceRef);
  return baseScore * promotion.boost;
}

/**
 * Get boost statistics for observability
 *
 * Used in Langfuse traces to show why a particular ranking occurred
 */
export interface BoostStats {
  appliedBoosts: number; // Count of boosts >1.0
  avgBoost: number;
  maxBoost: number;
  boostDistribution: Record<string, number>; // { "1.0": 5, "1.2": 2, "1.8": 1, "3.0": 1 }
}

export function getBoostStats(sourceRefs: string[]): BoostStats {
  const boosts = sourceRefs.map((ref) => getCardPromotionState(ref).boost);

  const distribution: Record<string, number> = {};
  for (const boost of boosts) {
    const key = boost.toFixed(1);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  return {
    appliedBoosts: boosts.filter((b) => b > 1.0).length,
    avgBoost: boosts.length > 0 ? boosts.reduce((a, b) => a + b, 0) / boosts.length : 1.0,
    maxBoost: Math.max(...boosts, 1.0),
    boostDistribution: distribution,
  };
}

/**
 * Clear in-memory cache (for testing or after outcome ledger refresh)
 */
export function clearPromotionCache(): void {
  cachedPromotionStates = null;
  cacheLoadedAt = 0;
}
