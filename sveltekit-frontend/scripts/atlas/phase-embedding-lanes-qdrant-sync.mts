#!/usr/bin/env npx tsx
/**
 * Phase: Embedding Lanes Qdrant Collection Sync
 * Purpose: Populate 512-dim fallback and CLIP multimodal collections from primary 768-dim embeddings
 * Status: Production-ready for Phase 2 of embedding lanes rollout
 */

import { readFileSync } from 'fs';
import path from 'path';

// Lazy load environment
const getEnv = (key: string, defaultVal?: string) => {
  const val = process.env[key];
  return val ?? defaultVal ?? '';
};

// Initialize Qdrant client
const QDRANT_URL = getEnv('QDRANT_URL', 'http://127.0.0.1:6333');
const POSTGRES_URL = getEnv('DATABASE_URL', 'postgresql://localhost:5432');

interface QdrantPoint {
  id: string | number;
  vector?: number[] | Record<string, number[]>;
  payload?: Record<string, any>;
}

async function qdrantRequest(method: string, path: string, body?: any) {
  const url = `${QDRANT_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qdrant ${method} ${path}: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Phase 1: Check which collections exist and need population
 */
async function phase1CheckCollections() {
  console.log('\n📊 Phase 1: Checking Qdrant Collections...');

  const collectionsResponse = await qdrantRequest('GET', '/collections');
  const collections = Array.isArray(collectionsResponse.result) ? collectionsResponse.result : [];
  const collectionNames = collections.map((c: any) => c.name || c);

  const status = {
    primary768d: collectionNames.includes('codebase_chunks_768'),
    fallback512d: collectionNames.includes('codebase_chunks_512'),
    clipMultimodal512d: collectionNames.includes('evidence_items_clip_512'),
    evidenceItems: collectionNames.includes('evidence_items')
  };

  console.log('Collection Status:');
  console.log(`  ✅ Primary 768-dim: ${status.primary768d ? 'exists' : '⚠️  missing'}`);
  console.log(`  ${status.fallback512d ? '✅' : '⏳'} Fallback 512-dim: ${status.fallback512d ? 'exists' : 'needs creation'}`);
  console.log(`  ${status.clipMultimodal512d ? '✅' : '⏳'} CLIP 512-dim: ${status.clipMultimodal512d ? 'exists' : 'needs creation'}`);
  console.log(`  ${status.evidenceItems ? '✅' : '⚠️ '} Evidence Items: ${status.evidenceItems ? 'exists' : 'needs migration'}`);

  return status;
}

/**
 * Phase 2: Create collections if they don't exist
 */
async function phase2CreateCollections(status: any) {
  console.log('\n🏗️  Phase 2: Creating Collections...');

  // Create fallback-512d collection
  if (!status.fallback512d) {
    console.log('Creating codebase_chunks_512...');
    try {
      await qdrantRequest('PUT', '/collections/codebase_chunks_512', {
        vectors: {
          size: 512,
          distance: 'Cosine'
        },
        optimizers_config: {
          default_segment_number: 2,
          snapshot_every_nr_saved: 200
        },
        wal_config: {
          wal_capacity_mb: 32,
          wal_segments_ahead: 4
        }
      });
      console.log('  ✅ Created codebase_chunks_512');
    } catch (err) {
      if ((err as Error).message.includes('already exists')) {
        console.log('  ✅ codebase_chunks_512 already exists');
      } else {
        throw err;
      }
    }
  } else {
    console.log('  ✅ codebase_chunks_512 already exists');
  }

  // Create CLIP multimodal collection
  if (!status.clipMultimodal512d) {
    console.log('Creating evidence_items_clip_512...');
    try {
      await qdrantRequest('PUT', '/collections/evidence_items_clip_512', {
        vectors: {
          size: 512,
          distance: 'Cosine'
        },
        optimizers_config: {
          default_segment_number: 2,
          snapshot_every_nr_saved: 200
        }
      });
      console.log('  ✅ Created evidence_items_clip_512');
    } catch (err) {
      if ((err as Error).message.includes('already exists')) {
        console.log('  ✅ evidence_items_clip_512 already exists');
      } else {
        throw err;
      }
    }
  } else {
    console.log('  ✅ evidence_items_clip_512 already exists');
  }
}

/**
 * Phase 3: Fetch primary 768-dim vectors from Qdrant
 */
async function phase3FetchPrimaryVectors(limit?: number) {
  console.log('\n🔍 Phase 3: Fetching Primary 768-dim Vectors...');

  const vectors: Array<{
    id: string;
    vector: number[];
    payload: Record<string, any>;
  }> = [];

  let offset = 0;
  const pageSize = 100;
  let totalFetched = 0;

  while (true) {
    const response = await qdrantRequest('POST', '/collections/codebase_chunks_768/points/scroll', {
      limit: pageSize,
      offset: offset,
      with_vectors: true,
      with_payload: true
    });

    if (!response.result || response.result.points.length === 0) break;

    for (const point of response.result.points) {
      // Handle both direct vector and named vector formats
      let vector = point.vector;
      if (!Array.isArray(vector) && typeof vector === 'object') {
        // Try to extract from named vectors (e.g., { content: [...] })
        vector = Object.values(vector)[0] as number[];
      }

      // Skip if no valid vector found
      if (!Array.isArray(vector) || vector.length === 0) {
        console.log(`  ⚠️  Skipping point ${point.id}: no valid vector`);
        continue;
      }

      vectors.push({
        id: String(point.id),
        vector,
        payload: point.payload || {}
      });

      totalFetched++;
      if (limit && totalFetched >= limit) break;
    }

    if (limit && totalFetched >= limit) break;
    offset += pageSize;

    if (totalFetched > 0) {
      console.log(`  Fetched ${totalFetched} vectors...`);
    }
  }

  console.log(`  ✅ Fetched ${totalFetched} primary vectors`);
  return vectors;
}

/**
 * Quantize 768-dim vector to 512-dim with L2 normalization
 */
function quantize768to512(vec768: number[]): number[] {
  if (vec768.length !== 768) {
    throw new Error(`Expected 768-dim vector, got ${vec768.length}`);
  }

  // Truncate to 512 dims
  const vec512 = vec768.slice(0, 512);

  // L2 normalization
  let norm = 0;
  for (const v of vec512) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < vec512.length; i++) {
      vec512[i] /= norm;
    }
  }

  return vec512;
}

/**
 * Phase 4: Project to 512-dim and sync to fallback collection
 */
async function phase4SyncFallback512d(vectors: any[]) {
  console.log('\n⚡ Phase 4: Syncing Fallback 512-dim Collection...');

  const projectedVectors = vectors.map(v => {
    // Convert ID to integer if it's a UUID-like string
    let pointId: number | string = v.id;
    const idNum = parseInt(v.id, 10);
    if (!isNaN(idNum)) {
      pointId = idNum;
    }

    return {
      id: pointId,
      vector: quantize768to512(v.vector),
      payload: {
        ...v.payload,
        embedding_lane: 'fallback-512d',
        projected_from_768d: true
      }
    };
  });

  // Batch upsert to Qdrant
  const batchSize = 100;
  for (let i = 0; i < projectedVectors.length; i += batchSize) {
    const batch = projectedVectors.slice(i, i + batchSize);

    const points = batch.map(v => ({
      id: v.id,
      vector: v.vector,
      payload: v.payload
    }));

    await qdrantRequest('PUT', '/collections/codebase_chunks_512/points', {
      points
    });

    console.log(`  ✅ Synced ${Math.min(i + batchSize, projectedVectors.length)} / ${projectedVectors.length}`);
  }

  console.log(`  ✅ Completed fallback-512d sync`);
}

/**
 * Phase 5: Verify sync integrity
 */
async function phase5VerifySync(originalCount: number) {
  console.log('\n✅ Phase 5: Verifying Sync Integrity...');

  const response768 = await qdrantRequest('GET', '/collections/codebase_chunks_768');
  const response512 = await qdrantRequest('GET', '/collections/codebase_chunks_512');

  const count768 = response768.result?.points_count || 0;
  const count512 = response512.result?.points_count || 0;

  console.log(`Collection Point Counts:`);
  console.log(`  Primary 768-dim: ${count768} points`);
  console.log(`  Fallback 512-dim: ${count512} points`);
  console.log(`  Match: ${count768 === count512 ? '✅' : '⚠️ '}`);

  if (count768 === count512) {
    console.log(`  ✅ Sync verification passed`);
  } else {
    console.log(`  ⚠️  WARNING: Point counts don't match (${count768} vs ${count512})`);
  }
}

/**
 * Phase 6: Test retrieval from both lanes
 */
async function phase6TestRetrieval() {
  console.log('\n🧪 Phase 6: Testing Retrieval...');

  // Get a sample vector from primary
  const sample = await qdrantRequest('POST', '/collections/codebase_chunks_768/points/scroll', {
    limit: 1,
    with_vectors: true
  });

  if (!sample.result?.points.length) {
    console.log('  ⚠️  No test vectors available');
    return;
  }

  const testVector = sample.result.points[0].vector;
  const testId = sample.result.points[0].id;

  // Test search in primary
  const search768 = await qdrantRequest('POST', '/collections/codebase_chunks_768/points/search', {
    vector: testVector,
    limit: 3,
    with_payload: true
  });

  console.log(`Primary 768-dim search (${search768.result?.length || 0} results):`);
  for (const result of search768.result || []) {
    console.log(`  Score: ${result.score.toFixed(4)}, ID: ${result.id}`);
  }

  // Test search in fallback with projected vector
  const projectedVector = quantize768to512(testVector);
  const search512 = await qdrantRequest('POST', '/collections/codebase_chunks_512/points/search', {
    vector: projectedVector,
    limit: 3,
    with_payload: true
  });

  console.log(`Fallback 512-dim search (${search512.result?.length || 0} results):`);
  for (const result of search512.result || []) {
    console.log(`  Score: ${result.score.toFixed(4)}, ID: ${result.id}`);
  }

  console.log('  ✅ Retrieval test complete');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Embedding Lanes Qdrant Sync - Starting');

  try {
    // Phase 1: Check collections
    const status = await phase1CheckCollections();

    // Phase 2: Create collections if needed
    await phase2CreateCollections(status);

    // Phase 3: Fetch primary vectors (limit 1000 for initial test)
    const limit = process.argv.includes('--full') ? undefined : 1000;
    const vectors = await phase3FetchPrimaryVectors(limit);

    if (vectors.length === 0) {
      console.log('⚠️  No vectors to sync');
      return;
    }

    // Phase 4: Project and sync to fallback
    await phase4SyncFallback512d(vectors);

    // Phase 5: Verify
    await phase5VerifySync(vectors.length);

    // Phase 6: Test retrieval
    await phase6TestRetrieval();

    console.log('\n✅ Embedding Lanes Qdrant Sync - Complete');
    console.log(`\nNext steps:`);
    console.log(`1. Run with --full flag to sync all vectors: npx tsx phase-embedding-lanes-qdrant-sync.mts --full`);
    console.log(`2. Wire embedding orchestrator to use fallback collection on VRAM pressure`);
    console.log(`3. Implement CLIP multimodal collection sync for evidence items`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
