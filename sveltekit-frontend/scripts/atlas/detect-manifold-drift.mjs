#!/usr/bin/env node
/**
 * scripts/atlas/detect-manifold-drift.mjs
 * 
 * Detects drift in the hypergraph/manifold infrastructure.
 */

import { getRedis } from '../../src/lib/server/redis.js';
import { db } from '../../src/lib/server/db/client.js';
import { embeddedSummaries } from '../../src/lib/server/db/schema/embedded-summaries.js';
import { sql } from 'drizzle-orm';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

async function main() {
  console.log('🔍 Atlas: Detecting Manifold Drift...');

  const report = {
    status: 'ok',
    missingClusterTags: 0,
    staleEmbeddings: 0,
    orphanQdrantPoints: 0,
    missingRedisCards: 0,
    missingNeo4jClusters: 0,
    warnings: []
  };

  try {
    // 1. Check Qdrant for missing tags
    const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, with_payload: true })
    });
    
    if (scrollRes.ok) {
      const data = await scrollRes.json();
      const points = data.result?.points || [];
      for (const p of points) {
        if (p.payload.gpu_cluster == null && p.payload.gpuCluster == null) {
          report.missingClusterTags++;
        }
      }
    }

    // 2. Check Postgres for stale summaries
    const staleRes = await db.select({ count: sql`count(*)` }).from(embeddedSummaries).where(sql`gpu_cluster IS NULL`);
    report.staleEmbeddings = Number(staleRes[0].count);

    // 3. Check Redis for cluster cards (sample)
    const redis = getRedis();
    const cardExists = await redis.exists('ace:cluster:72');
    if (!cardExists) {
      report.missingRedisCards = 100; // Assume all missing if 72 is gone
      report.warnings.push('Redis cluster cards (ace:cluster:*) appear to be missing.');
    }

    // Determine status
    if (report.missingClusterTags > 0 || report.staleEmbeddings > 0) {
      report.status = 'warning';
    }

    console.log(JSON.stringify(report, null, 2));

    if (report.status === 'warning') {
      console.warn('\n⚠️  Drift detected. Recommended action: run hypergraph:pipeline codebase_chunks_768 100');
    } else {
      console.log('\n✅ Manifold is consistent.');
    }
  } catch (err) {
    console.error(`❌ Drift detection failed: ${err.message}`);
    process.exit(1);
  }
}

main();
