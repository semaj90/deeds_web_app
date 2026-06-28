/**
 * PHASE 85a: Artifact Registry (Universal Derived Registry)
 *
 * Every generated thing becomes one entry:
 * - summary, embedding, latent64, som_cell, redis_cache, markdown, qdrant_payload
 * - gemma4_prompt, gemma4_output, feature_labels, gan_report, benchmark, trace
 *
 * Makes everything queryable: "Show all Gemma4 v1.0 summaries that failed GAN validation"
 */

import { pgTable, uuid, varchar, text, real, timestamp, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const atlas_artifacts = pgTable(
  'atlas_artifacts',
  {
    artifact_id: uuid('artifact_id').primaryKey().defaultRandom(),

    // Packet identity (immutable link)
    packet_key: varchar('packet_key', { length: 255 }).notNull(),
    source_ref: varchar('source_ref', { length: 512 }).notNull(),
    feature_id: varchar('feature_id', { length: 255 }),

    // What type of artifact
    artifact_type: varchar('artifact_type', {
      length: 50,
      enum: [
        'summary',
        'embedding',
        'latent64',
        'som_cell',
        'redis_cache',
        'markdown',
        'qdrant_payload',
        'gemma4_prompt',
        'gemma4_output',
        'feature_labels',
        'gan_report',
        'benchmark',
        'trace',
      ],
    }).notNull(),

    // Content hash (for dedup)
    content_hash: varchar('content_hash', { length: 64 }),

    // Generator info
    generator: varchar('generator', {
      length: 100,
      enum: [
        'Gemma4',
        'EmbeddingGemma',
        'AutoEncoder',
        'SOM',
        'KarpathyBlender',
        'GANValidator',
        'LangExtract',
        'MarkdownGenerator',
        'TraceExporter',
      ],
    }).notNull(),

    generator_version: varchar('generator_version', { length: 100 }).notNull(),

    // Generator config (JSONB for flexibility)
    generator_config: text('generator_config'),

    // Storage backend
    storage_backend: varchar('storage_backend', {
      length: 50,
      enum: ['filesystem', 'qdrant', 'redis', 'postgres_jsonb', 'seaweedfs'],
    }).notNull(),

    // Where it's stored
    storage_location: text('storage_location'),

    // GAN validation results
    gan_validated: timestamp('gan_validated'),
    gan_validation_score: real('gan_validation_score'),

    // Superseded artifact (if regenerated)
    supersedes_artifact_id: uuid('supersedes_artifact_id'),

    // Status
    status: varchar('status', {
      length: 50,
      enum: ['generated', 'validated', 'superseded', 'failed'],
    }).notNull().default('generated'),

    // Trace ID for linking to agent runs
    trace_id: uuid('trace_id'),

    // Git commit (immutable reference)
    git_commit: varchar('git_commit', { length: 40 }),

    // Timestamps
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    // Identity indexes
    idx_packet_key: index('idx_artifacts_packet_key').on(table.packet_key),
    idx_source_ref: index('idx_artifacts_source_ref').on(table.source_ref),
    idx_feature_id: index('idx_artifacts_feature_id').on(table.feature_id),

    // Generator indexes
    idx_generator: index('idx_artifacts_generator').on(table.generator),
    idx_generator_version: index('idx_artifacts_generator_version').on(table.generator_version),

    // Tracking
    idx_artifact_type: index('idx_artifacts_type').on(table.artifact_type),
    idx_status: index('idx_artifacts_status').on(table.status),
    idx_supersedes: index('idx_artifacts_supersedes').on(table.supersedes_artifact_id),

    // Time-based queries
    idx_created_at: index('idx_artifacts_created_at').on(table.created_at),
    idx_gan_validated: index('idx_artifacts_gan_validated').on(table.gan_validated),

    // Composite for common queries
    idx_generator_status: index('idx_artifacts_generator_status').on(table.generator, table.status),
  })
);

export type AtlasArtifact = typeof atlas_artifacts.$inferSelect;
export type NewAtlasArtifact = typeof atlas_artifacts.$inferInsert;

export const insertArtifactSchema = createInsertSchema(atlas_artifacts);
export const selectArtifactSchema = createSelectSchema(atlas_artifacts);
