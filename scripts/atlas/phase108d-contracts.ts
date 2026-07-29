/**
 * Phase 108D Backfill Contracts
 *
 * Strict data validation for embedding backfill to Qdrant
 */

import { z } from 'zod';

// Canonical vector backfill row contract
export const VectorBackfillRowV1 = z.object({
  // Repository identity
  repository_id: z.string().uuid('Invalid repository_id UUID'),

  // Packet identity (canonical source)
  packet_key: z.string().min(1, 'packet_key required'),
  packet_version: z.string().min(1, 'packet_version required'),

  // Chunk identity
  chunk_id: z.string().min(1, 'chunk_id required'),
  source_ref: z.string().min(1, 'source_ref required'),

  // Content validation (SHA-256 full or truncated)
  content_hash: z.string().regex(/^[a-f0-9]{16,64}$/, 'Invalid content_hash (must be hex, 16-64 chars)'),

  // Representation lineage
  representation_id: z.string().min(1, 'representation_id required'),
  producer_version: z.string().min(1, 'producer_version required'),

  // Vector data (EXACT 768 dimensions, all finite)
  vector_raw: z.array(z.number().finite()).length(768, 'Vector must be exactly 768 dimensions'),

  // Deterministic point ID (derived from packet_key + content_hash substring)
  qdrant_point_id: z.string().regex(/^[a-zA-Z0-9\-_:\/\.\(\)]+$/, 'Invalid qdrant_point_id format'),
});

export type VectorBackfillRowV1 = z.infer<typeof VectorBackfillRowV1>;

// Backfill checkpoint (resumable state)
export const BackfillCheckpointV1 = z.object({
  run_id: z.string().uuid(),
  repository_id: z.string().uuid(),
  workspace_revision: z.string(),
  representation_id: z.string(),

  // Progress tracking
  last_processed_chunk_id: z.string().nullable(),
  attempted_count: z.number().int().nonnegative(),
  succeeded_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),

  // Timestamps
  started_at: z.date(),
  last_checkpoint_at: z.date(),
  completed_at: z.date().nullable(),

  // Status
  status: z.enum(['in_progress', 'completed', 'failed', 'paused']),
});

export type BackfillCheckpointV1 = z.infer<typeof BackfillCheckpointV1>;

// Result of a single 10-row proof
export const TenRowProofResultV1 = z.object({
  run_id: z.string().uuid(),
  rows_attempted: z.literal(10),
  rows_upserted: z.number().int(),
  rows_verified: z.number().int(),

  // Verification results
  packet_key_match_count: z.number().int(),
  packet_version_match_count: z.number().int(),
  chunk_id_match_count: z.number().int(),
  content_hash_match_count: z.number().int(),
  representation_id_match_count: z.number().int(),
  vector_dimension_match_count: z.number().int(),

  // Status
  all_match: z.boolean(),
  mismatches: z.array(z.object({
    qdrant_point_id: z.string(),
    field: z.string(),
    expected: z.any(),
    actual: z.any(),
  })),

  status: z.enum(['STATICALLY_PROVEN', 'FAILED']),
});

export type TenRowProofResultV1 = z.infer<typeof TenRowProofResultV1>;

// Result of a 1000-row idempotency proof
export const ThousandRowProofResultV1 = z.object({
  run_id: z.string().uuid(),
  rows_attempted: z.number().int(),
  rows_upserted: z.number().int(),

  // Fixture verification
  expected_point_ids_count: z.number().int(),
  actual_point_ids_count: z.number().int(),
  missing_point_ids: z.array(z.string()),
  unexpected_point_ids: z.array(z.string()),

  // Idempotency test (re-run same 1000 rows)
  idempotency_test_run: z.boolean(),
  idempotency_points_rewritten: z.number().int(),
  idempotency_vector_diffs: z.array(z.object({
    qdrant_point_id: z.string(),
    diff_magnitude: z.number(),
  })),

  // Status
  fixture_complete: z.boolean(),
  idempotent: z.boolean(),
  status: z.enum(['IDEMPOTENCY_PROVEN', 'FIXTURE_INCOMPLETE', 'FAILED']),
});

export type ThousandRowProofResultV1 = z.infer<typeof ThousandRowProofResultV1>;
