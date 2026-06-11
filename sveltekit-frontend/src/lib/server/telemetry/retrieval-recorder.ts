/**
 * Phase 3D: Retrieval Telemetry Recorder
 *
 * Fire-and-forget telemetry capture for retrieval queries.
 * Records every ACE context assembly, search operation, and RAG pipeline execution.
 *
 * Non-blocking: failures are logged but do not interrupt query execution.
 */

import { db } from '$lib/server/db/client';
import { retrievalTelemetry } from '$lib/server/db/schema-postgres';
import crypto from 'node:crypto';

export interface RetrievalTelemetrySignal {
  query: string;
  latencyMs: number;
  vectorHits: number;
  trigramHits: number;
  ftsHits: number;
  selectedPacketKey?: string;
  selectedFeatureId?: string;
  fusionScore?: number;
  cacheHit?: boolean;
  surface: string;
  environment: string;
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

    await db
      .insert(retrievalTelemetry)
      .values({
        query: signal.query.slice(0, 2000),
        queryHash,
        latencyMs: signal.latencyMs,
        vectorHits: signal.vectorHits,
        trigramHits: signal.trigramHits,
        ftsHits: signal.ftsHits,
        selectedPacketKey: signal.selectedPacketKey || null,
        selectedFeatureId: signal.selectedFeatureId || null,
        fusionScore: signal.fusionScore || null,
        cacheHit: signal.cacheHit || false,
        surface: signal.surface,
        environment: signal.environment,
      })
      .run();
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
    const records = signals.map((signal) => ({
      query: signal.query.slice(0, 2000),
      queryHash: crypto.createHash('sha256').update(signal.query).digest('hex'),
      latencyMs: signal.latencyMs,
      vectorHits: signal.vectorHits,
      trigramHits: signal.trigramHits,
      ftsHits: signal.ftsHits,
      selectedPacketKey: signal.selectedPacketKey || null,
      selectedFeatureId: signal.selectedFeatureId || null,
      fusionScore: signal.fusionScore || null,
      cacheHit: signal.cacheHit || false,
      surface: signal.surface,
      environment: signal.environment,
    }));

    await db.insert(retrievalTelemetry).values(records).run();
  } catch (err) {
    console.error('[Telemetry] Failed to record batch:', {
      count: signals.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
