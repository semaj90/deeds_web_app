/**
 * Codebase Intelligence Schema
 *
 * Tables that support the Qdrant → Postgres mirror pipeline:
 *   code_repos            — registry of indexed repositories
 *   enrichment_jobs       — durable progress tracking for batch workers
 *   gpu_cluster_centroids — persisted 768-dim cluster centroid vectors
 *
 * codebaseChunkIndex, clusterSummaries, llmOutputs, llmOutputChunks
 * are defined in search-analytics.ts and referenced here via import.
 */
import {
	index,
	integer,
	jsonb,
	pgTable,
	real,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── code_repos ────────────────────────────────────────────────────────────────
// Canonical registry of indexed code repositories.
// One row per unique repo/branch/commit the mirror worker has processed.

export const codeRepos = pgTable('code_repos', {
	repoId:    uuid('repo_id').defaultRandom().primaryKey(),
	name:      text('name').notNull(),
	branch:    text('branch'),
	commitSha: text('commit_sha'),
	metadata:  jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export type CodeRepo    = typeof codeRepos.$inferSelect;
export type NewCodeRepo = typeof codeRepos.$inferInsert;

// ── enrichment_jobs ───────────────────────────────────────────────────────────
// Durable progress state for batch workers:
//   job_type: 'qdrant_mirror' | 'gpu_cluster' | 'cluster_summary' | 'embedding_backfill'
//   status:   'queued' | 'running' | 'completed' | 'failed'

export const enrichmentJobs = pgTable('enrichment_jobs', {
	jobId:          uuid('job_id').defaultRandom().primaryKey(),
	repoId:         uuid('repo_id').references(() => codeRepos.repoId, { onDelete: 'set null' }),
	jobType:        text('job_type').notNull(),
	status:         text('status').notNull().default('queued'),
	cursor:         text('cursor'),
	totalProcessed: integer('total_processed').notNull().default(0),
	totalUpserted:  integer('total_upserted').notNull().default(0),
	totalFailed:    integer('total_failed').notNull().default(0),
	startedAt:      timestamp('started_at', { withTimezone: true }),
	finishedAt:     timestamp('finished_at', { withTimezone: true }),
	metadata:       jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	error:          jsonb('error'),
	createdAt:      timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	statusIdx:  index('idx_enrichment_jobs_status').on(t.status),
	jobTypeIdx: index('idx_enrichment_jobs_job_type').on(t.jobType),
	repoIdx:    index('idx_enrichment_jobs_repo_id').on(t.repoId),
}));

export type EnrichmentJob    = typeof enrichmentJobs.$inferSelect;
export type NewEnrichmentJob = typeof enrichmentJobs.$inferInsert;

// ── gpu_cluster_centroids ─────────────────────────────────────────────────────
// Persists precomputed 768-dim cluster centroid vectors so they survive Redis
// restarts. The graphify:semantic pipeline writes here after GPU k-means;
// the ACE context-assembler reads these for nearest-cluster pre-filtering.
//
// centroid_vec uses real[] (pgvector halfvec is preferred but needs the
// extension pre-enabled; real[] works everywhere and pgvector HNSW index
// can be added manually via 0016_cluster_centroids.sql).

export const gpuClusterCentroids = pgTable('gpu_cluster_centroids', {
	clusterId:      integer('cluster_id').notNull().primaryKey(),
	clusterType:    text('cluster_type').notNull().default('gpu'),  // 'gpu' | 'som'
	centroidVec:    real('centroid_vec').array().notNull(),          // 768-dim
	chunkCount:     integer('chunk_count').notNull().default(0),
	dominantTags:   text('dominant_tags').array().notNull().default(sql`'{}'::text[]`),
	purpose:        text('purpose'),
	metadata:       jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
	computedAt:     timestamp('computed_at', { withTimezone: true }).notNull().default(sql`now()`),
	updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
	typeIdx: index('idx_gpu_cluster_centroids_type').on(t.clusterType),
}));

export type GpuClusterCentroid    = typeof gpuClusterCentroids.$inferSelect;
export type NewGpuClusterCentroid = typeof gpuClusterCentroids.$inferInsert;
