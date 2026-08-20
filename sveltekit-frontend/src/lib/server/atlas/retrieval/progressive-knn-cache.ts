import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import type { ProgressiveKnnSynthesisArtifactV1 } from './progressive-knn-synthesis.js';

export const ProgressiveKnnCacheReceiptV1Schema = z.object({
  schema: z.literal('atlas.progressive-knn-cache-receipt.v1'),
  operation: z.enum(['PUT', 'GET']),
  cacheKey: z.string().min(1),
  expectedChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  observedChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  byteLength: z.number().int().nonnegative(),
  checksumValid: z.boolean(),
  hit: z.boolean(),
  ttlSeconds: z.number().int().positive().nullable(),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ProgressiveKnnCacheReceiptV1 = z.infer<typeof ProgressiveKnnCacheReceiptV1Schema>;

function sha256Utf8(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

/** Persist only a derived-context cache payload whose checksum matches its synthesis receipt. */
export async function putProgressiveKnnCache(input: {
  artifact: ProgressiveKnnSynthesisArtifactV1;
  ttlSeconds?: number;
  producerRevision: string;
}): Promise<ProgressiveKnnCacheReceiptV1> {
  const cache = input.artifact.receipt.cache;
  if (!cache.enabled || !cache.cacheKey) throw new Error('progressive KNN cache is not enabled for this artifact');
  const observed = sha256Utf8(input.artifact.json);
  if (observed !== cache.checksumSha256) {
    throw new Error(`progressive KNN cache checksum mismatch before write: expected ${cache.checksumSha256}, got ${observed}`);
  }
  const ttlSeconds = Math.max(60, Math.min(input.ttlSeconds ?? 3600, 7 * 24 * 3600));
  const valkey = getValkeyClient();
  await valkey.set(cache.cacheKey, input.artifact.json, 'EX', ttlSeconds);
  return ProgressiveKnnCacheReceiptV1Schema.parse({
    schema: 'atlas.progressive-knn-cache-receipt.v1',
    operation: 'PUT',
    cacheKey: cache.cacheKey,
    expectedChecksumSha256: cache.checksumSha256,
    observedChecksumSha256: observed,
    byteLength: Buffer.byteLength(input.artifact.json, 'utf8'),
    checksumValid: true,
    hit: true,
    ttlSeconds,
    canonicalWrites: false,
    producerRevision: input.producerRevision,
  });
}

/** Read and verify a derived context artifact. Invalid checksum returns no payload and a failed receipt. */
export async function getProgressiveKnnCache(input: {
  cacheKey: string;
  expectedChecksumSha256: string;
  producerRevision: string;
}): Promise<{ json: string | null; receipt: ProgressiveKnnCacheReceiptV1 }> {
  if (!/^[a-f0-9]{64}$/.test(input.expectedChecksumSha256)) throw new Error('expectedChecksumSha256 must be lowercase SHA-256 hex');
  const valkey = getValkeyClient();
  const json = await valkey.get(input.cacheKey);
  if (json === null) {
    return {
      json: null,
      receipt: ProgressiveKnnCacheReceiptV1Schema.parse({
        schema: 'atlas.progressive-knn-cache-receipt.v1',
        operation: 'GET',
        cacheKey: input.cacheKey,
        expectedChecksumSha256: input.expectedChecksumSha256,
        observedChecksumSha256: null,
        byteLength: 0,
        checksumValid: false,
        hit: false,
        ttlSeconds: null,
        canonicalWrites: false,
        producerRevision: input.producerRevision,
      }),
    };
  }
  const observed = sha256Utf8(json);
  const valid = observed === input.expectedChecksumSha256;
  return {
    json: valid ? json : null,
    receipt: ProgressiveKnnCacheReceiptV1Schema.parse({
      schema: 'atlas.progressive-knn-cache-receipt.v1',
      operation: 'GET',
      cacheKey: input.cacheKey,
      expectedChecksumSha256: input.expectedChecksumSha256,
      observedChecksumSha256: observed,
      byteLength: Buffer.byteLength(json, 'utf8'),
      checksumValid: valid,
      hit: true,
      ttlSeconds: null,
      canonicalWrites: false,
      producerRevision: input.producerRevision,
    }),
  };
}
