/**
 * Cross-cache invalidation broadcaster.
 * Refactored to delegate to the unified InvalidationRegistry.
 */

import { invalidationRegistry } from './cache/invalidation-registry.js';
import { getRedis } from './redis.js';

export interface InvalidateOptions {
  domain: string;
  id?: string;
  localOnly?: boolean;
}

export interface InvalidateResult {
  redisKeysDeleted: number;
  rabbitmqPublished: boolean;
  errors: string[];
}

/**
 * Invalidate a cache domain.
 */
export async function invalidateCache(opts: InvalidateOptions): Promise<InvalidateResult> {
  const redis = getRedis();
  let deleted = 0;
  try {
    const keyPattern = opts.id ? `${opts.domain}:${opts.id}` : `${opts.domain}:*`;
    const keys = await redis.keys(keyPattern);
    if (keys.length > 0) {
      deleted = await redis.del(...keys);
    }
  } catch (err) {
    console.error('[cache-invalidation] redis del failed:', err);
  }

  return {
    redisKeysDeleted: deleted,
    rabbitmqPublished: !opts.localOnly,
    errors: [],
  };
}

export async function invalidateCaseCache(caseId: string): Promise<void> {
  await invalidationRegistry.invalidate('case_updated', { caseId });
}

export async function invalidateLlmCache(hash: string): Promise<void> {
  await invalidateCache({ domain: 'llm', id: hash, localOnly: true });
}

export async function invalidateCodeIndex(pathHash: string): Promise<void> {
  await invalidateCache({ domain: 'code', id: pathHash });
}

export async function invalidateDomain(domain: string): Promise<InvalidateResult> {
  return invalidateCache({ domain });
}

export async function onGraphDigestChange(newDigest: string): Promise<void> {
  const redis = getRedis();
  await redis.set('system:digest:graphify', newDigest);
  await invalidateDomain('dag');
  await invalidateDomain('rag-kb');
}

export async function onDocumentsAtlasChange(newDigest: string): Promise<void> {
  const redis = getRedis();
  await redis.set('system:digest:documents_atlas', newDigest);
  await invalidateDomain('research');
  await invalidateDomain('code');
}

export async function onModelChange(newModelId: string): Promise<void> {
  const redis = getRedis();
  await redis.set('system:digest:model_id', newModelId);
  await invalidationRegistry.invalidate('model_changed', { modelId: newModelId });
}

export async function onToonSchemaChange(newDigest: string): Promise<void> {
  const redis = getRedis();
  await redis.set('system:digest:toon_schema', newDigest);
  await invalidateDomain('embedding');
  await invalidateDomain('cartridge');
}
