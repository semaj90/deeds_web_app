"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractionResultV1Schema = exports.ExtractionRequestV1Schema = exports.AcquisitionResultV1Schema = exports.AcquisitionRequestV1Schema = exports.RetryClassSchema = exports.CacheDecisionSchema = exports.CachePolicyModeSchema = exports.AcquisitionModeSchema = void 0;
var zod_1 = require("zod");
exports.AcquisitionModeSchema = zod_1.z.enum(['auto', 'static', 'playwright', 'crawl4ai']);
exports.CachePolicyModeSchema = zod_1.z.enum(['default', 'revalidate', 'bypass', 'cache_only']);
exports.CacheDecisionSchema = zod_1.z.enum([
    'network_fetch',
    'conditional_fetch',
    'not_modified',
    'exact_digest_reuse',
    'fresh_cache_hit',
    'stale_cache_fallback',
    'cache_bypass',
]);
exports.RetryClassSchema = zod_1.z.enum(['transient', 'permanent', 'policy']);
exports.AcquisitionRequestV1Schema = zod_1.z.object({
    schemaVersion: zod_1.z.literal('atlas.acquisition.request.v1'),
    eventId: zod_1.z.string().uuid(),
    workflowRunId: zod_1.z.string().nullable().optional(),
    researchRunId: zod_1.z.string().uuid(),
    fetchId: zod_1.z.string().uuid(),
    workspaceId: zod_1.z.string().min(1),
    workspaceRevision: zod_1.z.number().int().nonnegative(),
    requestedUrl: zod_1.z.string().url(),
    normalizedUrl: zod_1.z.string().url(),
    acquisitionMode: exports.AcquisitionModeSchema.default('auto'),
    cachePolicy: zod_1.z.object({
        mode: exports.CachePolicyModeSchema.default('default'),
        allowStaleOnError: zod_1.z.boolean().default(false),
        maximumStaleSeconds: zod_1.z.number().int().nonnegative().optional(),
    }),
    priorRevision: zod_1.z
        .object({
        sourceRevisionId: zod_1.z.string().uuid().optional(),
        contentDigest: zod_1.z.string().optional(),
        etag: zod_1.z.string().optional(),
        lastModified: zod_1.z.string().optional(),
    })
        .optional(),
    finalUrl: zod_1.z.string().url().optional(),
    attempt: zod_1.z.number().int().positive(),
    maxAttempts: zod_1.z.number().int().positive().default(4),
    requestedAt: zod_1.z.string().datetime(),
});
exports.AcquisitionResultV1Schema = zod_1.z.object({
    schemaVersion: zod_1.z.literal('atlas.acquisition.result.v1'),
    eventId: zod_1.z.string().uuid(),
    workflowRunId: zod_1.z.string().nullable().optional(),
    researchRunId: zod_1.z.string().uuid(),
    fetchId: zod_1.z.string().uuid(),
    requestedUrl: zod_1.z.string().url(),
    finalUrl: zod_1.z.string().url(),
    redirectChain: zod_1.z.array(zod_1.z.object({ url: zod_1.z.string().url(), status: zod_1.z.number().int() })).default([]),
    status: zod_1.z.enum(['fetched', 'not_modified', 'cache_hit', 'failed']),
    httpStatus: zod_1.z.number().int().optional(),
    contentType: zod_1.z.string().optional(),
    contentLength: zod_1.z.number().int().nonnegative().optional(),
    cache: zod_1.z.object({
        decision: exports.CacheDecisionSchema,
        etag: zod_1.z.string().optional(),
        lastModified: zod_1.z.string().optional(),
        cacheControl: zod_1.z.string().optional(),
        expiresAt: zod_1.z.string().datetime().optional(),
        ageSeconds: zod_1.z.number().nonnegative().optional(),
        vary: zod_1.z.string().optional(),
    }),
    contentDigest: zod_1.z.string().optional(),
    storageUri: zod_1.z.string().optional(),
    sourceRevisionId: zod_1.z.string().uuid().optional(),
    startedAt: zod_1.z.string().datetime(),
    completedAt: zod_1.z.string().datetime(),
    durationMs: zod_1.z.number().int().nonnegative(),
    error: zod_1.z
        .object({
        code: zod_1.z.string(),
        retryClass: exports.RetryClassSchema,
        message: zod_1.z.string(),
    })
        .optional(),
});
exports.ExtractionRequestV1Schema = zod_1.z.object({
    schemaVersion: zod_1.z.literal('atlas.extraction.request.v1'),
    workflowRunId: zod_1.z.string(),
    fetchId: zod_1.z.string(),
    sourceRevisionId: zod_1.z.string(),
    storageUri: zod_1.z.string(),
    contentType: zod_1.z.string(),
    finalUrl: zod_1.z.string().url(),
    traceparent: zod_1.z.string().optional(),
});
exports.ExtractionResultV1Schema = zod_1.z.object({
    schemaVersion: zod_1.z.literal('atlas.extraction.result.v1'),
    workflowRunId: zod_1.z.string(),
    fetchId: zod_1.z.string(),
    sourceRevisionId: zod_1.z.string(),
    extractionId: zod_1.z.string(),
    extractor: zod_1.z.object({ name: zod_1.z.string(), version: zod_1.z.string().optional() }),
    contentDigest: zod_1.z.string(),
    normalizedTextDigest: zod_1.z.string(),
    title: zod_1.z.string().nullable().optional(),
    language: zod_1.z.string().nullable().optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).default({}),
    warnings: zod_1.z.array(zod_1.z.string()).default([]),
    traceId: zod_1.z.string().optional(),
});
