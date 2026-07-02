#!/usr/bin/env node
/**
 * Phase 8-9 Orchestrator
 * Executes after Phase 7 completes:
 * 1. Cache SOM centroids to Redis (Phase 8)
 * 2. Enrich Qdrant payloads with som_cluster + topology (Phase 8)
 * 3. Populate BitFrost semantic cache (Phase 9)
 */

import pg from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5434'),
  user: process.env.DB_USER || 'legal_admin',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'legal_ai_db'
};

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
};

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

async function main() {
  console.log('\n🚀 Phase 8-9 Orchestrator: Cache + BitFrost Population\n');

  const pool = new pg.Pool(DB_CONFIG);
  const redis = new Redis(REDIS_CONFIG);

  try {
    await redis.connect();

    // ═══════════════════════════════════════════════════════════════
    // PHASE 8A: Load SOM Centroids + Cache to Redis
    // ═══════════════════════════════════════════════════════════════

    console.log('📦 Phase 8A: Cache SOM Centroids to Redis\n');

    const somReportPath = path.join(REPORTS_DIR, 'phase6-som-clustering.json');
    let somReport;
    try {
      const content = await fs.readFile(somReportPath, 'utf-8');
      somReport = JSON.parse(content);
      console.log(`  ✅ Loaded SOM report: ${somReport.clusters} clusters, ${somReport.centroids.length} centroids`);
    } catch (e) {
      console.error(`  ❌ SOM report not found: ${somReportPath}`);
      process.exit(1);
    }

    // Cache centroids
    let cached = 0;
    const TTL = 86400; // 24 hours
    for (let i = 0; i < somReport.centroids.length; i++) {
      const key = `centroid:cluster:${i}`;
      const value = JSON.stringify(somReport.centroids[i]);
      await redis.setex(key, TTL, value);
      cached++;

      if ((i + 1) % 100 === 0) {
        console.log(`  ✓ Cached ${i + 1}/${somReport.centroids.length} centroids`);
      }
    }
    console.log(`  ✅ Cached ${cached} centroids to Redis (TTL 24h)\n`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 8B: Enrich Qdrant with SOM Topology
    // ═══════════════════════════════════════════════════════════════

    console.log('🎯 Phase 8B: Enrich Qdrant with SOM Topology\n');

    // Fetch chunks with SOM metadata
    const result = await pool.query(`
      SELECT id, qdrant_id, som_cluster
      FROM codebase_chunk_index
      WHERE qdrant_id IS NOT NULL AND som_cluster IS NOT NULL
      ORDER BY id
      LIMIT 40574
    `);

    const chunks = result.rows;
    console.log(`  Chunks with SOM metadata: ${chunks.length}\n`);

    let updated = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const clusterId = chunk.som_cluster;
      const qdrantId = chunk.qdrant_id;

      const payload = {
        som_cluster: clusterId,
        som_bmu_row: Math.floor(clusterId / 20),
        som_bmu_col: clusterId % 20
      };

      try {
        const res = await fetch(
          `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/${qdrantId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              points: [
                {
                  id: qdrantId,
                  payload
                }
              ]
            })
          }
        );

        if (res.ok) {
          updated++;
        }
      } catch (err) {
        // Skip Qdrant errors
      }

      if ((i + 1) % 5000 === 0) {
        console.log(`  ✓ Updated ${i + 1}/${chunks.length} Qdrant points`);
      }
    }
    console.log(`  ✅ Updated ${updated} Qdrant points with SOM topology\n`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 9: BitFrost Semantic Cache Population
    // ═══════════════════════════════════════════════════════════════

    console.log('🔐 Phase 9: Populate BitFrost Semantic Cache\n');

    // Fetch packets with topology + retrieval metadata
    const packets = await pool.query(`
      SELECT
        id,
        relative_path as source_ref,
        qdrant_id,
        som_cluster,
        summary
      FROM codebase_chunk_index
      WHERE qdrant_id IS NOT NULL
      ORDER BY id
      LIMIT 40574
    `);

    console.log(`  Packets to cache: ${packets.rows.length}\n`);

    let bitfrost = 0;
    const TTL_BF = 86400; // 24 hours

    for (const pkt of packets.rows) {
      const packetKey = `ace:packet:${pkt.id}`;

      // Build BitFrost envelope
      const envelope = {
        packet_id: packetKey,
        packet_key: packetKey,
        source_ref: pkt.source_ref,
        qdrant_id: pkt.qdrant_id,
        som_cluster: pkt.som_cluster,
        som_bmu_row: Math.floor(pkt.som_cluster / 20),
        som_bmu_col: pkt.som_cluster % 20,
        summary: pkt.summary || null,
        cached_at: new Date().toISOString()
      };

      // Write to Redis
      const cacheKey = `bitfrost:packet:${packetKey}`;
      await redis.setex(cacheKey, TTL_BF, JSON.stringify(envelope));

      // Index by feature (if needed later)
      const featureKey = `bitfrost:feature:${pkt.som_cluster}:packets`;
      await redis.sadd(featureKey, packetKey);

      bitfrost++;

      if (bitfrost % 5000 === 0) {
        console.log(`  ✓ Cached ${bitfrost}/${packets.rows.length} packets to BitFrost`);
      }
    }

    console.log(`  ✅ Populated ${bitfrost} BitFrost packets\n`);

    // ═══════════════════════════════════════════════════════════════
    // Summary Report
    // ═══════════════════════════════════════════════════════════════

    console.log('📊 Phase 8-9 Summary\n');
    console.log(`  ✅ Phase 8A: ${cached} centroids cached to Redis`);
    console.log(`  ✅ Phase 8B: ${updated} Qdrant points enriched with SOM`);
    console.log(`  ✅ Phase 9: ${bitfrost} BitFrost packets populated\n`);

    // Verify Redis keys
    const redisKeys = await redis.keys('bitfrost:packet:*');
    console.log(`  🔍 Redis verification: ${redisKeys.length} bitfrost:packet:* keys\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main();
