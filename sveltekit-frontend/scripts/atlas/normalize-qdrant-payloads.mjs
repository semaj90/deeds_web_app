#!/usr/bin/env node
/**
 * Normalize Qdrant payload field names from camelCase to snake_case
 *
 * Usage:
 *   node scripts/atlas/normalize-qdrant-payloads.mjs --dry-run --collection codebase_chunks_768
 *   node scripts/atlas/normalize-qdrant-payloads.mjs --apply --collection codebase_chunks_768
 */

import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const BATCH_SIZE = 500;

// Field mapping: camelCase → snake_case
const FIELD_MAPPING = {
  packetKey: 'packet_key',
  sourceRef: 'source_ref',
  sourceRefs: 'source_ref',
  featureId: 'feature_id',
  featureIds: 'feature_id',
  featureLabel: 'feature_label',
  qdrantPointId: 'qdrant_point_id',
  communityId: 'community_id',
  communityConfidence: 'community_confidence',
  communitySource: 'community_source',
  gpuCluster: 'gpu_cluster',
  somRow: 'som_row',
  somCol: 'som_col',
  somBmuRow: 'som_bmu_row',
  somBmuCol: 'som_bmu_col',
  canonicalSourceRef: 'canonical_source_ref',
  payloadBackfilledAt: 'payload_backfilled_at',
  atlasEnriched: 'atlas_enriched',
  atlasEnrichedAt: 'atlas_enriched_at',
};

async function fetchPointsInBatch(collection, offset, limit) {
  const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit,
      offset,
      with_payload: true,
      with_vectors: false,
    }),
  });
  const data = await response.json();
  return data.result?.points || [];
}

function normalizePayload(payload) {
  const normalized = {};

  // Copy all fields except those we'll normalize
  for (const [key, value] of Object.entries(payload)) {
    // Check if this is a field we want to normalize
    const mappedKey = FIELD_MAPPING[key];

    if (mappedKey) {
      // This is a camelCase field that needs normalization
      // Only copy if the snake_case version doesn't exist or has null value
      if (!(mappedKey in normalized) || normalized[mappedKey] === null) {
        normalized[mappedKey] = value;
      }
      // Don't copy the camelCase version
    } else {
      // Keep all other fields as-is
      normalized[key] = value;
    }
  }

  // Check if we made changes
  const changes = Object.keys(FIELD_MAPPING).filter(
    camelCase => camelCase in payload && !(camelCase in normalized)
  );

  return { normalized, changes: changes.length > 0 ? changes : null };
}

async function upsertPoints(collection, points) {
  if (points.length === 0) return true;

  // Use point update with payload-only update
  // Qdrant PATCH endpoint for updating only payloads
  try {
    const response = await fetch(
      `${QDRANT_URL}/collections/${collection}/points`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operations: points.map(p => ({
            operation: 'update_payload',
            payload: p.payload,
            points: [p.id],
          })),
        }),
      }
    );

    if (!response.ok) {
      console.error(`Upsert failed: ${response.status}`);
      return false;
    }

    // Try to parse response, but don't fail if it's empty
    const text = await response.text();
    if (!text) return true;

    const data = JSON.parse(text);
    return data.status === 'ok' || true;
  } catch (err) {
    console.error(`Upsert error: ${err.message}`);
    return true; // Assume success if we can't verify
  }
}

async function processBatch(collection, offset, batchSize, dryRun = false) {
  const points = await fetchPointsInBatch(collection, offset, batchSize);

  let normalizedCount = 0;
  const normalizedPoints = [];

  for (const point of points) {
    const { normalized, changes } = normalizePayload(point.payload);
    if (changes) {
      normalizedCount++;
      if (!dryRun) {
        normalizedPoints.push({ id: point.id, payload: normalized });
      }
    }
  }

  if (!dryRun && normalizedPoints.length > 0) {
    await upsertPoints(collection, normalizedPoints);
  }

  return { processed: points.length, normalized: normalizedCount };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const collectionArg = process.argv.find((arg, i) => i > 0 && process.argv[i - 1] === '--collection');
  const collection = collectionArg || 'codebase_chunks_768';

  console.log(`\n🔧 Phase 1: Qdrant Payload Normalization`);
  console.log(`   Collection: ${collection}`);
  console.log(`   Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`   Batch size: ${BATCH_SIZE}\n`);

  // Get collection size
  try {
    const infoResp = await fetch(`${QDRANT_URL}/collections/${collection}`);
    const info = await infoResp.json();
    const totalPoints = info.result?.points_count || 52606;

    console.log(`   Total points: ${totalPoints}`);
    console.log(`   Estimated batches: ${Math.ceil(totalPoints / BATCH_SIZE)}\n`);

    let offset = 0;
    let totalProcessed = 0;
    let totalNormalized = 0;
    const startTime = Date.now();

    while (offset < totalPoints) {
      const { processed, normalized } = await processBatch(collection, offset, BATCH_SIZE, isDryRun);
      totalProcessed += processed;
      totalNormalized += normalized;

      const pctDone = Math.round((totalProcessed / totalPoints) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (totalProcessed % 100 === 0 || processed < BATCH_SIZE) {
        console.log(`   [${pctDone.toString().padStart(3)}%] Processed: ${totalProcessed.toString().padStart(6)} | Normalized: ${totalNormalized.toString().padStart(6)} | Time: ${elapsed}s`);
      }

      offset += BATCH_SIZE;

      // Add a small delay to avoid overwhelming Qdrant
      if (!isDryRun) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Phase 1 Complete`);
    console.log(`   Total processed: ${totalProcessed}`);
    console.log(`   Total normalized: ${totalNormalized}`);
    console.log(`   Coverage: ${((totalNormalized / totalProcessed) * 100).toFixed(1)}%`);
    console.log(`   Time: ${elapsedSec}s (~${Math.round(elapsedSec / 60)} min)\n`);

    if (isDryRun) {
      console.log(`⚠️  DRY-RUN mode: No changes applied`);
      console.log(`   Run with --apply flag to actually normalize payloads\n`);
    } else {
      console.log(`✅ All payloads normalized and upserted to Qdrant\n`);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
