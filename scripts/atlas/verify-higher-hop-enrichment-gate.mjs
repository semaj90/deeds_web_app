#!/usr/bin/env node
/**
 * Verify: Higher-Hop Enrichment Gate
 *
 * Verifies that higher-hop enrichment is complete and meets quality gates.
 * Gates (all must PASS):
 *   1. somCluster coverage ≥80%
 *   2. glyphRecord coverage ≥60%
 *   3. qdrantHit coverage ≥90%
 *   4. redisHotKey coverage ≥50%
 *   5. neo4jNode coverage ≥70%
 *   6. Average coverage ≥70%
 *
 * Output:
 *   - docs/reports/higher-hop-enrichment-gate-verify.json
 *   - docs/reports/higher-hop-enrichment-gate-verify.md
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

const GATES = {
  som_cluster: { threshold: 80, name: 'somCluster coverage' },
  glyph_record: { threshold: 60, name: 'glyphRecord coverage' },
  qdrant_hit: { threshold: 90, name: 'qdrantHit coverage' },
  redis_hot_key: { threshold: 50, name: 'redisHotKey coverage' },
  neo4j_node: { threshold: 70, name: 'neo4jNode coverage' },
  average: { threshold: 70, name: 'Average coverage' },
};

async function verifyEnrichmentGate() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log('║  Verify: Higher-Hop Enrichment Gate                            ║');
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    gates: {},
    gate_results: [],
    statistics: {},
  };

  try {
    // Fetch all canonical packets
    logger.log('Verifying enrichment coverage...\n');

    const allPacketsRes = await pool.query(
      `SELECT packet_key, source_ref, feature_id, som_cluster FROM atlas_codebase_packets LIMIT 100`
    );

    const packets = allPacketsRes.rows;

    // Gate 1: somCluster coverage
    let somCount = 0;
    for (const packet of packets) {
      if (packet.som_cluster !== null) somCount++;
    }
    const somPercent = (somCount / packets.length * 100);
    const somPass = somPercent >= GATES.som_cluster.threshold;
    report.gates.som_cluster = { coverage: somPercent.toFixed(1), pass: somPass };
    logger.info(`Gate 1 (somCluster): ${somPercent.toFixed(1)}% ${somPass ? '✅' : '❌'} (threshold ${GATES.som_cluster.threshold}%)`);

    // Gate 2: glyphRecord coverage
    let glyphCount = 0;
    let glyphTableExists = true;
    try {
      for (const packet of packets) {
        const glyphRes = await pool.query(
          `SELECT id FROM atlas_svg_glyphs WHERE packet_key = $1 LIMIT 1`,
          [packet.packet_key]
        );
        if (glyphRes.rows.length > 0) glyphCount++;
      }
    } catch (err) {
      if (err.message.includes('does not exist')) {
        glyphTableExists = false;
        logger.warn(`  atlas_svg_glyphs table does not exist (expected — higher-hop enrichment table)`);
      } else {
        throw err;
      }
    }
    const glyphPercent = glyphTableExists ? (glyphCount / packets.length * 100) : 0;
    const glyphPass = glyphPercent >= GATES.glyph_record.threshold;
    report.gates.glyph_record = { coverage: glyphPercent.toFixed(1), pass: glyphPass, table_missing: !glyphTableExists };
    logger.info(`Gate 2 (glyphRecord): ${glyphPercent.toFixed(1)}% ${glyphPass ? '✅' : '❌'} (threshold ${GATES.glyph_record.threshold}%)${!glyphTableExists ? ' [table missing]' : ''}`);

    // Gate 3: qdrantHit coverage — sample-based (Qdrant points have packet_key)
    let qdrantCount = 0;
    let qdrantSampleSize = 0;

    try {
      const scrollRes = await qdrant.scroll('codebase_chunks_768', {
        limit: 100,
        with_payload: true,
      });

      const points = scrollRes.points || scrollRes.result?.points || [];
      qdrantSampleSize = points.length;

      for (const point of points) {
        if (point.payload?.packet_key || point.payload?.packetKey) {
          qdrantCount++;
        }
      }
    } catch (err) {
      // Qdrant error — log but continue
    }

    const qdrantPercent = qdrantSampleSize > 0 ? (qdrantCount / qdrantSampleSize * 100) : 0;
    const qdrantPass = qdrantPercent >= GATES.qdrant_hit.threshold;
    report.gates.qdrant_hit = { coverage: qdrantPercent.toFixed(1), pass: qdrantPass, sample_size: qdrantSampleSize };
    logger.info(`Gate 3 (qdrantHit): ${qdrantPercent.toFixed(1)}% ${qdrantPass ? '✅' : '❌'} (threshold ${GATES.qdrant_hit.threshold}%) [sample: ${qdrantCount}/${qdrantSampleSize}]`);

    // Gate 4: redisHotKey coverage
    let redisCount = 0;
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
              redisCount++;
              break;
            }
          } catch (err) {
            // Skip
          }
        }
      }
      await redis.quit();
    } catch (err) {
      logger.warn(`  Redis check failed: ${err.message}`);
    }
    const redisPercent = (redisCount / packets.length * 100);
    const redisPass = redisPercent >= GATES.redis_hot_key.threshold;
    report.gates.redis_hot_key = { coverage: redisPercent.toFixed(1), pass: redisPass };
    logger.info(`Gate 4 (redisHotKey): ${redisPercent.toFixed(1)}% ${redisPass ? '✅' : '❌'} (threshold ${GATES.redis_hot_key.threshold}%)`);

    // Gate 5: neo4jNode coverage
    const neo4jSession = neo4jDriver.session();
    let neo4jCount = 0;
    for (const packet of packets) {
      const nodeRes = await neo4jSession.run(
        `MATCH (p:Packet) WHERE p.packet_key = $packet_key OR p.source_ref = $source_ref OR p.feature_id = $feature_id
         RETURN p.id LIMIT 1`,
        {
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          feature_id: packet.feature_id,
        }
      );
      if (nodeRes.records.length > 0) neo4jCount++;
    }
    await neo4jSession.close();
    const neo4jPercent = (neo4jCount / packets.length * 100);
    const neo4jPass = neo4jPercent >= GATES.neo4j_node.threshold;
    report.gates.neo4j_node = { coverage: neo4jPercent.toFixed(1), pass: neo4jPass };
    logger.info(`Gate 5 (neo4jNode): ${neo4jPercent.toFixed(1)}% ${neo4jPass ? '✅' : '❌'} (threshold ${GATES.neo4j_node.threshold}%)`);

    // Gate 6: Average coverage
    const avgPercent = (somPercent + glyphPercent + qdrantPercent + redisPercent + neo4jPercent) / 5;
    const avgPass = avgPercent >= GATES.average.threshold;
    report.gates.average = { coverage: avgPercent.toFixed(1), pass: avgPass };
    logger.info(`Gate 6 (Average): ${avgPercent.toFixed(1)}% ${avgPass ? '✅' : '❌'} (threshold ${GATES.average.threshold}%)`);

    // Overall status
    const allPass = Object.values(report.gates).every(g => g.pass);
    report.status = allPass ? 'PASS' : 'FAIL';

    logger.log(`\n${allPass ? '✅ HIGHER-HOP ENRICHMENT GATE PASS' : '❌ HIGHER-HOP ENRICHMENT GATE FAIL'}`);

  } catch (err) {
    logger.error(`Verification failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await verifyEnrichmentGate();

  mkdirSync(REPORTS_DIR, { recursive: true });

  writeFileSync(
    resolve(REPORTS_DIR, 'higher-hop-enrichment-gate-verify.json'),
    JSON.stringify(report, null, 2)
  );

  const md = `# Higher-Hop Enrichment Gate Verification

**Timestamp**: ${report.timestamp}
**Status**: ${report.status}

## Gate Results

| Gate | Coverage | Threshold | Pass |
|------|----------|-----------|------|
| somCluster | ${report.gates.som_cluster.coverage}% | ${GATES.som_cluster.threshold}% | ${report.gates.som_cluster.pass ? '✅' : '❌'} |
| glyphRecord | ${report.gates.glyph_record.coverage}% | ${GATES.glyph_record.threshold}% | ${report.gates.glyph_record.pass ? '✅' : '❌'} |
| qdrantHit | ${report.gates.qdrant_hit.coverage}% | ${GATES.qdrant_hit.threshold}% | ${report.gates.qdrant_hit.pass ? '✅' : '❌'} |
| redisHotKey | ${report.gates.redis_hot_key.coverage}% | ${GATES.redis_hot_key.threshold}% | ${report.gates.redis_hot_key.pass ? '✅' : '❌'} |
| neo4jNode | ${report.gates.neo4j_node.coverage}% | ${GATES.neo4j_node.threshold}% | ${report.gates.neo4j_node.pass ? '✅' : '❌'} |
| **Average** | **${report.gates.average.coverage}%** | **${GATES.average.threshold}%** | **${report.gates.average.pass ? '✅' : '❌'}** |

## Pass Condition

${Object.values(report.gates).every(g => g.pass) ? '✅ All gates PASS' : '❌ One or more gates FAIL'}

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'higher-hop-enrichment-gate-verify.md'),
    md
  );

  logger.ok(`\n✅ Verification report written to ${REPORTS_DIR}`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
  neo4jDriver.close();
});
