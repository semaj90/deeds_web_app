/**
 * CLASSIFICATION (2026-08-10 summary-producer-ownership audit): DEAD / COMPATIBILITY_LEGACY_384.
 * NOT a canonical writer — do not treat this module as live or as an owner of
 * atlas_summary_layers.
 *
 * `promoteResults()` below has zero callers anywhere in `src/` outside its own
 * `promote-results.spec.ts` (which mocks `db.execute` entirely, so the SQL
 * below has never actually run against a real schema). The live, actually-
 * wired app-side promotion path is a *different* module —
 * `promote-results-outbox.ts` (`recordPromotionIntent`, called from
 * `search-runtime.ts`) — which writes only to `atlas_packets` directly and
 * does not touch `atlas_summary_layers` or any embedding at all. Two parallel
 * promotion systems evolved; only the outbox one ever went live.
 *
 * Stage 3 (`embedSummaries`) and Stage 4 (`syncToQdrant`) are now explicit
 * no-op compatibility shims. The earlier 384-dim summary path referenced a
 * nonexistent `atlas_packets.summary_embedding_384` column and therefore
 * cannot be a canonical writer. Per the current summary-producer ownership
 * contract, canonical summary embeddings must use `semantic_768` / 768 with
 * full provenance elsewhere; this module is retained only because Stage 1
 * and Stage 2 still model the summary promotion flow and the spec references
 * them. Do not treat this module as an owner of summary embedding truth.
 *
 * ---
 *
 * Original docstring (historical, describes intended-but-never-live design):
 *
 * Stage 5: Promotion & Persistence
 *
 * Takes accepted results and writes them back through the canonical layers:
 *
 * codebase_chunk_index.summary (source of truth — already done)
 *          ↓ identity join
 * atlas_summary_layers (canonicalize)
 *          ↓
 * atlas_packets.summary (propagate)
 *          ↓
 * Embed summary → summary_384 vectors
 *          ↓
 * Feature envelopes (construct JSONB)
 *          ↓
 * Qdrant summary_384 (mirror)
 *
 * Critical: uses consistent identity chain:
 * - codebase_chunk_index.id (chunk identity)
 * - source_ref (canonical file reference)
 * - packet_key (stable lookup key)
 * - content_hash (duplicate detection)
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import type { FeatureEnvelope } from './feature-envelope.js';

/**
 * Promotion result tracking
 */
export interface PromotionResult {
  success: boolean;
  stage: 'atlas_summary_layers' | 'atlas_packets' | 'summary_embeddings' | 'qdrant_sync' | 'error';
  recordsProcessed: number;
  recordsCommitted: number;
  recordsFailed: number;
  message: string;
}

/**
 * Promote results to canonical layers
 * Called after search completes and user accepts results
 */
export async function promoteResults(
  results: FeatureEnvelope[],
  context: {
    queryText: string;
    userId?: string;
    queryEmbedding?: number[];
  },
): Promise<PromotionResult> {
  if (results.length === 0) {
    return {
      success: true,
      stage: 'atlas_summary_layers',
      recordsProcessed: 0,
      recordsCommitted: 0,
      recordsFailed: 0,
      message: 'No results to promote',
    };
  }

  try {
    // Stage 1: Migrate summaries to atlas_summary_layers
    const summaryLayerResult = await promoteSummariesToAtlas(results, context);
    if (!summaryLayerResult.success) return summaryLayerResult;

    // Stage 2: Propagate to atlas_packets
    const atlasPacketsResult = await propagateToAtlasPackets(results);
    if (!atlasPacketsResult.success) return atlasPacketsResult;

    // Stage 3: Embed summaries (384-dim)
    const embeddingResult = await embedSummaries(results);
    if (!embeddingResult.success) return embeddingResult;

    // Stage 4: Sync to Qdrant
    const qdrantResult = await syncToQdrant(results, embeddingResult.recordsCommitted);
    return qdrantResult;
  } catch (error) {
    console.error('Promotion pipeline failed:', error);
    return {
      success: false,
      stage: 'error',
      recordsProcessed: 0,
      recordsCommitted: 0,
      recordsFailed: results.length,
      message: `Promotion failed: ${String(error)}`,
    };
  }
}

/**
 * Stage 1: Migrate summaries from codebase_chunk_index to atlas_summary_layers
 * Uses identity join to preserve canonical identity
 */
async function promoteSummariesToAtlas(
  results: FeatureEnvelope[],
  context: { queryText: string; userId?: string },
): Promise<PromotionResult> {
  try {
    const packetKeys = results.map(r => r.packet_key);

    // Insert or update atlas_summary_layers
    // Join on packet_key → source_ref → codebase_chunk_index
    const result = await db.execute(sql`
      INSERT INTO atlas_summary_layers (
        packet_key,
        source_ref,
        summary,
        summary_length,
        keywords,
        extracted_at,
        gemma_model,
        confidence
      )
      SELECT
        cci.packet_key,
        cci.source_ref,
        cci.summary,
        LENGTH(COALESCE(cci.summary, '')),
        cci.keywords,
        NOW(),
        'gemma4-rotorquant:latest',
        0.85
      FROM codebase_chunk_index cci
      WHERE cci.packet_key = ANY($1::text[])
        AND cci.summary IS NOT NULL
        AND LENGTH(TRIM(cci.summary)) > 0
      ON CONFLICT (packet_key) DO UPDATE SET
        summary = EXCLUDED.summary,
        summary_length = EXCLUDED.summary_length,
        updated_at = NOW()
      RETURNING packet_key
    `);

    const committed = (result.rows as Array<{ packet_key: string }>).length;
    return {
      success: true,
      stage: 'atlas_summary_layers',
      recordsProcessed: results.length,
      recordsCommitted: committed,
      recordsFailed: results.length - committed,
      message: `Promoted ${committed}/${results.length} summaries to atlas_summary_layers`,
    };
  } catch (error) {
    console.error('Stage 1 failed:', error);
    return {
      success: false,
      stage: 'atlas_summary_layers',
      recordsProcessed: results.length,
      recordsCommitted: 0,
      recordsFailed: results.length,
      message: `Failed to promote to atlas_summary_layers: ${String(error)}`,
    };
  }
}

/**
 * Stage 2: Propagate summaries to atlas_packets
 */
async function propagateToAtlasPackets(results: FeatureEnvelope[]): Promise<PromotionResult> {
  try {
    const packetKeys = results.map(r => r.packet_key);

    // Update atlas_packets with summaries from atlas_summary_layers
    const result = await db.execute(sql`
      UPDATE atlas_packets ap
      SET
        summary = asl.summary,
        updated_at = NOW()
      FROM atlas_summary_layers asl
      WHERE ap.packet_key = asl.packet_key
        AND ap.packet_key = ANY($1::text[])
      RETURNING ap.packet_key
    `);

    const committed = (result.rows as Array<{ packet_key: string }>).length;
    return {
      success: true,
      stage: 'atlas_packets',
      recordsProcessed: results.length,
      recordsCommitted: committed,
      recordsFailed: results.length - committed,
      message: `Propagated ${committed}/${results.length} summaries to atlas_packets`,
    };
  } catch (error) {
    console.error('Stage 2 failed:', error);
    return {
      success: false,
      stage: 'atlas_packets',
      recordsProcessed: results.length,
      recordsCommitted: 0,
      recordsFailed: results.length,
      message: `Failed to propagate to atlas_packets: ${String(error)}`,
    };
  }
}

/**
 * Stage 3: Legacy compatibility shim for the retired 384-dim summary path.
 * Canonical summary embeddings are owned elsewhere; this stage is intentionally
 * disabled and performs no writes.
 */
async function embedSummaries(results: FeatureEnvelope[]): Promise<PromotionResult> {
  return {
    success: true,
    stage: 'summary_embeddings',
    recordsProcessed: results.length,
    recordsCommitted: 0,
    recordsFailed: 0,
    message: 'Legacy 384 summary embedding path disabled; canonical summary embeddings must use semantic_768 elsewhere.',
  };
}

/**
 * Stage 4: Legacy compatibility shim for the retired summary embedding sync.
 * Canonical summary embeddings are owned elsewhere; this stage is intentionally
 * disabled and performs no writes.
 */
async function syncToQdrant(
  results: FeatureEnvelope[],
  embeddedCount: number,
): Promise<PromotionResult> {
  return {
    success: true,
    stage: 'qdrant_sync',
    recordsProcessed: results.length,
    recordsCommitted: 0,
    recordsFailed: 0,
    message: embeddedCount === 0
      ? 'No embeddings to sync'
      : 'Legacy summary embedding sync disabled; no canonical 384 summary writer exists.',
  };
}
