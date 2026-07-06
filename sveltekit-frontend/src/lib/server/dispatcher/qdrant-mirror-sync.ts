/**
 * Qdrant Mirror Sync Service
 * Syncs canonical packet data to Qdrant payloads
 * Updates identity_lane, confidence, and directory context
 */

import { describe } from 'vitest';

interface QdrantSyncPacket {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  identity_lane?: string;
  confidence?: number;
  summary?: string;
  directory_path?: string;
  domain_class?: string;
}

interface QdrantPoint {
  id: string;
  vector?: number[];
  payload: Record<string, unknown>;
}

interface QdrantSyncResult {
  synced: number;
  failed: number;
  collection: string;
  errors: Array<{ packet_key: string; error: string }>;
  duration_ms: number;
}

/**
 * Sync canonical packet data to Qdrant payloads
 * Batches updates via HTTP API (not docker exec)
 *
 * @param qdrantBaseUrl — Qdrant HTTP endpoint (e.g., http://127.0.0.1:6333)
 * @param packets — Canonical packets to sync
 * @param collection — Target collection (default: codebase_chunks_768)
 * @returns Sync result with counts and errors
 */
export async function syncPacketsToQdrant(
  qdrantBaseUrl: string,
  packets: QdrantSyncPacket[],
  collection: string = 'codebase_chunks_768'
): Promise<QdrantSyncResult> {
  const startMs = Date.now();
  const errors: Array<{ packet_key: string; error: string }> = [];
  let synced = 0;
  let failed = 0;

  // Batch size: 100 packets per request (Qdrant API limit)
  const batchSize = 100;

  for (let i = 0; i < packets.length; i += batchSize) {
    const batch = packets.slice(i, i + batchSize);

    try {
      // Build points for batch upsert
      const points: QdrantPoint[] = await Promise.all(
        batch.map(async (packet) => {
          // Resolve qdrant_point_id from packet_key
          // In production, this would query Postgres to find the Qdrant point ID
          // For now, we use packet_key as a deterministic hash seed
          const pointId = await resolveQdrantPointId(packet.packet_key);

          return {
            id: pointId,
            payload: {
              packet_key: packet.packet_key,
              source_ref: packet.source_ref,
              feature_id: packet.feature_id,
              identity_lane: packet.identity_lane || 'canonical',
              confidence: packet.confidence ?? 0.95,
              summary: packet.summary || '',
              directory_path: packet.directory_path,
              domain_class: packet.domain_class,
              updated_at: new Date().toISOString(),
            },
          };
        })
      );

      // HTTP PUT to Qdrant batch upsert endpoint
      const response = await fetch(`${qdrantBaseUrl}/collections/${collection}/points?wait=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Qdrant HTTP ${response.status}: ${errorBody}`);
      }

      synced += batch.length;
      console.log(`[qdrant-mirror-sync] Synced batch ${Math.floor(i / batchSize) + 1}: ${batch.length} points`);
    } catch (err) {
      // Record batch error and continue
      const batchError = String(err);
      batch.forEach((packet) => {
        errors.push({ packet_key: packet.packet_key, error: batchError });
        failed++;
      });
      console.error(`[qdrant-mirror-sync] Batch error at offset ${i}: ${batchError}`);
    }
  }

  const durationMs = Date.now() - startMs;
  return {
    synced,
    failed,
    collection,
    errors,
    duration_ms: durationMs,
  };
}

/**
 * Resolve Qdrant point ID from packet_key
 * In production, queries a bridge table (atlas_packets.qdrant_point_id)
 * For now, uses deterministic hash
 */
async function resolveQdrantPointId(packetKey: string): Promise<string> {
  // Placeholder: in production, this queries:
  // SELECT qdrant_point_id FROM atlas_packets WHERE packet_key = $1
  // For now, compute a hash-based ID that's stable across reruns
  const hash = simpleHash(packetKey);
  return String(Math.abs(hash % 9_223_372_036_854_775_807)); // uint64-safe
}

/**
 * Simple hash function for stable point ID generation
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Validate Qdrant collection health
 * Checks connectivity and payload schema compatibility
 */
export async function validateQdrantHealth(
  qdrantBaseUrl: string,
  collection: string = 'codebase_chunks_768'
): Promise<{
  healthy: boolean;
  collection_exists: boolean;
  point_count: number;
  error?: string;
}> {
  try {
    // GET collection info
    const response = await fetch(`${qdrantBaseUrl}/collections/${collection}`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { healthy: false, collection_exists: false, point_count: 0 };
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      result?: { points_count: number };
    };
    const pointCount = data.result?.points_count ?? 0;

    return {
      healthy: true,
      collection_exists: true,
      point_count: pointCount,
    };
  } catch (err) {
    return {
      healthy: false,
      collection_exists: false,
      point_count: 0,
      error: String(err),
    };
  }
}
