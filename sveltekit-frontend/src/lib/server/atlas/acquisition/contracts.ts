/**
 * Versioned acquisition contracts — Parent Atlas acquisition plane.
 *
 * Identity boundary (do not merge): workflowRunId (external correlation only,
 * nullable) -> researchRunId -> fetchId -> fetchAttemptId (per attempt)
 *                                        -> sourceRevisionId (digest-deduped)
 *                                        -> extractionId (per extractor)
 *
 * See openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md GS1.19+
 * for the acquisition/canonical-ingestion boundary this sits inside of.
 */

import { z } from 'zod';

export const AcquisitionModeSchema = z.enum(['auto', 'static', 'playwright', 'crawl4ai']);
export type AcquisitionMode = z.infer<typeof AcquisitionModeSchema>;

export const CachePolicyModeSchema = z.enum(['default', 'revalidate', 'bypass', 'cache_only']);
export type CachePolicyMode = z.infer<typeof CachePolicyModeSchema>;

export const CacheDecisionSchema = z.enum([
  'network_fetch',
  'conditional_fetch',
  'not_modified',
  'exact_digest_reuse',
  'fresh_cache_hit',
  'stale_cache_fallback',
  'cache_bypass',
]);
export type CacheDecision = z.infer<typeof CacheDecisionSchema>;

export const RetryClassSchema = z.enum(['transient', 'permanent', 'policy']);
export type RetryClass = z.infer<typeof RetryClassSchema>;

export const AcquisitionRequestV1Schema = z.object({
  schemaVersion: z.literal('atlas.acquisition.request.v1'),
  eventId: z.string().uuid(),
  workflowRunId: z.string().nullable().optional(),
  researchRunId: z.string().uuid(),
  fetchId: z.string().uuid(),
  workspaceId: z.string().min(1),
  workspaceRevision: z.number().int().nonnegative(),
  requestedUrl: z.string().url(),
  normalizedUrl: z.string().url(),
  acquisitionMode: AcquisitionModeSchema.default('auto'),
  cachePolicy: z.object({
    mode: CachePolicyModeSchema.default('default'),
    allowStaleOnError: z.boolean().default(false),
    maximumStaleSeconds: z.number().int().nonnegative().optional(),
  }),
  priorRevision: z
    .object({
      sourceRevisionId: z.string().uuid().optional(),
      contentDigest: z.string().optional(),
      etag: z.string().optional(),
      lastModified: z.string().optional(),
    })
    .optional(),
  finalUrl: z.string().url().optional(),
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive().default(4),
  requestedAt: z.string().datetime(),
});
export type AcquisitionRequestV1 = z.infer<typeof AcquisitionRequestV1Schema>;

export const AcquisitionResultV1Schema = z.object({
  schemaVersion: z.literal('atlas.acquisition.result.v1'),
  eventId: z.string().uuid(),
  workflowRunId: z.string().nullable().optional(),
  researchRunId: z.string().uuid(),
  fetchId: z.string().uuid(),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  redirectChain: z.array(z.object({ url: z.string().url(), status: z.number().int() })).default([]),
  status: z.enum(['fetched', 'not_modified', 'cache_hit', 'failed']),
  httpStatus: z.number().int().optional(),
  contentType: z.string().optional(),
  contentLength: z.number().int().nonnegative().optional(),
  cache: z.object({
    decision: CacheDecisionSchema,
    etag: z.string().optional(),
    lastModified: z.string().optional(),
    cacheControl: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
    ageSeconds: z.number().nonnegative().optional(),
    vary: z.string().optional(),
  }),
  contentDigest: z.string().optional(),
  storageUri: z.string().optional(),
  sourceRevisionId: z.string().uuid().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  error: z
    .object({
      code: z.string(),
      retryClass: RetryClassSchema,
      message: z.string(),
    })
    .optional(),
});
export type AcquisitionResultV1 = z.infer<typeof AcquisitionResultV1Schema>;

export const ExtractionRequestV1Schema = z.object({
  schemaVersion: z.literal('atlas.extraction.request.v1'),
  workflowRunId: z.string(),
  fetchId: z.string(),
  sourceRevisionId: z.string(),
  storageUri: z.string(),
  contentType: z.string(),
  finalUrl: z.string().url(),
  traceparent: z.string().optional(),
});
export type ExtractionRequestV1 = z.infer<typeof ExtractionRequestV1Schema>;

export const ExtractionResultV1Schema = z.object({
  schemaVersion: z.literal('atlas.extraction.result.v1'),
  workflowRunId: z.string(),
  fetchId: z.string(),
  sourceRevisionId: z.string(),
  extractionId: z.string(),
  extractor: z.object({ name: z.string(), version: z.string().optional() }),
  contentDigest: z.string(),
  normalizedTextDigest: z.string(),
  title: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  warnings: z.array(z.string()).default([]),
  traceId: z.string().optional(),
});
export type ExtractionResultV1 = z.infer<typeof ExtractionResultV1Schema>;
