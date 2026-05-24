/**
 * Cross-cache invalidation broadcaster.
 *
 * Wraps the RabbitMQ `cache.invalidate` publish path with type-safe domain
 * enums and adds direct Redis L1 flush for low-latency invalidation.
 *
 * Depends on: cache-config.ts (Layer 0.2)
 *
 * Call sites:
 *   - Evidence upload (invalidates rag-case bundles)
 *   - Feedback thumbs-up/down (invalidates qlora-boost + research-cache)
 *   - Admin model validation (invalidates agent cache)
 *   - New case creation (invalidates rag-case, session context)
 */

import { getCachePolicy, getCacheKey, type CacheDomain } from './cache-config.js';

// Lazy import so this module can be imported in SSR without hard-requiring
// RabbitMQ at startup (RabbitMQ may be offline in dev).
async function getRabbitmq() {
  const { publishCacheInvalidation } = await import('./queue/rabbitmq-client.js');
  return { publishCacheInvalidation };
}

async function getRedis() {
  const { getRedis: redisFactory } = await import('./redis.js');
  return redisFactory();
}

// ---------------------------------------------------------------------------
// Core invalidation types
// ---------------------------------------------------------------------------

export interface InvalidateOptions {
  /** The cache domain to invalidate (maps to key prefix + TTL policy). */
  domain: CacheDomain;
  /**
   * Optional exact Redis key suffix (after the keyPrefix).
   * If omitted, a glob pattern is used to wipe all keys in the domain.
   */
  id?: string;
  /**
   * Skip RabbitMQ broadcast (useful for local-only invalidation where
   * only the current process needs the flush, e.g. after an admin action).
   */
  localOnly?: boolean;
}

export interface InvalidateResult {
  /** Number of Redis keys deleted (L1 flush). */
  redisKeysDeleted: number;
  /** Whether the RabbitMQ event was published. */
  rabbitmqPublished: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Invalidate a cache domain — flushes Redis L1 and broadcasts via RabbitMQ.
 *
 * @example
 * // After evidence upload, clear the case-scoped RAG bundle
 * await invalidateCache({ domain: 'rag-case', id: caseId });
 *
 * @example
 * // Wipe all code-llm-index entries (e.g. after a major refactor indexing run)
 * await invalidateCache({ domain: 'code' });
 */
export async function invalidateCache(opts: InvalidateOptions): Promise<InvalidateResult> {
  const { domain, id, localOnly = false } = opts;
  const { keyPrefix } = getCachePolicy(domain);
  const result: InvalidateResult = { redisKeysDeleted: 0, rabbitmqPublished: false, errors: [] };

  // --- Redis L1 flush ---
  try {
    const redis = await getRedis();
    const pattern = id ? getCacheKey(domain, id) : `${keyPrefix}:*`;

    if (id) {
      // Exact key delete
      const deleted = await redis.del(pattern);
      result.redisKeysDeleted = deleted;
    } else {
      // Glob pattern scan-and-delete (SCAN is non-blocking, safe for prod)
      let cursor = '0';
      let deleted = 0;
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          deleted += await redis.del(...keys);
        }
      } while (cursor !== '0');
      result.redisKeysDeleted = deleted;
    }
  } catch (err) {
    result.errors.push(`Redis flush failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- RabbitMQ broadcast ---
  if (!localOnly) {
    try {
      const { publishCacheInvalidation } = await getRabbitmq();
      await publishCacheInvalidation({
        type: domain,
        key: id,
        pattern: id ? undefined : `${getCachePolicy(domain).keyPrefix}:*`,
      });
      result.rabbitmqPublished = true;
    } catch (err) {
      // Non-fatal — Redis was already flushed; other processes miss the event
      result.errors.push(
        `RabbitMQ broadcast failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Convenience wrappers for common invalidation patterns
// ---------------------------------------------------------------------------

/**
 * Invalidate all RAG bundles for a specific case (called on evidence upload).
 */
export async function invalidateCaseCache(caseId: string): Promise<void> {
  await invalidateCache({ domain: 'rag-case', id: caseId });
}

/**
 * Invalidate a specific LLM exact-match cache entry by its content hash.
 * Called by feedback/+server.ts on thumbs-down to force regeneration.
 */
export async function invalidateLlmCache(hash: string): Promise<void> {
  await invalidateCache({ domain: 'llm', id: hash, localOnly: true });
}

/**
 * Invalidate the code-LLM index entry for a specific file path hash.
 * Called after a file is saved/edited to force fresh summarization.
 */
export async function invalidateCodeIndex(pathHash: string): Promise<void> {
  await invalidateCache({ domain: 'code', id: pathHash });
}

/**
 * Wipe an entire domain — use with caution in production.
 * Useful in dev/test or after a full re-index run.
 */
export async function invalidateDomain(domain: CacheDomain): Promise<InvalidateResult> {
  return invalidateCache({ domain });
}

// ---------------------------------------------------------------------------
// System Digest Triggers (Phase 8C)
// ---------------------------------------------------------------------------

export async function onGraphDigestChange(newDigest: string): Promise<void> {
  const redis = await getRedis();
  await redis.set('system:digest:graphify', newDigest);
  await invalidateDomain('dag');
  await invalidateDomain('rag-kb');
}

export async function onDocumentsAtlasChange(newDigest: string): Promise<void> {
  const redis = await getRedis();
  await redis.set('system:digest:documents_atlas', newDigest);
  await invalidateDomain('research');
  await invalidateDomain('code');
}

export async function onModelChange(newModelId: string): Promise<void> {
  const redis = await getRedis();
  await redis.set('system:digest:model_id', newModelId);
  await invalidateDomain('llm');
  await invalidateDomain('ace');
}

export async function onToonSchemaChange(newDigest: string): Promise<void> {
  const redis = await getRedis();
  await redis.set('system:digest:toon_schema', newDigest);
  await invalidateDomain('embedding');
  await invalidateDomain('cartridge');
}

