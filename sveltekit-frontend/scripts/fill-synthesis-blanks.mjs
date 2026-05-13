import { db } from '../src/lib/server/db/client';
import { embeddedSummaries } from '../src/lib/server/db/schema/embedded-summaries';
import { tensorAnalysisCache } from '../src/lib/server/db/schema/topology';
import { eq, isNull, and } from 'drizzle-orm';
import { encode768to64 } from '../src/lib/server/gpu/encode-768-to-64';
import { deterministicPointId } from '../src/lib/server/vector/qdrant-manager.js';
import { getRedis } from '../src/lib/server/redis.js';

/**
 * scripts/fill-synthesis-blanks.mjs
 * 
 * Fills in gpu_cluster and manifold4 fields in embedded_summaries
 * by pulling from the tensor_analysis_cache Identity Spine.
 */
async function main() {
  console.log('🔍 [Backfill] Scanning for summaries missing topological data...');
  
  const missing = await db.select()
    .from(embeddedSummaries)
    .where(isNull(embeddedSummaries.gpuCluster));
    
  console.log(`📊 Found ${missing.length} records to backfill.`);
  
  const redis = getRedis();
  let updated = 0;
  
  for (const row of missing) {
    try {
      // 1. Map file:path to qdrant:id via deterministicPointId
      // qdrant-manager.ts uses MD5 hash -> first 4 bytes -> int % 2^31
      const qdrantId = deterministicPointId(row.chunkId);
      const stableKey = `qdrant:${qdrantId}`;

      const [topology] = await db.select()
        .from(tensorAnalysisCache)
        .where(eq(tensorAnalysisCache.stableKey, stableKey))
        .limit(1);
        
      if (topology) {
        console.log(`✅ Found topology for ${row.chunkId} (Key: ${stableKey})`);
        await db.update(embeddedSummaries)
          .set({
            gpuCluster: topology.somCluster,
            manifold4: [topology.manifold4X, topology.manifold4Y, topology.manifold4Z, topology.manifold4W]
          })
          .where(eq(embeddedSummaries.id, row.id));
        updated++;
      } else {
        console.warn(`⚠️  No spine entry for ${row.chunkId} (Key: ${stableKey})`);
      }
      
    } catch (err) {
      console.error(`❌ Failed to backfill ${row.chunkId}:`, err.message);
    }
  }
  
  console.log(`\n🎉 Backfill complete. Updated ${updated} records.`);
  process.exit(0);
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
