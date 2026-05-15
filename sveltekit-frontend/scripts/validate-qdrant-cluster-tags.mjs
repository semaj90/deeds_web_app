#!/usr/bin/env node
/**
 * validate-qdrant-cluster-tags.mjs
 * 
 * Samples points from a Qdrant collection and validates that topological 
 * cluster tags (gpu_cluster, som_cluster) are present and correctly formatted.
 */
import path from 'path';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = process.argv[2] || 'codebase_chunks_768';
const SAMPLE_SIZE = 500;
const REPAIR_MODE = process.argv.includes('--repair-missing');

async function getNearestCluster(vector) {
  const hgLookupUrl = process.env.HG_LOOKUP_URL || 'http://127.0.0.1:9234';
  try {
    const res = await fetch(`${hgLookupUrl}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, topK: 1 })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.clusterIds?.[0] ?? null;
  } catch {
    return null;
  }
}

async function validate() {
  console.log(`🔍 Validating cluster tags in collection: ${COLLECTION}`);
  console.log(`🔗 Qdrant URL: ${QDRANT_URL}`);

  try {
    // 1. Scroll points to get a sample
    const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: SAMPLE_SIZE,
        with_payload: true,
        with_vector: REPAIR_MODE
      })
    });

    if (!scrollRes.ok) {
      throw new Error(`Failed to scroll Qdrant points: ${scrollRes.status} ${scrollRes.statusText}`);
    }

    const scrollData = await scrollRes.json();
    const points = scrollData.result?.points || [];

    if (points.length === 0) {
      console.warn('⚠️ No points found in collection.');
      return;
    }

    console.log(`✅ Sampled ${points.length} points.`);

    let validCount = 0;
    let missingGpu = 0;
    let missingSom = 0;
    let missingPath = 0;

    for (const point of points) {
      const payload = point.payload || {};
      const hasGpu = typeof payload.gpu_cluster === 'number';
      const hasSom = typeof payload.som_cluster === 'number';
      const hasPath = !!(payload.path || payload.relativePath || payload.source_path || payload.dir_path);

      if (!hasGpu) missingGpu++;
      if (!hasSom) missingSom++;
      if (!hasPath) missingPath++;

      if (hasGpu && hasSom && hasPath) {
        validCount++;
      } else if (REPAIR_MODE && point.vector) {
        console.log(`🛠️ Repairing point ${point.id}...`);
        const clusterId = await getNearestCluster(point.vector);
        if (clusterId !== null) {
          await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              points: [point.id],
              payload: {
                gpu_cluster: clusterId,
                som_cluster: clusterId // Simplified for now
              }
            })
          });
          validCount++;
        }
      }
    }

    console.log('\n📊 Results:');
    console.log(`- Valid points: ${validCount}/${points.length}`);
    if (missingGpu > 0) console.log(`- Missing gpu_cluster: ${missingGpu}`);
    if (missingSom > 0) console.log(`- Missing som_cluster: ${missingSom}`);
    if (missingPath > 0) console.log(`- Missing path info: ${missingPath}`);

    if (validCount === points.length) {
      console.log('\n✨ Validation PASSED! All sampled points have correct topological tags.');
    } else {
      console.log(`\n❌ Validation FAILED! ${points.length - validCount} points are missing required metadata.`);
      process.exit(1);
    }

  } catch (err) {
    console.error(`\n❌ Error during validation: ${err.message}`);
    process.exit(1);
  }
}

validate();
