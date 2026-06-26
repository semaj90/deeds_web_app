/**
 * ACE Materializer
 *
 * Syncs ACE packets from Postgres to Qdrant payloads.
 * Does NOT validate or synthesize. Thin adapter for persistence only.
 *
 * This is a pure write-side adapter that materializes ACEPacket metadata
 * into Qdrant vector payloads, ensuring density vector search results
 * include complete packet metadata for ACE context assembly.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { ACEPacket } from './ace-packet-types';

export interface MaterializationOptions {
  collection?: string;
  batchSize?: number;
  skipMissing?: boolean;
  verbose?: boolean;
}

/**
 * Materialize ACE packets from Postgres to Qdrant payloads.
 * Updates existing points' payloads with complete packet metadata.
 */
export async function materializeACEPacketsToQdrant(
  db: PostgresJsDatabase,
  qdrant: QdrantClient,
  packetKeys: string[],
  options: MaterializationOptions = {}
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const {
    collection = 'codebase_chunks_768',
    batchSize = 100,
    skipMissing = true,
    verbose = false
  } = options;

  const results = { updated: 0, skipped: 0, errors: [] as string[] };

  if (packetKeys.length === 0) return results;

  // Import at call time to avoid circular deps
  const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');
  const { eq, inArray } = await import('drizzle-orm');

  // Fetch packets from Postgres
  if (verbose) console.log(`Fetching ${packetKeys.length} packets from Postgres...`);

  const rows = await db
    .select()
    .from(atlasPackets)
    .where(inArray(atlasPackets.packet_key, packetKeys))
    .limit(packetKeys.length);

  // Build payload map
  const payloadMap = new Map<string, ACEPacket>();
  for (const row of rows) {
    const packet: ACEPacket = {
      packet_key: row.packet_key,
      feature_id: row.feature_id || '',
      source_ref: row.source_ref || '',
      summary: row.summary || '',
      evidence_text: row.payload?.evidence_text,
      metadata: {
        feature_label: row.feature_label,
        community_id: row.community_id,
        cluster_id: row.cluster_id,
        kmeans_cluster: row.kmeans_cluster,
        som_row: row.som_row,
        som_col: row.som_col,
        domain: row.domain_class,
        tags: row.tags,
        created_at: row.created_at?.toISOString()
      }
    };
    payloadMap.set(row.packet_key, packet);
  }

  // Process in batches
  if (verbose) console.log(`Materializing ${payloadMap.size} packets in batches of ${batchSize}...`);

  const batches: string[][] = [];
  let batch: string[] = [];

  for (const [packetKey] of payloadMap) {
    batch.push(packetKey);
    if (batch.length >= batchSize) {
      batches.push(batch);
      batch = [];
    }
  }
  if (batch.length > 0) batches.push(batch);

  // Upsert payloads to Qdrant
  for (const batchKeys of batches) {
    const points: Array<{ id: string; payload: Record<string, unknown> }> = [];

    for (const key of batchKeys) {
      const packet = payloadMap.get(key);
      if (!packet) {
        if (skipMissing) {
          results.skipped++;
        } else {
          results.errors.push(`Packet not found: ${key}`);
        }
        continue;
      }

      // Use packet_key as stable point ID (hash if needed)
      // In practice, Qdrant points are stored by numeric ID, we update payloads via search
      points.push({
        id: key,
        payload: {
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          summary: packet.summary,
          evidence_text: packet.evidence_text,
          metadata: packet.metadata
        }
      });
    }

    if (points.length === 0) continue;

    try {
      // Qdrant payload update via search filter + set_payload
      // For bulk upsert, we'd need the numeric point IDs from Qdrant
      // This is a simplified approach: search by packet_key, update payload
      for (const point of points) {
        // Search for points with this packet_key in payload
        const searchResult = await qdrant.search(collection, {
          query_vector: new Array(768).fill(0), // Dummy vector; filtering by payload
          filter: {
            must: [
              {
                has_id: {
                  has_id: [point.id as never] // Type: use numeric ID if available
                }
              }
            ]
          },
          limit: 1,
          with_payload: false
        });

        if (searchResult.result.length > 0) {
          // Update payload
          const pointId = searchResult.result[0].id;
          await qdrant.setPayload(collection, {
            payload: point.payload,
            points_selector: {
              points: [pointId as never]
            }
          });
          results.updated++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`Batch upsert failed: ${msg}`);
    }
  }

  if (verbose) {
    console.log(`✓ Materialization complete: ${results.updated} updated, ${results.skipped} skipped`);
    if (results.errors.length > 0) {
      console.log(`⚠ Errors: ${results.errors.length}`);
      results.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
    }
  }

  return results;
}

/**
 * Materialize all packets in atlas_packets (full sync).
 */
export async function materializeAllACEPacketsToQdrant(
  db: PostgresJsDatabase,
  qdrant: QdrantClient,
  options: MaterializationOptions = {}
): Promise<{ total: number; results: { updated: number; skipped: number; errors: string[] } }> {
  const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');

  // Count total packets
  const countResult = await db
    .select({ count: atlasPackets.packet_key })
    .from(atlasPackets);

  const total = countResult.length;

  if (total === 0) {
    return { total: 0, results: { updated: 0, skipped: 0, errors: [] } };
  }

  // Fetch all packet keys
  const packets = await db.select({ packet_key: atlasPackets.packet_key }).from(atlasPackets);
  const packetKeys = packets.map(p => p.packet_key);

  // Materialize
  const results = await materializeACEPacketsToQdrant(db, qdrant, packetKeys, options);

  return { total, results };
}

/**
 * Verify materialization: check Qdrant payloads against Postgres packets.
 */
export async function verifyACEMaterialization(
  db: PostgresJsDatabase,
  qdrant: QdrantClient,
  sampleSize: number = 100,
  options: MaterializationOptions = {}
): Promise<{
  totalChecked: number;
  matched: number;
  mismatched: number;
  missing: number;
  errors: string[];
}> {
  const { collection = 'codebase_chunks_768', verbose = false } = options;

  const results = {
    totalChecked: 0,
    matched: 0,
    mismatched: 0,
    missing: 0,
    errors: [] as string[]
  };

  try {
    // Fetch sample from Postgres
    const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');
    const packets = await db.select().from(atlasPackets).limit(sampleSize);

    if (verbose) console.log(`Verifying ${packets.length} packets...`);

    for (const packet of packets) {
      results.totalChecked++;

      try {
        // Search Qdrant for this packet_key
        const searchResult = await qdrant.search(collection, {
          query_vector: new Array(768).fill(0), // Dummy
          filter: {
            must: [
              {
                key: 'packet_key',
                match: { value: packet.packet_key }
              }
            ]
          },
          limit: 1,
          with_payload: true
        });

        if (searchResult.result.length === 0) {
          results.missing++;
          if (verbose) console.log(`  ✗ Missing: ${packet.packet_key}`);
        } else {
          const point = searchResult.result[0];
          const payload = point.payload as Record<string, unknown> | undefined;

          // Check key fields
          if (
            payload?.packet_key === packet.packet_key &&
            payload?.feature_id === packet.feature_id &&
            payload?.source_ref === packet.source_ref
          ) {
            results.matched++;
            if (verbose) console.log(`  ✓ Match: ${packet.packet_key}`);
          } else {
            results.mismatched++;
            if (verbose) console.log(`  ⚠ Mismatch: ${packet.packet_key}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Verification failed for ${packet.packet_key}: ${msg}`);
      }
    }

    if (verbose) {
      console.log(`✓ Verification complete: ${results.matched} matched, ${results.mismatched} mismatched, ${results.missing} missing`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`Verification error: ${msg}`);
  }

  return results;
}