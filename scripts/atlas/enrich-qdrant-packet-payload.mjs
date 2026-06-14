#!/usr/bin/env node
/**
 * Enrich: Qdrant Packet Payload
 *
 * Adds packet_key and feature_id to Qdrant codebase_chunks_768 payload
 * for higher-hop enrichment field availability.
 *
 * Dry-run by default. Use --apply to commit changes.
 *
 * Output:
 *   - docs/reports/qdrant-packet-payload-enrich-dry-run.json
 *   - docs/reports/qdrant-packet-payload-enrich-apply.json
 *   - docs/reports/qdrant-packet-payload-enrich.md
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
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

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const qdrant = new QdrantClient({ url: QDRANT_URL });

const REPORTS_DIR = resolve(ROOT, 'docs/reports');
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const QDRANT_BATCH_SIZE = 100;
const QDRANT_CONCURRENCY = 8;

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function enrichQdrantPayload() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log(`║  Enrich: Qdrant Packet Payload — ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 27 : 28)} ║`);
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'DRY_RUN' : 'APPLY',
    steps: [],
    enrichment_results: [],
    statistics: {
      total_packets: 0,
      packets_with_payload: 0,
      points_enriched: 0,
      points_failed: 0,
      payload_fields_added: 0,
    },
  };

  try {
    // Step 1: Fetch canonical packets from Postgres
    logger.log('Step 1: Fetch canonical packets from Postgres...');

    const allPacketsRes = await pool.query(
      `SELECT packet_key, source_ref, feature_id FROM atlas_codebase_packets
       ORDER BY created_at DESC`
    );

    const packets = allPacketsRes.rows;
    logger.ok(`  Found ${packets.length} packets to enrich`);
    report.statistics.total_packets = packets.length;

    report.steps.push({
      step: 'fetch_packets',
      status: 'ok',
      packet_count: packets.length,
    });

    // Step 2: Build packet lookup map
    logger.log('\nStep 2: Build packet lookup map...');

    const packetMap = new Map();
    for (const packet of packets) {
      if (packet.packet_key) {
        packetMap.set(packet.packet_key, {
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          feature_id: packet.feature_id,
        });
      }
    }

    logger.ok(`  Built lookup map with ${packetMap.size} packets`);

    report.steps.push({
      step: 'build_lookup_map',
      status: 'ok',
      map_size: packetMap.size,
    });

    // Step 3: Build reverse lookup map (source_ref → packet_key)
    logger.log('\nStep 3: Build source_ref lookup map...');

    const sourceRefMap = new Map();
    for (const [packetKey, info] of packetMap.entries()) {
      if (info.source_ref) {
        sourceRefMap.set(info.source_ref, packetKey);
      }
    }

    logger.ok(`  Built reverse lookup with ${sourceRefMap.size} source_ref entries`);

    // Step 4: Enrich Qdrant payload
    logger.log('\nStep 4: Enrich Qdrant payload in batches...');

    let pointsEnriched = 0;
    let pointsFailed = 0;
    let pointsSkipped = 0;

    try {
      // Scroll through collection
      let offset = 0;
      const batchSize = QDRANT_BATCH_SIZE;

      while (true) {
        logger.info(`  Scrolling from offset ${offset}...`);

        const scrollRes = await qdrant.scroll('codebase_chunks_768', {
          limit: batchSize,
          with_payload: true,
          offset: offset,
        });

        const points = scrollRes.points || scrollRes.result?.points || [];

        if (points.length === 0) {
          logger.info(`  Reached end of collection at offset ${offset}`);
          break;
        }

        logger.info(`    Got ${points.length} points in batch`);

        // Log sample point to debug
        if (offset === 0 && points.length > 0) {
          const sample = points[0];
          const hasPacketKey = sample.payload?.packet_key || sample.payload?.packetKey;
          logger.info(`    Sample point ID: ${sample.id}, has packet_key: ${!!hasPacketKey}`);
        }

        // Process batch with concurrency control
        const batches = [];
        for (let i = 0; i < points.length; i += QDRANT_CONCURRENCY) {
          const batch = points.slice(i, i + QDRANT_CONCURRENCY);
          batches.push(batch);
        }

        for (const batch of batches) {
          const promises = batch.map(async (point) => {
            try {
              const payload = point.payload || {};

              // If point already has packet_key, skip
              if (payload.packet_key) {
                pointsSkipped++;
                return;
              }

              // Try to match by source_ref or sourceRef
              let packetKey = null;
              const sourceRef = payload.source_ref || payload.sourceRef;

              if (sourceRef) {
                packetKey = sourceRefMap.get(sourceRef);
              }

              // Enrich if we found a matching packet
              if (packetKey && packetMap.has(packetKey)) {
                const packetInfo = packetMap.get(packetKey);

                if (!dryRun) {
                  // Update point with enriched payload
                  const enrichedPayload = {
                    ...payload,
                    packet_key: packetInfo.packet_key,
                    source_ref: packetInfo.source_ref,
                    feature_id: packetInfo.feature_id,
                  };

                  await qdrant.upsert('codebase_chunks_768', {
                    points: [
                      {
                        id: point.id,
                        vector: point.vector,
                        payload: enrichedPayload,
                      },
                    ],
                  });
                }

                pointsEnriched++;
              } else {
                // No match found
                pointsSkipped++;
              }
            } catch (err) {
              logger.warn(`    Point ${point.id} failed: ${err.message}`);
              pointsFailed++;
            }
          });

          await Promise.all(promises);
        }

        offset += points.length;

        if (points.length < batchSize) {
          break;
        }
      }
    } catch (err) {
      if (err.message.includes('does not exist')) {
        logger.warn(`  Collection 'codebase_chunks_768' does not exist`);
      } else {
        throw err;
      }
    }

    report.statistics.points_enriched = pointsEnriched;
    report.statistics.points_failed = pointsFailed;
    report.statistics.points_skipped = pointsSkipped;
    report.statistics.payload_fields_added = pointsEnriched > 0 ? 3 : 0; // packet_key, source_ref, feature_id

    logger.ok(`  Enriched ${pointsEnriched} points (${pointsSkipped} skipped, ${pointsFailed} failed)`);

    report.steps.push({
      step: 'enrich_qdrant_payload',
      status: 'ok',
      points_enriched: pointsEnriched,
      points_skipped: pointsSkipped,
      points_failed: pointsFailed,
    });

    // Final status
    report.status = pointsEnriched > 0 ? 'PASS' : 'WARN';

    logger.ok(`\n✅ Qdrant payload enrichment complete — ${pointsEnriched} points enriched`);

  } catch (err) {
    logger.error(`Enrichment failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await enrichQdrantPayload();

  mkdirSync(REPORTS_DIR, { recursive: true });

  const reportFile = dryRun
    ? 'qdrant-packet-payload-enrich-dry-run.json'
    : 'qdrant-packet-payload-enrich-apply.json';

  writeFileSync(
    resolve(REPORTS_DIR, reportFile),
    JSON.stringify(report, null, 2)
  );

  const md = `# Qdrant Packet Payload Enrichment

**Timestamp**: ${report.timestamp}
**Mode**: ${report.mode}
**Status**: ${report.status}

## Enrichment Results

| Metric | Value |
|--------|-------|
| Total Packets | ${report.statistics.total_packets} |
| Points Enriched | ${report.statistics.points_enriched} |
| Points Skipped | ${report.statistics.points_skipped ?? 0} |
| Points Failed | ${report.statistics.points_failed} |
| Payload Fields Added | ${report.statistics.payload_fields_added} |

## Fields Added

- \`packet_key\` — Canonical packet identifier
- \`source_ref\` — Source reference (file path / symbol)
- \`feature_id\` — Feature classification ID

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'qdrant-packet-payload-enrich.md'),
    md
  );

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
});
