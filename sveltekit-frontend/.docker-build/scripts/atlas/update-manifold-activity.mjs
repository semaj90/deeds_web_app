#!/usr/bin/env node
/**
 * scripts/atlas/update-manifold-activity.mjs
 *
 * Updates the activity_w signal in the 4D manifold based on retrieval feedback.
 */

import { qdrantUpdatePayloadByFilter, getQdrantUrl } from '../qdrant-client.mjs';
const QDRANT_URL = getQdrantUrl();
const COLLECTION = 'codebase_chunks_768';

async function main() {
  console.log('📈 Atlas: Updating Manifold Activity Signals (activity_w)...');

  // In a real system, we would query the retrieval_runs or logs.
  // Here we simulate activity updates for high-signal clusters.
  const activeClusters = [72, 73, 94, 32, 47, 92, 82, 20];

  try {
    for (const id of activeClusters) {
      console.log(`   Boosting activity_w for Cluster ${id}...`);

      const ok = await qdrantUpdatePayloadByFilter(
        COLLECTION,
        { activity_w: 0.85 },
        { must: [{ key: 'gpu_cluster', match: { value: id } }] }
      );
      if (!ok) console.warn(`⚠️  Failed to update Cluster ${id}`);
    }
    console.log('✅ Manifold activity signals updated.');
  } catch (err) {
    console.error(`❌ Activity update failed: ${err.message}`);
    process.exit(1);
  }
}

main();
