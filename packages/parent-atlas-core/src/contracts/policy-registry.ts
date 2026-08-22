/**
 * Default Retrieval Policies
 * Tuned for each use case with funnel limits
 */

import type { RetrievalPolicy, RetrievalUseCase, PolicyRegistry } from './retrieval.js';

/**
 * Default policies for each use case
 *
 * Funnel progression:
 * BM25 (100) → Qdrant (100) → RRF/dedup (80) → Graph/XGBoost (20)
 * → CrossEncoder (10-20) → Final (5-10)
 */
export const DEFAULT_POLICIES: Record<RetrievalUseCase, RetrievalPolicy> = {
  developer_chat: {
    useCase: 'developer_chat',
    bm25Limit: 100,
    qdrantLimit: 100,
    rffLimit: 80,
    graphLimit: 20,
    crossencoderLimit: 15,
    outputLimit: 8,
    enableGraphExpansion: true,
    graphDepth: 2,
    enableCrossencoder: true,
    crossencoderWeight: 0.15,
    requireSourceRefs: true,
    contextPolicy: 'ace',
    defaultTokenBudget: 8000
  },

  production_legal: {
    useCase: 'production_legal',
    bm25Limit: 150,
    qdrantLimit: 150,
    rffLimit: 120,
    graphLimit: 30,
    crossencoderLimit: 20,
    outputLimit: 10,
    enableGraphExpansion: true,
    graphDepth: 3,
    enableCrossencoder: true,
    crossencoderWeight: 0.20, // Higher CE weight for legal
    requireSourceRefs: true,
    contextPolicy: 'rlm',
    defaultTokenBudget: 12000
  },

  code_navigation: {
    useCase: 'code_navigation',
    bm25Limit: 200,
    qdrantLimit: 50,
    rffLimit: 100,
    graphLimit: 40,
    crossencoderLimit: 25,
    outputLimit: 20,
    enableGraphExpansion: true,
    graphDepth: 4, // Deeper graph for code dependencies
    enableCrossencoder: false, // Skip CE for speed
    crossencoderWeight: 0,
    requireSourceRefs: true,
    contextPolicy: 'ace',
    defaultTokenBudget: 4000 // Minimal context for nav
  },

  agent_context: {
    useCase: 'agent_context',
    bm25Limit: 50,
    qdrantLimit: 50,
    rffLimit: 40,
    graphLimit: 15,
    crossencoderLimit: 10,
    outputLimit: 5,
    enableGraphExpansion: true,
    graphDepth: 1,
    enableCrossencoder: true,
    crossencoderWeight: 0.10,
    requireSourceRefs: true,
    contextPolicy: 'ace',
    defaultTokenBudget: 4000 // Tight for MCP calls
  },

  rlm_context: {
    useCase: 'rlm_context',
    bm25Limit: 100,
    qdrantLimit: 100,
    rffLimit: 80,
    graphLimit: 20,
    crossencoderLimit: 15,
    outputLimit: 10,
    enableGraphExpansion: true,
    graphDepth: 2,
    enableCrossencoder: true,
    crossencoderWeight: 0.15,
    requireSourceRefs: true,
    contextPolicy: 'rlm',
    defaultTokenBudget: 12000 // For iterative retrieval
  }
};

/**
 * Default policy registry implementation
 */
export class DefaultPolicyRegistry implements PolicyRegistry {
  private policies: Map<RetrievalUseCase, RetrievalPolicy>;

  constructor() {
    this.policies = new Map(Object.entries(DEFAULT_POLICIES));
  }

  getPolicy(useCase: RetrievalUseCase): RetrievalPolicy {
    const policy = this.policies.get(useCase);
    if (!policy) {
      throw new Error(`No policy registered for use case: ${useCase}`);
    }
    return policy;
  }

  registerPolicy(useCase: RetrievalUseCase, policy: RetrievalPolicy): void {
    this.policies.set(useCase, policy);
  }
}

/**
 * Singleton registry instance
 */
let _registry: PolicyRegistry | null = null;

/**
 * Get or create the global policy registry
 */
export function getPolicyRegistry(): PolicyRegistry {
  if (!_registry) {
    _registry = new DefaultPolicyRegistry();
  }
  return _registry;
}

/**
 * Set a custom registry (for testing or customization)
 */
export function setPolicyRegistry(registry: PolicyRegistry): void {
  _registry = registry;
}
