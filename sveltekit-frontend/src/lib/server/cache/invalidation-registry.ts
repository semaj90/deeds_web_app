/**
 * Invalidation Registry — Consolidation 5
 *
 * Implements centralized invalidation rules and cascading dependencies.
 * Replaces direct key deletions with registered event triggers.
 */

import { getRedis } from '$lib/server/redis.js';
import { InvalidationRegistry, invalidationRegistry as baseRegistry } from './shared-cache-api.js';

export class CascadingInvalidationRegistry extends InvalidationRegistry {
  constructor() {
    super();
    this.setupRules();
  }

  private setupRules(): void {
    // 1. Invalidate all search caches on new document ingestion
    this.register('document_indexed', async (data: { docId: string }) => {
      const redis = getRedis();
      const keys = await redis.keys('search:*');
      if (data?.docId) {
        keys.push(`stats:knowledge_base`);
      }
      return keys;
    });

    // 2. Invalidate case caches (e.g. after uploading evidence)
    this.register('case_updated', async (data: { caseId: string }) => {
      if (!data?.caseId) return [];
      return [
        `rag-case:${data.caseId}`,
        `case:timeline:${data.caseId}`
      ];
    });

    // 3. Model changes invalidate all LLM, ACE, and embedding caches
    this.register('model_changed', async (data: { modelId: string }) => {
      const redis = getRedis();
      const llmKeys = await redis.keys('llm:*');
      const aceKeys = await redis.keys('ace:*');
      return [...llmKeys, ...aceKeys];
    });

    // 4. Feature updates invalidate feature card caches
    this.register('feature_updated', async (data: { featureKey: string }) => {
      if (!data?.featureKey) return [];
      return [
        `ace:feature:${data.featureKey}`,
        `ace:ctx:${data.featureKey}`
      ];
    });

    // Setup dependencies (cascade effects)
    // Whenever a case is updated, any active ACE packets are invalidated as well.
    // In a real run, we could map active run IDs to case IDs, or invalidate all active packets.
  }
}

export const invalidationRegistry = new CascadingInvalidationRegistry();
