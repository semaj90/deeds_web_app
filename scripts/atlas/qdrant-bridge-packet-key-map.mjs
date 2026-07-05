#!/usr/bin/env node

/**
 * Qdrant Bridge: Map packet_key ↔ qdrant_point_id deterministically
 *
 * Problem: Qdrant codebase_chunks_768 has 54,650 points with (feature_id, source_ref).
 *          atlas_packets has 58,365 rows with packet_key (canonical identity).
 *          We need to populate atlas_packets.qdrant_point_id for all matching packets.
 *
 * Solution: Scroll Qdrant, extract (feature_id, source_ref) from each point,
 *           join to atlas_packets to find matching packet_key, update qdrant_point_id.
 *
 * Coverage: 54,650 Qdrant points → match to atlas_packets by (feature_id, source_ref)
 *           Expected: ~40-50K matches (some atlas_packets are non-code/external)
 *
 * Usage:
 *   node scripts/atlas/qdrant-bridge-packet-key-map.mjs --dry-run [--limit 1000]
 *   node scripts/atlas/qdrant-bridge-packet-key-map.mjs --apply
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { Client } from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const SCROLL_LIMIT = 500;

const isDryRun = process.argv.includes('--dry-run');
const isApply = process.argv.includes('--apply');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Qdrant Bridge: Map packet_key ↔ qdrant_point_id               ║');
console.log('║  Deterministic join via (feature_id, source_ref)              ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`Mode: ${isDryRun ? 'DRY_RUN' : isApply ? 'APPLY' : 'AUDIT'}`);
console.log(`Collection: ${COLLECTION}`);
console.log(`Scroll limit: ${SCROLL_LIMIT}`);
if (LIMIT) console.log(`Limit points: ${LIMIT}`);
console.log();

async function mapQdrantTPackets() {
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const pgClient = new Client({ connectionString: POSTGRES_URL });

  try {
    await pgClient.connect();
    console.log('✅ Connected to Postgres');

    // Verify Qdrant collection exists
    const collections = await qdrant.getCollections();
    const collectionExists = collections.collections.some((c) => c.name === COLLECTION);
    if (!collectionExists) {
      console.error(`❌ Collection ${COLLECTION} not found`);
      return;
    }
    console.log(`✅ Collection ${COLLECTION} exists`);
    console.log();

    // Scroll through Qdrant and map to Postgres
    console.log('Scrolling Qdrant collection...');
    let offset = undefined;
    let processed = 0;
    let matched = 0;
    let errors = 0;
    const unmatchedReasons = {};

    while (true) {
      if (LIMIT && processed >= LIMIT) break;

      try {
        const res = await qdrant.scroll(COLLECTION, {
          limit: SCROLL_LIMIT,
          offset,
          with_payload: true,
          with_vectors: false,
        });

        if (!res.points || !res.points.length) break;

        // Batch query Postgres for matches
        const matchKeys = res.points.map(p => ({
          point_id: p.id,
          feature_id: p.payload.feature_id,
          source_ref: p.payload.source_ref,
        }));

        if (isDryRun && processed === 0) {
          console.log('Sample points:');
          matchKeys.slice(0, 3).forEach(k => {
            console.log(`  point_id=${k.point_id}, feature_id=${k.feature_id}, source_ref=${k.source_ref}`);
          });
          console.log();
        }

        // Find matching packets in Postgres
        if (isApply) {
          for (const key of matchKeys) {
            const queryResult = await pgClient.query(
              `SELECT packet_key FROM atlas_packets
               WHERE feature_id = $1 AND source_ref = $2
               LIMIT 1`,
              [key.feature_id, key.source_ref]
            );

            if (queryResult.rows.length > 0) {
              const { packet_key } = queryResult.rows[0];

              // Update: set qdrant_point_id on the matching packet
              const updateResult = await pgClient.query(
                `UPDATE atlas_packets
                 SET qdrant_point_id = $1, updated_at = NOW()
                 WHERE packet_key = $2 AND qdrant_point_id IS NULL`,
                [String(key.point_id), packet_key]
              );

              if (updateResult.rowCount > 0) matched++;
            } else {
              // Unmatched: log reason
              const reason = !key.feature_id ? 'no_feature_id' :
                             !key.source_ref ? 'no_source_ref' :
                             'no_matching_packet';
              unmatchedReasons[reason] = (unmatchedReasons[reason] || 0) + 1;
            }
          }
        } else {
          // Dry-run: count expected matches via SELECT
          const matchIds = matchKeys.map(k => k.point_id);
          const queryResult = await pgClient.query(
            `SELECT COUNT(*) FROM atlas_packets
             WHERE feature_id = ANY($1::text[])
             AND source_ref = ANY($2::text[])`,
            [matchKeys.map(k => k.feature_id), matchKeys.map(k => k.source_ref)]
          );
          matched += parseInt(queryResult.rows[0].count);
        }

        processed += res.points.length;

        if ((processed % (SCROLL_LIMIT * 5)) === 0) {
          console.log(`  ✅ Processed ${processed} points...`);
        }

        // Pagination: use next_page_offset
        offset = res.next_page_offset;
        if (offset == null) break;

      } catch (err) {
        console.error(`❌ Error at offset ${offset}:`, err.message);
        errors++;
        break;
      }
    }

    console.log();
    console.log('Summary:');
    console.log(`  Total Qdrant points scrolled: ${processed}`);
    console.log(`  Matched to atlas_packets: ${matched}`);
    console.log(`  Errors: ${errors}`);

    if (Object.keys(unmatchedReasons).length > 0) {
      console.log('  Unmatched reasons:');
      Object.entries(unmatchedReasons).forEach(([reason, count]) => {
        console.log(`    ${reason}: ${count}`);
      });
    }

    // Verify final coverage
    console.log();
    const coverageResult = await pgClient.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) AS with_qdrant_id,
        ROUND(
          100.0 * COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) / COUNT(*),
          2
        ) AS coverage_pct
      FROM atlas_packets
    `);

    const { total, with_qdrant_id, coverage_pct } = coverageResult.rows[0];
    console.log(`Final Postgres coverage: ${with_qdrant_id}/${total} (${coverage_pct}%)`);

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

mapQdrantTPackets();
