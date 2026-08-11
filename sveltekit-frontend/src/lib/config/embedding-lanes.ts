/**
 * Embedding Lane Configuration
 * Supports primary (768-dim), fallback (512-dim), and multimodal (CLIP) lanes
 * with automatic VRAM-based selection and explicit configuration options.
 */

import { z } from 'zod';
import { SEMANTIC_DIMENSION } from '../server/embedding/embedding-contract-768.js';

export const EmbeddingLaneSchema = z.enum([
  'primary-768d',
  'fallback-512d',
  'multimodal-clip-512d'
]);

export type EmbeddingLane = z.infer<typeof EmbeddingLaneSchema>;

export interface EmbeddingLaneConfig {
  model: string;
  dimension: number;
  collections: {
    primary: string;
    fallback?: string;
    multimodal?: string;
  };
  estimatedVramMb: number;
  minVramMb: number;
  priority: number;
  enabled: boolean;
}

export interface EmbeddingLaneSelector {
  available_vram_mb: number;
  preferred_lane?: EmbeddingLane;
  lanes: Record<EmbeddingLane, EmbeddingLaneConfig>;
  selected_lane: EmbeddingLane;
  fallback_chain: EmbeddingLane[];
  reasoning: string;
}

/**
 * Lane definitions with VRAM requirements and priorities
 */
export const EMBEDDING_LANES: Record<EmbeddingLane, EmbeddingLaneConfig> = {
  'primary-768d': {
    model: 'embeddinggemma:latest',
    dimension: SEMANTIC_DIMENSION,
    collections: {
      primary: 'codebase_chunks_768',
      fallback: 'evidence_items_768'
    },
    estimatedVramMb: 2048,
    minVramMb: 1800,
    priority: 100,
    enabled: true
  },
  'fallback-512d': {
    model: 'embeddinggemma:latest:quantized-512',
    dimension: 512,
    collections: {
      primary: 'codebase_chunks_512',
      fallback: 'evidence_items_512'
    },
    estimatedVramMb: 1200,
    minVramMb: 900,
    priority: 80,
    enabled: true
  },
  'multimodal-clip-512d': {
    model: 'clip-vit-base-patch32',
    dimension: 512,
    collections: {
      primary: 'evidence_items_clip_512',
      multimodal: 'evidence_items_clip_512'
    },
    estimatedVramMb: 1536,
    minVramMb: 1200,
    priority: 60,
    enabled: true
  }
};

/**
 * Select embedding lane based on available VRAM and preferences
 */
export function selectEmbeddingLane(
  availableVramMb: number,
  preferredLane?: EmbeddingLane
): EmbeddingLaneSelector {
  const lanes = EMBEDDING_LANES;

  // If preferred lane is specified and available, use it
  if (preferredLane && lanes[preferredLane]?.enabled) {
    const config = lanes[preferredLane];
    if (availableVramMb >= config.minVramMb) {
      return {
        available_vram_mb: availableVramMb,
        preferred_lane: preferredLane,
        lanes,
        selected_lane: preferredLane,
        fallback_chain: buildFallbackChain(preferredLane, availableVramMb),
        reasoning: `Preferred lane ${preferredLane} selected (VRAM: ${availableVramMb}MB ≥ min ${config.minVramMb}MB)`
      };
    }
  }

  // Auto-select based on available VRAM (tier selection)
  if (availableVramMb >= lanes['primary-768d'].minVramMb) {
      return {
        available_vram_mb: availableVramMb,
        preferred_lane: preferredLane,
        lanes,
        selected_lane: 'primary-768d',
        fallback_chain: buildFallbackChain('primary-768d', availableVramMb),
      reasoning: `Auto-selected primary-768d (VRAM: ${availableVramMb}MB ≥ ${lanes['primary-768d'].minVramMb}MB, sufficient for embeddinggemma)`
    };
  }

  if (availableVramMb >= lanes['fallback-512d'].minVramMb) {
    return {
      available_vram_mb: availableVramMb,
      preferred_lane: preferredLane,
      lanes,
      selected_lane: 'fallback-512d',
      fallback_chain: buildFallbackChain('fallback-512d', availableVramMb),
      reasoning: `Auto-selected fallback-512d (VRAM: ${availableVramMb}MB ≥ ${lanes['fallback-512d'].minVramMb}MB, insufficient for 768d, using nomic-embed-text)`
    };
  }

  // Multimodal as last resort (lowest VRAM requirement)
  return {
    available_vram_mb: availableVramMb,
    preferred_lane: preferredLane,
    lanes,
    selected_lane: 'multimodal-clip-512d',
    fallback_chain: [],
    reasoning: `Auto-selected multimodal-clip-512d (VRAM: ${availableVramMb}MB, CLIP is last-resort multimodal lane)`
  };
}

/**
 * Build fallback chain for graceful degradation
 */
function buildFallbackChain(current: EmbeddingLane, availableVramMb: number): EmbeddingLane[] {
  const chain: EmbeddingLane[] = [];
  const lanes = EMBEDDING_LANES;

  const allLanes: EmbeddingLane[] = ['primary-768d', 'fallback-512d', 'multimodal-clip-512d'];
  const others = allLanes.filter((l) => l !== current);

  for (const lane of others) {
    if (lanes[lane]?.enabled && availableVramMb >= lanes[lane].minVramMb) {
      chain.push(lane);
    }
  }

  return chain;
}

/**
 * Get collection name for a given lane and type
 */
export function getCollectionName(
  lane: EmbeddingLane,
  collectionType: 'primary' | 'fallback' | 'multimodal' = 'primary'
): string {
  const config = EMBEDDING_LANES[lane];
  const collections = config.collections;

  switch (collectionType) {
    case 'primary':
      return collections.primary;
    case 'fallback':
      return collections.fallback || collections.primary;
    case 'multimodal':
      return collections.multimodal || collections.primary;
    default:
      return collections.primary;
  }
}

/**
 * Estimate VRAM usage for a lane
 */
export function estimateVramUsage(lane: EmbeddingLane): number {
  return EMBEDDING_LANES[lane]?.estimatedVramMb || 0;
}

/**
 * Check if lane is available given VRAM constraint
 */
export function isLaneAvailable(lane: EmbeddingLane, availableVramMb: number): boolean {
  const config = EMBEDDING_LANES[lane];
  return config?.enabled && availableVramMb >= config.minVramMb;
}

/**
 * Get all available lanes for current VRAM
 */
export function getAvailableLanes(availableVramMb: number): EmbeddingLane[] {
  return Object.entries(EMBEDDING_LANES)
    .filter(([, config]) => config.enabled && availableVramMb >= config.minVramMb)
    .sort(([, a], [, b]) => b.priority - a.priority)
    .map(([lane]) => lane as EmbeddingLane);
}

/**
 * Diagnostic: Print lane selection matrix
 */
export function diagnosticLaneMatrix(): string {
  const lines: string[] = [
    '=== Embedding Lane Selection Matrix ===',
    ''
  ];

  for (const [lane, config] of Object.entries(EMBEDDING_LANES)) {
    lines.push(`${lane}:`);
    lines.push(`  Model: ${config.model}`);
    lines.push(`  Dimension: ${config.dimension}d`);
    lines.push(`  VRAM Est: ${config.estimatedVramMb}MB | Min: ${config.minVramMb}MB`);
    lines.push(`  Collections: ${Object.entries(config.collections)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`);
    lines.push(`  Priority: ${config.priority}`);
    lines.push(`  Enabled: ${config.enabled}`);
    lines.push('');
  }

  lines.push('=== Selection Logic ===');
  lines.push('1. If preferred lane specified and available → use it');
  lines.push('2. If VRAM ≥ 1800MB → primary-768d (embeddinggemma)');
  lines.push('3. If VRAM ≥ 768MB → fallback-512d (nomic-embed-text)');
  lines.push('4. Else → multimodal-clip-512d (CLIP)');
  lines.push('');

  return lines.join('\n');
}
