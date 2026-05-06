/**
 * Model Router — pure routing decision for a given query.
 *
 * Separates the "which model + backend?" decision from the "invoke it"
 * mechanics in inference-router.ts.  Pure function: no I/O, no side effects.
 * model-loader.ts supplies the live backend availability.
 *
 * Depends on: model-loader.ts (Layer 1.1)
 *
 * Usage:
 *   const decision = routeQuery(query, { hasImage: true });
 *   const response = await bifrostChat(messages, decision.model, { ... });
 */

import type { BackendName } from './model-loader.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingInput {
  /** The user's text query (also accepted as first positional arg to routeQuery) */
  query?: string;
  /** Whether the request includes image data (→ VLM path) */
  hasImage?: boolean;
  /** Caller-provided latency budget in ms (0 = no budget) */
  latencyBudgetMs?: number;
  /** Override to a specific backend (e.g. for raw benchmarking) */
  preferredBackend?: BackendName;
  /** Temperature hint — high temp requests are less cacheable */
  temperature?: number;
}

export interface RoutingDecision {
  /** Ollama model tag to use */
  model: string;
  /** Backend to try first (inference-router will fall back if unavailable) */
  backend: BackendName;
  /** Whether to use the 3-tier cache (L1 Redis → L2 Bifrost → L3 GPU) */
  useCache: boolean;
  /** Whether ACE context assembly should be triggered */
  useAce: boolean;
  /** Whether this is a legal-domain query (affects RAG collection selection) */
  isLegal: boolean;
  /** Whether the query needs vision/image analysis */
  isVision: boolean;
  /** Estimated latency tier: 'fast' <2s | 'normal' <15s | 'slow' >15s */
  latencyTier: 'fast' | 'normal' | 'slow';
}

// ─── Model constants ─────────────────────────────────────────────────────────

export const MODELS = {
  LEGAL_VLM:   'gemma4-legal-vlm:latest',   // unified text+vision, production
  LEGAL_TEXT:  'gemma4-legal:latest',        // text-only fallback
  FAST:        'gemma3:270m',                // sub-2s for simple queries
  EMBED:       'embeddinggemma:latest',
} as const;

// ─── Routing logic (pure) ─────────────────────────────────────────────────────

const LEGAL_KEYWORDS = [
  'contract', 'agreement', 'legal', 'law', 'court', 'case', 'statute',
  'regulation', 'compliance', 'liability', 'clause', 'jurisdiction',
  'plaintiff', 'defendant', 'litigation', 'evidence', 'testimony',
  'deed', 'title', 'attorney', 'counsel', 'judge', 'verdict', 'motion',
  'deposition', 'discovery', 'hearsay', 'precedent', 'damages', 'tort',
];

function isLegalQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return LEGAL_KEYWORDS.some(kw => lower.includes(kw));
}

function isSimpleQuery(query: string): boolean {
  return query.length < 120 && !query.includes('?') || query.split(' ').length < 12;
}

function isCacheable(temperature = 0): boolean {
  // High-temperature queries have diverse outputs → cache misses likely → skip
  return temperature < 0.5;
}

/**
 * Decide model + backend for a query.
 *
 * This is a pure function — pass `preferredBackend` from model-loader.ts
 * if you want the decision to reflect live backend availability.
 *
 * @example
 * const liveBackend = await getPreferredBackend(hasImage);
 * const decision = routeQuery(query, { hasImage, preferredBackend: liveBackend });
 */
export function routeQuery(query: string, opts: RoutingInput = {}): RoutingDecision {
  const {
    hasImage = false,
    latencyBudgetMs = 0,
    preferredBackend,
    temperature = 0.3,
  } = opts;

  const legal  = isLegalQuery(query);
  const simple = isSimpleQuery(query);
  const fast   = latencyBudgetMs > 0 && latencyBudgetMs < 2000;

  // Vision path — always use the VLM model
  if (hasImage) {
    return {
      model: MODELS.LEGAL_VLM,
      backend: preferredBackend ?? 'vlm',
      useCache: false,   // image inputs are rarely identical
      useAce: false,     // vision queries bypass ACE (no text retrieval context)
      isLegal: legal,
      isVision: true,
      latencyTier: 'slow',
    };
  }

  // Fast path — simple non-legal query with tight latency budget
  if (fast && !legal && simple) {
    return {
      model: MODELS.FAST,
      backend: preferredBackend ?? 'bifrost',
      useCache: isCacheable(temperature),
      useAce: false,
      isLegal: false,
      isVision: false,
      latencyTier: 'fast',
    };
  }

  // Default: legal or complex query → full pipeline
  return {
    model: MODELS.LEGAL_VLM,
    backend: preferredBackend ?? 'turboquant',
    useCache: isCacheable(temperature),
    useAce: legal,
    isLegal: legal,
    isVision: false,
    latencyTier: legal ? 'normal' : 'fast',
  };
}

/**
 * Select the Ollama model name for a given decision.
 * Separated so callers can override the model without re-routing.
 */
export function resolveModel(decision: RoutingDecision, overrideModel?: string): string {
  return overrideModel ?? decision.model;
}
