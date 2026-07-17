/**
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
import { embedText as embedEmbeddingGemmaText } from '$lib/server/embedding/embed.js';
import type { FeatureEnvelope } from './feature-envelope.js';
import { syncSummaryPayloadToQdrant } from './qdrant-summary-sync.js';

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
    `, packetKeys);

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
    `, packetKeys);

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
 * Stage 3: Embed summaries (384-dim) and store in atlas_packets
 * Uses existing embedding infrastructure
 */
async function embedSummaries(results: FeatureEnvelope[]): Promise<PromotionResult> {
  try {
    let committed = 0;
    let failed = 0;

    for (const result of results) {
      try {
        if (!result.summary) continue;

        // TODO: Embed via EmbeddingGemma (384-dim)
        const embedding = await embedText(result.summary);
        if (!embedding) {
          failed++;
          continue;
        }

        // Store in atlas_packets.summary_embedding_384
        await db.execute(sql`
          UPDATE atlas_packets
          SET
            summary_embedding_384 = $1::vector,
            updated_at = NOW()
          WHERE packet_key = $2
        `, [embedding, result.packet_key]);

        committed++;
      } catch (e) {
        console.warn(`Failed to embed summary for ${result.packet_key}:`, e);
        failed++;
      }
    }

    return {
      success: true,
      stage: 'summary_embeddings',
      recordsProcessed: results.length,
      recordsCommitted: committed,
      recordsFailed: failed,
      message: `Embedded ${committed}/${results.length} summaries (384-dim)`,
    };
  } catch (error) {
    console.error('Stage 3 failed:', error);
    return {
      success: false,
      stage: 'summary_embeddings',
      recordsProcessed: results.length,
      recordsCommitted: 0,
      recordsFailed: results.length,
      message: `Failed to embed summaries: ${String(error)}`,
    };
  }
}

/**
 * Stage 4: Sync summary embeddings to Qdrant
 * Adds or updates payload in the canonical codebase_chunks_384 hybrid/dense collection.
 */
async function syncToQdrant(
  results: FeatureEnvelope[],
  embeddedCount: number,
): Promise<PromotionResult> {
  try {
    if (embeddedCount === 0) {
      return {
        success: true,
        stage: 'qdrant_sync',
        recordsProcessed: results.length,
        recordsCommitted: 0,
        recordsFailed: 0,
        message: 'No embeddings to sync',
      };
    }

    // Fetch updated summaries from Postgres
    const packetKeys = results.map(r => r.packet_key);
    const summaries = await db.execute(sql`
      SELECT
        packet_key,
        source_ref,
        summary,
        summary_embedding_384,
        qdrant_point_id
      FROM atlas_packets
      WHERE packet_key = ANY($1::text[])
        AND summary_embedding_384 IS NOT NULL
    `, packetKeys);

    type SummaryRow = {
      packet_key: string;
      source_ref: string | null;
      summary: string;
      summary_embedding_384: number[];
      qdrant_point_id?: string | null;
    };

    const rows = summaries.rows as SummaryRow[];
    let updatedPoints = 0;
    let failedPoints = 0;
    for (const row of rows) {
      try {
        const syncResult = await syncSummaryPayloadToQdrant({
          packetKey: row.packet_key,
          qdrantPointId: row.qdrant_point_id ?? null,
          payload: {
            source_ref: row.source_ref,
            summary: row.summary,
            summary_embedding_384: row.summary_embedding_384,
            summary_synced_at: new Date().toISOString(),
          },
        });
        updatedPoints += syncResult.updatedPoints;
      } catch (e) {
        console.warn(`Failed to sync ${row.packet_key} to Qdrant:`, e);
        failedPoints += 1;
      }
    }

    return {
      success: true,
      stage: 'qdrant_sync',
      recordsProcessed: embeddedCount,
      recordsCommitted: updatedPoints,
      recordsFailed: failedPoints,
      message: `Synced ${updatedPoints}/${rows.length} summaries to Qdrant`,
    };
  } catch (error) {
    console.error('Stage 4 failed:', error);
    return {
      success: false,
      stage: 'qdrant_sync',
      recordsProcessed: results.length,
      recordsCommitted: 0,
      recordsFailed: results.length,
      message: `Failed to sync to Qdrant: ${String(error)}`,
    };
  }
}

/**
 * Helper: Embed text using EmbeddingGemma (384-dim)
 * TODO: Wire to actual embedding service
 */
async function embedText(text: string): Promise<number[] | null> {
  try {
    if (!text) return null;
    return await embedEmbeddingGemmaText(text.slice(0, 2000));
  } catch (error) {
    console.warn('Embedding failed:', error);
    return null;
  }
}
