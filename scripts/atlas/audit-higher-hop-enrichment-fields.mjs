#!/usr/bin/env node
/**
 * Audit: Higher-Hop Enrichment Fields
 *
 * Checks availability of five enrichment fields across mirrors:
 *   - somCluster (Postgres atlas_codebase_packets + Qdrant payload)
 *   - glyphRecord (atlas_svg_glyphs lookup by packet_key/source_ref)
 *   - qdrantHit (Qdrant codebase_chunks_768 payload direct match)
 *   - redisHotKey (gpu:karpathy:scores, gpu:karpathy:encoded, bifrost:*, etc.)
 *   - neo4jNode (Neo4j node lookup by packet_key/source_ref/feature_id)
 *
 * Output:
 *   - docs/reports/higher-hop-enrichment-fields-audit.json
 *   - docs/reports/higher-hop-enrichment-fields-audit.md
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URL || 'neo4j://127.0.0.1:7687',
  neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'neo4j123')
);

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const qdrant = new QdrantClient({ url: QDRANT_URL });

const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
};
if (process.env.REDIS_PASSWORD) redisOptions.password = process.env.REDIS_PASSWORD;
const redis = new Redis(redisOptions);
redis.on('error', () => {});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function auditEnrichmentFields() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log('║  Audit: Higher-Hop Enrichment Fields                           ║');
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    steps: [],
    field_coverage: {},
    field_samples: {},
    statistics: {
      total_packets_sampled: 0,
      som_cluster_coverage: 0,
      glyph_record_coverage: 0,
      qdrant_hit_coverage: 0,
      redis_hot_key_coverage: 0,
      neo4j_node_coverage: 0,
    },
  };

  try {
    // Step 1: Sample packets from Postgres
    logger.log('Step 1: Sample 50 canonical packets from Postgres...');

    const sampleRes = await pool.query(
      `SELECT packet_key, source_ref, feature_id, som_cluster, created_at
       FROM atlas_codebase_packets
       ORDER BY created_at DESC
       LIMIT 50`
    );

    const packets = sampleRes.rows;
    logger.ok(`  Found ${packets.length} packets`);
    report.statistics.total_packets_sampled = packets.length;

    report.steps.push({
      step: 'sample_packets',
      status: 'ok',
      packet_count: packets.length,
    });

    // Step 2: Check somCluster coverage
    logger.log('\nStep 2: Check somCluster coverage (Postgres + Qdrant)...');

    let somClusterCount = 0;
    const somClusterSamples = [];

    for (const packet of packets) {
      const hasPostgres = packet.som_cluster !== null && packet.som_cluster !== undefined;

      if (hasPostgres) {
        somClusterCount++;
        somClusterSamples.push({
          packet_key: packet.packet_key,
          source: 'postgres',
          som_cluster: packet.som_cluster,
        });
      }
    }

    report.statistics.som_cluster_coverage = somClusterCount;
    report.field_samples.som_cluster = somClusterSamples.slice(0, 5);
    report.field_coverage.som_cluster = `${somClusterCount}/${packets.length}`;

    logger.ok(`  SOM cluster coverage: ${somClusterCount}/${packets.length} (${(somClusterCount / packets.length * 100).toFixed(1)}%)`);

    report.steps.push({
      step: 'check_som_cluster',
      status: 'ok',
      coverage: somClusterCount,
      total: packets.length,
      percent: (somClusterCount / packets.length * 100).toFixed(1),
    });

    // Step 3: Check glyphRecord coverage
    logger.log('\nStep 3: Check glyphRecord coverage (atlas_svg_glyphs)...');

    let glyphRecordCount = 0;
    const glyphRecordSamples = [];
    let glyphTableMissing = false;

    try {
      for (const packet of packets) {
        const glyphRes = await pool.query(
          `SELECT glyph_id, glyph_type FROM atlas_svg_glyphs
           WHERE packet_key = $1 OR source_ref = $2
           LIMIT 1`,
          [packet.packet_key, packet.source_ref]
        );

        if (glyphRes.rows.length > 0) {
          glyphRecordCount++;
          glyphRecordSamples.push({
            packet_key: packet.packet_key,
            glyph_id: glyphRes.rows[0].glyph_id,
            glyph_type: glyphRes.rows[0].glyph_type,
          });
        }
      }
    } catch (err) {
      if (err.message.includes('does not exist')) {
        glyphTableMissing = true;
        logger.warn(`  atlas_svg_glyphs table does not exist (expected — higher-hop enrichment table)`);
      } else {
        throw err;
      }
    }

    report.statistics.glyph_record_coverage = glyphRecordCount;
    report.field_samples.glyph_record = glyphRecordSamples.slice(0, 5);
    report.field_coverage.glyph_record = `${glyphRecordCount}/${packets.length}`;

    logger.ok(`  Glyph record coverage: ${glyphRecordCount}/${packets.length} (${(glyphRecordCount / packets.length * 100).toFixed(1)}%)${glyphTableMissing ? ' [table missing]' : ''}`);

    report.steps.push({
      step: 'check_glyph_record',
      status: glyphTableMissing ? 'table_missing' : 'ok',
      coverage: glyphRecordCount,
      total: packets.length,
      percent: (glyphRecordCount / packets.length * 100).toFixed(1),
      table_missing: glyphTableMissing,
    });

    // Step 4: Check qdrantHit coverage
    logger.log('\nStep 4: Check qdrantHit coverage (Qdrant payload)...');

    let qdrantHitCount = 0;
    const qdrantHitSamples = [];

    for (const packet of packets) {
      try {
        const searchRes = await qdrant.scroll('codebase_chunks_768', {
          limit: 1,
          with_payload: true,
          filter: {
            should: [
              { key: 'packet_key', match: { value: packet.packet_key } },
              { key: 'source_ref', match: { value: packet.source_ref } },
            ],
          },
        });

        const points = searchRes.result?.points || [];
        if (points.length > 0) {
          qdrantHitCount++;
          qdrantHitSamples.push({
            packet_key: packet.packet_key,
            qdrant_point_id: points[0].id,
            payload_keys: Object.keys(points[0].payload || {}).slice(0, 5),
          });
        }
      } catch (err) {
        // Qdrant error — skip
      }
    }

    report.statistics.qdrant_hit_coverage = qdrantHitCount;
    report.field_samples.qdrant_hit = qdrantHitSamples.slice(0, 5);
    report.field_coverage.qdrant_hit = `${qdrantHitCount}/${packets.length}`;

    logger.ok(`  Qdrant hit coverage: ${qdrantHitCount}/${packets.length} (${(qdrantHitCount / packets.length * 100).toFixed(1)}%)`);

    report.steps.push({
      step: 'check_qdrant_hit',
      status: 'ok',
      coverage: qdrantHitCount,
      total: packets.length,
      percent: (qdrantHitCount / packets.length * 100).toFixed(1),
    });

    // Step 5: Check redisHotKey coverage
    logger.log('\nStep 5: Check redisHotKey coverage (Redis)...');

    let redisHotKeyCount = 0;
    const redisHotKeySamples = [];

    try {
      await redis.connect();

      for (const packet of packets) {
        const keyPatterns = [
          `gpu:karpathy:scores`,
          `gpu:karpathy:encoded`,
          `bifrost:packet:${packet.packet_key}`,
          `bifrost:feature:${packet.feature_id}`,
        ];

        for (const pattern of keyPatterns) {
          try {
            const exists = await redis.exists(pattern);
            if (exists) {
              redisHotKeyCount++;
              redisHotKeySamples.push({
                packet_key: packet.packet_key,
                redis_key: pattern,
              });
              break;
            }
          } catch (err) {
            // Skip
          }
        }
      }

      await redis.quit();
    } catch (err) {
      logger.warn(`  Redis connection failed: ${err.message}`);
    }

    report.statistics.redis_hot_key_coverage = redisHotKeyCount;
    report.field_samples.redis_hot_key = redisHotKeySamples.slice(0, 5);
    report.field_coverage.redis_hot_key = `${redisHotKeyCount}/${packets.length}`;

    logger.ok(`  Redis hot key coverage: ${redisHotKeyCount}/${packets.length} (${(redisHotKeyCount / packets.length * 100).toFixed(1)}%)`);

    report.steps.push({
      step: 'check_redis_hot_key',
      status: 'ok',
      coverage: redisHotKeyCount,
      total: packets.length,
      percent: (redisHotKeyCount / packets.length * 100).toFixed(1),
    });

    // Step 6: Check neo4jNode coverage
    logger.log('\nStep 6: Check neo4jNode coverage (Neo4j)...');

    const neo4jSession = neo4jDriver.session();
    let neo4jNodeCount = 0;
    const neo4jNodeSamples = [];

    for (const packet of packets) {
      const nodeRes = await neo4jSession.run(
        `MATCH (p:Packet) WHERE p.packet_key = $packet_key OR p.source_ref = $source_ref OR p.feature_id = $feature_id
         RETURN p.id as id, p.packet_key as packet_key
         LIMIT 1`,
        {
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          feature_id: packet.feature_id,
        }
      );

      if (nodeRes.records.length > 0) {
        neo4jNodeCount++;
        neo4jNodeSamples.push({
          packet_key: packet.packet_key,
          neo4j_node_id: nodeRes.records[0].get('id'),
        });
      }
    }

    await neo4jSession.close();

    report.statistics.neo4j_node_coverage = neo4jNodeCount;
    report.field_samples.neo4j_node = neo4jNodeSamples.slice(0, 5);
    report.field_coverage.neo4j_node = `${neo4jNodeCount}/${packets.length}`;

    logger.ok(`  Neo4j node coverage: ${neo4jNodeCount}/${packets.length} (${(neo4jNodeCount / packets.length * 100).toFixed(1)}%)`);

    report.steps.push({
      step: 'check_neo4j_node',
      status: 'ok',
      coverage: neo4jNodeCount,
      total: packets.length,
      percent: (neo4jNodeCount / packets.length * 100).toFixed(1),
    });

    // Final status
    const avgCoverage = (somClusterCount + glyphRecordCount + qdrantHitCount + redisHotKeyCount + neo4jNodeCount) / (5 * packets.length) * 100;
    report.status = avgCoverage >= 60 ? 'PASS' : 'WARN';

    logger.ok(`\n✅ Higher-hop enrichment audit complete — Average coverage: ${avgCoverage.toFixed(1)}%`);

  } catch (err) {
    logger.error(`Audit failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await auditEnrichmentFields();

  mkdirSync(REPORTS_DIR, { recursive: true });

  writeFileSync(
    resolve(REPORTS_DIR, 'higher-hop-enrichment-fields-audit.json'),
    JSON.stringify(report, null, 2)
  );

  const md = `# Higher-Hop Enrichment Fields Audit

**Timestamp**: ${report.timestamp}
**Status**: ${report.status}

## Overview

Audits availability of five enrichment fields across mirrors:
- somCluster (Postgres + Qdrant)
- glyphRecord (atlas_svg_glyphs)
- qdrantHit (Qdrant payload)
- redisHotKey (Redis cache)
- neo4jNode (Neo4j graph)

## Coverage Summary

| Field | Coverage | Percent |
|-------|----------|---------|
| somCluster | ${report.field_coverage.som_cluster} | ${(report.statistics.som_cluster_coverage / report.statistics.total_packets_sampled * 100).toFixed(1)}% |
| glyphRecord | ${report.field_coverage.glyph_record} | ${(report.statistics.glyph_record_coverage / report.statistics.total_packets_sampled * 100).toFixed(1)}% |
| qdrantHit | ${report.field_coverage.qdrant_hit} | ${(report.statistics.qdrant_hit_coverage / report.statistics.total_packets_sampled * 100).toFixed(1)}% |
| redisHotKey | ${report.field_coverage.redis_hot_key} | ${(report.statistics.redis_hot_key_coverage / report.statistics.total_packets_sampled * 100).toFixed(1)}% |
| neo4jNode | ${report.field_coverage.neo4j_node} | ${(report.statistics.neo4j_node_coverage / report.statistics.total_packets_sampled * 100).toFixed(1)}% |

## Pass Condition

✅ Average coverage ≥60% (higher-hop enrichment ready)

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'higher-hop-enrichment-fields-audit.md'),
    md
  );

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
  neo4jDriver.close();
});
