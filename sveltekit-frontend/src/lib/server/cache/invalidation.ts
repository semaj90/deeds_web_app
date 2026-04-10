/**
 * Cache Invalidation Service
 * Ensures data consistency across Redis + Qdrant + Memory caches
 *
 * Architecture:
 * - Synchronous local invalidation (memory cache)
 * - Asynchronous distributed invalidation (Redis + RabbitMQ)
 * - Pattern-based bulk invalidation for related keys
 * - Qdrant vector invalidation hooks
 */

import { memoryCache } from '$lib/server/cache.js';
import { getRedis } from '$lib/server/redis.js';
import { bumpCaseVersion } from '$lib/server/cache-keys.js';
import { dispatchOrExecuteInline } from '$lib/server/queue/dispatch-inline.js';

/**
 * Cache invalidation patterns for different entity types
 * Each pattern targets related cache keys for bulk invalidation
 */
export const CACHE_PATTERNS = {
  // Reports
  REPORT: (reportId: string) => `report:${reportId}*`,
  REPORT_LIST: (caseId?: string) => (caseId ? `reports:case:${caseId}*` : 'reports:list*'),
  REPORT_EXPORT: (reportId: string) => `report:export:${reportId}*`,
  REPORT_PREVIEW: (reportId: string) => `report:preview:${reportId}*`,

  // Cases
  CASE: (caseId: string) => `case:${caseId}*`,
  CASE_LIST: 'cases:list*',
  CASE_STATS: 'cases:stats*',

  // Evidence
  EVIDENCE: (evidenceId: string) => `evidence:${evidenceId}*`,
  EVIDENCE_LIST: (caseId?: string) => (caseId ? `evidence:case:${caseId}*` : 'evidence:list*'),
  EVIDENCE_SEARCH: 'evidence:search*',

  // Embeddings
  EMBEDDING: (text: string) => `embedding:${hashText(text)}`,
  EMBEDDING_CACHE: 'embedding:cache:*',

  // RAG
  RAG_SEARCH: 'rag:search*',
  RAG_CONTEXT: (query: string) => `rag:context:${hashText(query)}`,

  // LLM Response Cache (Priority #7)
  LLM_RESPONSE: (query: string) => `llm:response:${hashText(query)}`,
  LLM_SEMANTIC: 'llm:semantic:*',

  // Analytics
  ANALYTICS: 'analytics:*',
  DASHBOARD_STATS: 'dashboard:stats*',

  // Persons of Interest
  PERSON: (personId: string) => `person:${personId}*`,
  PERSON_LIST: 'persons:list*',

  // Citations
  CITATION: (citationId: string) => `citation:${citationId}*`,
  CITATION_TAGS: (citationId: string) => `citation:tags:${citationId}*`,

  // Report Templates (Priority #9)
  TEMPLATE_META: (templateType: string) => `template:meta:${templateType}*`,
  TEMPLATE_AI: (caseId: string) => `template:ai:*:${caseId}:*`,
  TEMPLATE_RENDERED: (caseId: string) => `template:rendered:*:${caseId}:*`,
  TEMPLATE_ALL: 'template:*',

  // ACE Chunks
  ACE_CHUNKS: (caseId: string) => `ace:chunks:${caseId}*`,

  // Global
  ALL: '*',
} as const;

/**
 * Invalidation event types for audit logging
 */
export type InvalidationType =
  | 'report_create'
  | 'report_update'
  | 'report_delete'
  | 'case_update'
  | 'evidence_create'
  | 'evidence_update'
  | 'evidence_delete'
  | 'person_update'
  | 'citation_update'
  | 'ace_invalidate'
  | 'manual';

interface InvalidationOptions {
  type: InvalidationType;
  userId?: string;
  immediate?: boolean; // Skip RabbitMQ, invalidate synchronously
  metadata?: Record<string, unknown>;
}

interface InvalidationResult {
  memoryKeysCleared: number;
  redisKeysCleared: number;
  queuePublished: boolean;
  patterns: string[];
}

/**
 * Simple text hash for cache keys (non-cryptographic)
 */
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Clear memory cache entries matching a pattern
 */
function clearMemoryCacheByPattern(pattern: string): number {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  let cleared = 0;

  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      cleared++;
    }
  }

  return cleared;
}

/**
 * Core cache invalidation service
 */
export class CacheInvalidationService {
  /**
   * Initialize (no-op — dispatch-inline handles RabbitMQ availability automatically)
   */
  async initialize(_rabbitMQManager?: unknown): Promise<void> {
    console.log('✅ Cache Invalidation Service initialized');
  }

  /**
   * Invalidate cache by specific key
   */
  async invalidateKey(key: string, options: InvalidationOptions): Promise<InvalidationResult> {
    const result: InvalidationResult = {
      memoryKeysCleared: 0,
      redisKeysCleared: 0,
      queuePublished: false,
      patterns: [key],
    };

    // 1. Clear memory cache immediately
    if (memoryCache.has(key)) {
      memoryCache.delete(key);
      result.memoryKeysCleared = 1;
    }

    // 2. Clear Redis (immediate or via queue)
    if (options.immediate) {
      // Synchronous Redis invalidation
      try {
        const redis = getRedis();
        await redis.del(key);
        result.redisKeysCleared = 1;
      } catch (err) {
        console.warn('[CacheInvalidation] Redis del failed:', err);
      }
    } else {
      // Asynchronous via RabbitMQ
      result.queuePublished = await this.publishInvalidation({
        type: options.type,
        key,
        userId: options.userId,
        metadata: options.metadata,
      });
    }

    console.log(`🗑️ Cache invalidated: ${key} (type: ${options.type})`);
    return result;
  }

  /**
   * Invalidate cache by pattern (e.g., "report:123*")
   */
  async invalidatePattern(
    pattern: string,
    options: InvalidationOptions
  ): Promise<InvalidationResult> {
    const result: InvalidationResult = {
      memoryKeysCleared: 0,
      redisKeysCleared: 0,
      queuePublished: false,
      patterns: [pattern],
    };

    // 1. Clear memory cache by pattern
    result.memoryKeysCleared = clearMemoryCacheByPattern(pattern);

    // 2. Clear Redis keys by pattern
    if (options.immediate) {
      // Synchronous pattern invalidation
      try {
        const redis = getRedis();
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          result.redisKeysCleared = keys.length;
        }
      } catch (err) {
        console.warn('[CacheInvalidation] Redis pattern del failed:', err);
      }
    } else {
      // Asynchronous via RabbitMQ
      result.queuePublished = await this.publishInvalidation({
        type: options.type,
        pattern,
        userId: options.userId,
        metadata: options.metadata,
      });
    }

    console.log(
      `🗑️ Cache pattern invalidated: ${pattern} (type: ${options.type}, memory: ${result.memoryKeysCleared})`
    );
    return result;
  }

  /**
   * Invalidate multiple patterns atomically
   */
  async invalidateMultiple(
    patterns: string[],
    options: InvalidationOptions
  ): Promise<InvalidationResult> {
    const results = await Promise.all(
      patterns.map((pattern) => this.invalidatePattern(pattern, options))
    );

    // Aggregate results
    return results.reduce(
      (acc, r) => ({
        memoryKeysCleared: acc.memoryKeysCleared + r.memoryKeysCleared,
        redisKeysCleared: acc.redisKeysCleared + r.redisKeysCleared,
        queuePublished: acc.queuePublished || r.queuePublished,
        patterns: [...acc.patterns, ...r.patterns],
      }),
      {
        memoryKeysCleared: 0,
        redisKeysCleared: 0,
        queuePublished: false,
        patterns: [],
      } as InvalidationResult
    );
  }

  /**
   * Publish invalidation event to RabbitMQ
   */
  private async publishInvalidation(data: Record<string, unknown>): Promise<boolean> {
    try {
      const result = await dispatchOrExecuteInline('cache.invalidate', data);
      return result.mode !== 'skipped';
    } catch (err) {
      console.error('[CacheInvalidation] Dispatch failed:', err);
      return false;
    }
  }
}

// Singleton instance
export const cacheInvalidation = new CacheInvalidationService();

/**
 * High-level invalidation helpers for common operations
 */
export const invalidateReportCache = async (
  reportId: string,
  type: InvalidationType,
  userId?: string
) => {
  return cacheInvalidation.invalidateMultiple(
    [
      CACHE_PATTERNS.REPORT(reportId),
      CACHE_PATTERNS.REPORT_EXPORT(reportId),
      CACHE_PATTERNS.REPORT_PREVIEW(reportId),
    ],
    { type, userId }
  );
};

export const invalidateCaseCache = async (
  caseId: string,
  type: InvalidationType,
  userId?: string
) => {
  // Bump versioned cache counter so retrieval + synthesis caches auto-expire
  bumpCaseVersion(caseId).catch((err) => console.warn('[CacheInvalidation] bumpCaseVersion failed:', (err as Error).message ?? err));

  return cacheInvalidation.invalidateMultiple(
    [
      CACHE_PATTERNS.CASE(caseId),
      CACHE_PATTERNS.CASE_LIST,
      CACHE_PATTERNS.CASE_STATS,
      CACHE_PATTERNS.DASHBOARD_STATS,
      // Invalidate report templates that depend on case data (Priority #9)
      CACHE_PATTERNS.TEMPLATE_AI(caseId),
      CACHE_PATTERNS.TEMPLATE_RENDERED(caseId),
    ],
    { type, userId }
  );
};

export const invalidateEvidenceCache = async (
  evidenceId: string,
  caseId: string | undefined,
  type: InvalidationType,
  userId?: string
) => {
  const patterns = [CACHE_PATTERNS.EVIDENCE(evidenceId), CACHE_PATTERNS.EVIDENCE_SEARCH];

  if (caseId) {
    patterns.push(CACHE_PATTERNS.EVIDENCE_LIST(caseId));
    patterns.push(CACHE_PATTERNS.CASE(caseId)); // Case evidence list cached
    bumpCaseVersion(caseId).catch((err) => console.warn('[CacheInvalidation] bumpCaseVersion failed:', (err as Error).message ?? err));
  }

  return cacheInvalidation.invalidateMultiple(patterns, { type, userId });
};

export const invalidatePersonCache = async (personId: string, type: InvalidationType, userId?: string) => {
	return cacheInvalidation.invalidateMultiple([
		CACHE_PATTERNS.PERSON(personId),
		CACHE_PATTERNS.PERSON_LIST
	], { type, userId });
};

export const invalidateCitationCache = async (citationId: string, type: InvalidationType, userId?: string) => {
	return cacheInvalidation.invalidateMultiple([
		CACHE_PATTERNS.CITATION(citationId),
		CACHE_PATTERNS.CITATION_TAGS(citationId)
	], { type, userId });
};

/**
 * Invalidate LLM response semantic cache (Priority #7 integration)
 */
export const invalidateLLMCache = async (query?: string, userId?: string) => {
	if (query) {
		return cacheInvalidation.invalidateKey(
			CACHE_PATTERNS.LLM_RESPONSE(query),
			{ type: 'manual', userId }
		);
	}
	return cacheInvalidation.invalidatePattern(
		CACHE_PATTERNS.LLM_SEMANTIC,
		{ type: 'manual', userId }
	);
};

export const invalidateACEChunksCache = async (
	caseId: string,
	type: InvalidationType,
	userId?: string
) => {
	return cacheInvalidation.invalidatePattern(
		CACHE_PATTERNS.ACE_CHUNKS(caseId),
		{ type, userId }
	);
};

/**
 * Flush entire cache (use sparingly - for admin/debug only)
 */
export const flushAllCache = async (userId?: string) => {
	return cacheInvalidation.invalidatePattern(
		CACHE_PATTERNS.ALL,
		{ type: 'manual', userId, immediate: true }
	);
};
