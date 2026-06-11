/**
 * Phase 3D: Retrieval Telemetry Recorder
 *
 * Fire-and-forget telemetry capture for retrieval queries.
 * Records every ACE context assembly, search operation, and RAG pipeline execution.
 *
 * Non-blocking: failures are logged but do not interrupt query execution.
 */

import { pool } from '$lib/server/db/client.js';
import crypto from 'node:crypto';

export interface RetrievalTelemetrySignal {
  query: string;
  latencyMs: number;
  vectorHits: number;
  trigramHits: number;
  ftsHits: number;
  selectedPacketKey?: string | null;
  selectedPacketKeys?: string[];
  selectedFeatureId?: string | null;
  featureIds?: string[];
  fusionScore?: number;
  cacheHit?: boolean;
  surface: string;
  environment: string;
  retrievalStrategy?: string;
}

function cleanStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

/**
 * Record a retrieval telemetry signal.
 *
 * This function:
 * 1. Hashes the query for deduplication
 * 2. Inserts the signal into Postgres (fire-and-forget)
 * 3. Logs errors but does not throw (telemetry should not block queries)
 *
 * @param signal - Telemetry signal from retrieval pipeline
 */
export async function recordRetrievalTelemetry(signal: RetrievalTelemetrySignal): Promise<void> {
  try {
    const queryHash = crypto
      .createHash('sha256')
      .update(signal.query)
      .digest('hex');

    const selectedPacketKeys = cleanStringArray(signal.selectedPacketKeys);
    const featureIds = cleanStringArray(signal.featureIds);

    await pool.query(
      `
        insert into retrieval_telemetry (
          query,
          query_hash,
          latency_ms,
          vector_hits,
          trigram_hits,
          fts_hits,
          selected_packet_key,
          selected_packet_keys,
          selected_feature_id,
          feature_ids,
          fusion_score,
          cache_hit,
          surface,
          environment,
          retrieval_strategy
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, $14, $15)
      `,
      [
        signal.query.slice(0, 2000),
        queryHash,
        Math.max(0, Math.round(Number(signal.latencyMs ?? 0))),
        Math.max(0, Math.round(Number(signal.vectorHits ?? 0))),
        Math.max(0, Math.round(Number(signal.trigramHits ?? 0))),
        Math.max(0, Math.round(Number(signal.ftsHits ?? 0))),
        signal.selectedPacketKey ?? selectedPacketKeys[0] ?? null,
        JSON.stringify(selectedPacketKeys),
        signal.selectedFeatureId ?? featureIds[0] ?? null,
        JSON.stringify(featureIds),
        signal.fusionScore ?? null,
        Boolean(signal.cacheHit),
        signal.surface,
        signal.environment,
        signal.retrievalStrategy ?? 'hybrid',
      ],
    );
  } catch (err) {
    // Telemetry failure should not block queries
    console.error('[Telemetry] Failed to record retrieval signal:', {
      query: signal.query.slice(0, 100),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Batch record multiple telemetry signals.
 *
 * Useful when multiple operations (e.g., hybrid search with vector + FTS) happen
 * in a single request context.
 *
 * @param signals - Array of telemetry signals
 */
export async function recordRetrievalTelemetryBatch(signals: RetrievalTelemetrySignal[]): Promise<void> {
  if (signals.length === 0) return;

  try {
    await Promise.all(signals.map((signal) => recordRetrievalTelemetry(signal)));
  } catch (err) {
    console.error('[Telemetry] Failed to record batch:', {
      count: signals.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
