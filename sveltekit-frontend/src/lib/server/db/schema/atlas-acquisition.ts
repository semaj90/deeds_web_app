import { pgTable, text, integer, bigint, timestamp, uuid, jsonb, index, unique } from 'drizzle-orm/pg-core';

/**
 * Parent Atlas acquisition plane — canonical identity chain:
 * research_run_id -> fetch_id -> fetch_attempt_id (many per fetch)
 *                             -> source_revision_id (content identity, digest-deduped)
 *                             -> extraction_id (many per source_revision, one per extractor)
 *
 * workflow_run_id is a nullable external correlation field only — no
 * separate workflow-run owner system exists yet (A2A/orchestrator deferred
 * per openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md GS1.19+).
 * Do not collapse fetch identity, source-revision identity, and extraction
 * identity into one row/table — a single source_revision can have multiple
 * extractions (different extractors), and a 304 response reuses a prior
 * source_revision under a *new* fetch_attempt.
 */

export const atlasResearchRuns = pgTable('atlas_research_runs', {
  researchRunId: uuid('research_run_id').primaryKey().defaultRandom(),
  workflowRunId: text('workflow_run_id'), // external correlation only, nullable
  workspaceId: text('workspace_id').notNull(),
  workspaceRevision: integer('workspace_revision').notNull(),
  query: text('query').notNull(),
  status: text('status').notNull().default('queued'), // queued|acquiring|extracting|validating|indexing|ready|failed
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  workflowRunIdx: index('idx_atlas_research_runs_workflow').on(t.workflowRunId),
  statusIdx: index('idx_atlas_research_runs_status').on(t.status),
}));

export const atlasFetches = pgTable('atlas_fetches', {
  fetchId: uuid('fetch_id').primaryKey().defaultRandom(),
  researchRunId: uuid('research_run_id').notNull().references(() => atlasResearchRuns.researchRunId),
  webSourceId: uuid('web_source_id').notNull().defaultRandom(),
  requestedUrl: text('requested_url').notNull(),
  normalizedUrl: text('normalized_url').notNull(),
  acquisitionMode: text('acquisition_mode').notNull().default('auto'), // auto|static|playwright|crawl4ai
  cachePolicyMode: text('cache_policy_mode').notNull().default('default'), // default|revalidate|bypass|cache_only
  status: text('status').notNull().default('pending'), // pending|fetched|not_modified|cache_hit|failed
  maxAttempts: integer('max_attempts').notNull().default(4),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  researchRunIdx: index('idx_atlas_fetches_research_run').on(t.researchRunId),
  // canonical-URL dedupe within one research run — same URL, same run, one fetch row
  normalizedUrlUniq: unique('atlas_fetches_run_normalized_url_unique').on(t.researchRunId, t.normalizedUrl),
}));

export const atlasFetchAttempts = pgTable('atlas_fetch_attempts', {
  fetchAttemptId: uuid('fetch_attempt_id').primaryKey().defaultRandom(),
  fetchId: uuid('fetch_id').notNull().references(() => atlasFetches.fetchId),
  researchRunId: uuid('research_run_id').notNull().references(() => atlasResearchRuns.researchRunId),
  attemptNumber: integer('attempt_number').notNull(),
  requestedUrl: text('requested_url').notNull(),
  normalizedUrl: text('normalized_url').notNull(),
  acquisitionMode: text('acquisition_mode').notNull(),
  cacheMode: text('cache_mode').notNull(),
  requestEtag: text('request_etag'),
  requestLastModified: text('request_last_modified'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  httpStatus: integer('http_status'),
  finalUrl: text('final_url'),
  redirectChain: jsonb('redirect_chain').$type<Array<{ url: string; status: number }>>(),
  responseEtag: text('response_etag'),
  responseLastModified: text('response_last_modified'),
  cacheControl: text('cache_control'),
  vary: text('vary'),
  contentType: text('content_type'),
  contentLength: bigint('content_length', { mode: 'number' }),
  contentDigest: text('content_digest'),
  sourceRevisionId: uuid('source_revision_id'), // FK added after atlasSourceRevisions is declared below (same file, no forward-ref issue at runtime)
  cacheDecision: text('cache_decision'), // network_fetch|conditional_fetch|not_modified|exact_digest_reuse|fresh_cache_hit|stale_cache_fallback|cache_bypass
  retryClass: text('retry_class'), // transient|permanent|policy
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  traceId: text('trace_id'),
  spanId: text('span_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  fetchIdx: index('idx_atlas_fetch_attempts_fetch').on(t.fetchId, t.attemptNumber),
  fetchAttemptUniq: unique('atlas_fetch_attempts_fetch_attempt_unique').on(t.fetchId, t.attemptNumber),
  traceIdx: index('idx_atlas_fetch_attempts_trace').on(t.traceId),
}));

export const atlasSourceRevisions = pgTable('atlas_source_revisions', {
  sourceRevisionId: uuid('source_revision_id').primaryKey().defaultRandom(),
  webSourceId: uuid('web_source_id').notNull(),
  finalUrl: text('final_url').notNull(),
  contentDigest: text('content_digest').notNull(),
  contentType: text('content_type'),
  contentLength: bigint('content_length', { mode: 'number' }),
  storageUri: text('storage_uri'), // raw bytes location (SeaweedFS S3), set before extraction begins
  httpStatus: integer('http_status'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // exact content-digest equality must not create a duplicate source revision
  digestUniq: unique('atlas_source_revisions_url_digest_unique').on(t.finalUrl, t.contentDigest),
  webSourceIdx: index('idx_atlas_source_revisions_web_source').on(t.webSourceId),
}));

export const atlasExtractions = pgTable('atlas_extractions', {
  extractionId: uuid('extraction_id').primaryKey().defaultRandom(),
  sourceRevisionId: uuid('source_revision_id').notNull().references(() => atlasSourceRevisions.sourceRevisionId),
  fetchId: uuid('fetch_id').notNull().references(() => atlasFetches.fetchId),
  schemaVersion: text('schema_version').notNull().default('atlas.extraction.result.v1'),
  extractorName: text('extractor_name').notNull(), // beautifulsoup|langextract|fallback
  extractorVersion: text('extractor_version'),
  contentDigest: text('content_digest').notNull(),
  normalizedTextDigest: text('normalized_text_digest').notNull(),
  title: text('title'),
  language: text('language'),
  normalizedText: text('normalized_text'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  warnings: jsonb('warnings').$type<string[]>(),
  traceId: text('trace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  sourceRevisionIdx: index('idx_atlas_extractions_source_revision').on(t.sourceRevisionId),
  // a new extraction implementation may create a new extraction_id from the
  // same source_revision_id — dedupe only on exact (source, extractor, digest)
  dedupeUniq: unique('atlas_extractions_dedupe_unique').on(t.sourceRevisionId, t.extractorName, t.extractorVersion, t.normalizedTextDigest),
}));

export type AtlasResearchRun = typeof atlasResearchRuns.$inferSelect;
export type NewAtlasResearchRun = typeof atlasResearchRuns.$inferInsert;
export type AtlasFetch = typeof atlasFetches.$inferSelect;
export type NewAtlasFetch = typeof atlasFetches.$inferInsert;
export type AtlasFetchAttempt = typeof atlasFetchAttempts.$inferSelect;
export type NewAtlasFetchAttempt = typeof atlasFetchAttempts.$inferInsert;
export type AtlasSourceRevision = typeof atlasSourceRevisions.$inferSelect;
export type NewAtlasSourceRevision = typeof atlasSourceRevisions.$inferInsert;
export type AtlasExtraction = typeof atlasExtractions.$inferSelect;
export type NewAtlasExtraction = typeof atlasExtractions.$inferInsert;
