import { db } from '../src/lib/server/db/client.js';
import { embeddedSummaries } from '../src/lib/server/db/schema/embedded-summaries.js';
import { tensorAnalysisCache } from '../src/lib/server/db/schema/topology.js';
import { eq, isNull, and, or, sql } from 'drizzle-orm';
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
    .where(
      or(
        isNull(embeddedSummaries.gpuCluster),
        eq(embeddedSummaries.topoByte, 0),
        eq(embeddedSummaries.topoClass, 'unclassified')
      )
    );
    
  console.log(`📊 Found ${missing.length} records to backfill.`);
  
  const redis = getRedis();
  let updated = 0;
  
  for (const row of missing) {
    try {
      // 1. Map file:path to qdrant:id via deterministicPointId
      // Modern system uses chunkId (long hash) directly as stableKey.
      // Legacy system used qdrant:deterministicPointId(chunkId).
      const qdrantId = deterministicPointId(row.chunkId);
      const legacyKey = `qdrant:${qdrantId}`;
      const modernKey = row.chunkId;

      let [topology] = await db.select()
        .from(tensorAnalysisCache)
        .where(
          or(
            eq(tensorAnalysisCache.stableKey, modernKey),
            eq(tensorAnalysisCache.stableKey, legacyKey)
          )
        )
        .limit(1);
        
      // 2. Fallback: If no direct ID match, try matching by file path in output_meta
      if (!topology && row.chunkId.startsWith('file:')) {
        const filePath = row.chunkId.replace('file:', '');
        [topology] = await db.select()
          .from(tensorAnalysisCache)
          .where(sql`${tensorAnalysisCache.outputMeta}->>'filePath' = ${filePath}`)
          .limit(1);
          
        if (topology) {
          console.log(`📡 [Fallback] Found topology via filePath for ${row.chunkId} (Key: ${topology.stableKey})`);
        }
      }
        
      if (topology) {
        console.log(`✅ Found topology for ${row.chunkId} (Modern/Legacy: ${topology.stableKey})`);
        await db.update(embeddedSummaries)
          .set({
            gpuCluster: topology.somCluster,
            topoByte: topology.topoByte,
            topoClass: topology.topoClass,
            manifold4: [topology.manifold4X, topology.manifold4Y, topology.manifold4Z, topology.manifold4W]
          })
          .where(eq(embeddedSummaries.id, row.id));
        updated++;
      } else {
        console.warn(`⚠️  No spine entry for ${row.chunkId} (Keys: ${modernKey} / ${legacyKey})`);
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
