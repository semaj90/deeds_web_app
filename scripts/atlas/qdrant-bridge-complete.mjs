#!/usr/bin/env node

/**
 * Qdrant Bridge COMPLETE: Fast SQL-based packet_key ↔ qdrant_point_id mapping
 *
 * Strategy: Use Postgres to match ALL Qdrant payloads in one pass via JSON operators
 * and UPDATE all matching packets atomically.
 *
 * Qdrant has 54,650 points (file chunks + directory clusters + metrics)
 * atlas_packets has 58,365 rows (code packets + derivations)
 * Expected match: ~40-50K file-based packets (directories unmatched, OK)
 *
 * Speed: Single UPDATE statement vs loop. Deterministic, scalable.
 *
 * Usage:
 *   node scripts/atlas/qdrant-bridge-complete.mjs --dry-run
 *   node scripts/atlas/qdrant-bridge-complete.mjs --apply
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { Client } from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { createWriteStream } from 'fs';
import { resolve } from 'path';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 1000;

const isDryRun = process.argv.includes('--dry-run');
const isApply = process.argv.includes('--apply');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Qdrant Bridge COMPLETE: SQL-based packet_key mapping          ║');
console.log('║  Fast deterministic join via feature_id + source_ref           ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`Mode: ${isDryRun ? 'DRY_RUN' : isApply ? 'APPLY' : 'AUDIT'}`);
console.log(`Collection: ${COLLECTION}`);
console.log(`Batch size: ${BATCH_SIZE}`);
console.log();

async function bridgeQdrantComplete() {
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const pgClient = new Client({ connectionString: POSTGRES_URL });

  try {
    await pgClient.connect();
    console.log('✅ Connected to Postgres');

    // Verify Qdrant exists
    const collections = await qdrant.getCollections();
    const collectionExists = collections.collections.some((c) => c.name === COLLECTION);
    if (!collectionExists) {
      console.error(`❌ Collection ${COLLECTION} not found`);
      return;
    }
    console.log(`✅ Collection ${COLLECTION} exists`);
    console.log();

    // Export all Qdrant points to temp JSON for Postgres bulk processing
    console.log('Exporting all Qdrant points for bulk processing...');
    const pointsForUpdate = [];
    let offset = undefined;
    let totalPoints = 0;

    while (true) {
      const res = await qdrant.scroll(COLLECTION, {
        limit: BATCH_SIZE,
        offset,
        with_payload: true,
        with_vectors: false,
      });

      if (!res.points || !res.points.length) break;

      for (const point of res.points) {
        const { id, payload } = point;
        // Extract match fields from Qdrant payload
        const matchPoint = {
          qdrant_point_id: String(id),
          feature_id: payload?.feature_id || null,
          source_ref: payload?.source_ref || null,
          kind: payload?.kind || null,
        };
        pointsForUpdate.push(matchPoint);
        totalPoints++;
      }

      if (totalPoints % (BATCH_SIZE * 10) === 0) {
        console.log(`  ✅ Exported ${totalPoints} points...`);
      }

      offset = res.next_page_offset;
      if (offset == null) break;
    }

    console.log(`  ✅ Total points exported: ${totalPoints}`);
    console.log();

    if (isDryRun) {
      // Analyze match patterns
      console.log('Analyzing match patterns (first 100K records):');
      const patterns = pointsForUpdate.slice(0, 100000).reduce((acc, p) => {
        const pattern = `${p.feature_id ? 'F' : '_'}${p.source_ref ? 'S' : '_'}${p.kind ? 'K' : '_'}`;
        acc[pattern] = (acc[pattern] || 0) + 1;
        return acc;
      }, {});

      Object.entries(patterns).sort().forEach(([pattern, count]) => {
        console.log(`  ${pattern}: ${count}`);
      });
      console.log();

      // Estimate matches via SQL
      const estimateQuery = `
        SELECT
          'has_feature_id' AS category, COUNT(*) AS count
        FROM (SELECT DISTINCT feature_id FROM atlas_packets WHERE feature_id IS NOT NULL) f
        JOIN (SELECT DISTINCT feature_id FROM (
          VALUES ${pointsForUpdate.slice(0, 10000).map((p, i) => `($${i + 1})`).join(',')}
        ) AS q(feature_id)) q ON f.feature_id = q.feature_id
      `;

      // Simple count instead
      const countResult = await pgClient.query(`
        SELECT COUNT(DISTINCT feature_id) FROM atlas_packets WHERE feature_id IS NOT NULL
      `);
      console.log(`  Distinct feature_ids in atlas_packets: ${countResult.rows[0].count}`);

      const qdrantDistinct = new Set(pointsForUpdate.map(p => p.feature_id).filter(Boolean));
      console.log(`  Distinct feature_ids in Qdrant export: ${qdrantDistinct.size}`);
      console.log();
    }

    if (isApply) {
      // Bulk update: match by feature_id + source_ref
      console.log('Executing bulk UPDATE to populate qdrant_point_id...');

      // Create temporary table with points
      await pgClient.query('DROP TABLE IF EXISTS _qdrant_bulk_import');
      await pgClient.query(`
        CREATE TEMP TABLE _qdrant_bulk_import (
          qdrant_point_id TEXT,
          feature_id TEXT,
          source_ref TEXT,
          kind TEXT
        )
      `);

      // Insert points in batches
      for (let i = 0; i < pointsForUpdate.length; i += BATCH_SIZE) {
        const batch = pointsForUpdate.slice(i, i + BATCH_SIZE);
        const values = batch.map((p, idx) => `
          ($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})
        `).join(',');

        const params = batch.flatMap(p => [p.qdrant_point_id, p.feature_id, p.source_ref, p.kind]);

        await pgClient.query(
          `INSERT INTO _qdrant_bulk_import VALUES ${values}`,
          params
        );
      }

      console.log(`  ✅ Inserted ${pointsForUpdate.length} points into temp table`);

      // Update atlas_packets with qdrant_point_id via join
      const updateResult = await pgClient.query(`
        UPDATE atlas_packets ap
        SET qdrant_point_id = qb.qdrant_point_id,
            updated_at = NOW()
        FROM _qdrant_bulk_import qb
        WHERE ap.feature_id = qb.feature_id
        AND ap.source_ref = qb.source_ref
        AND ap.qdrant_point_id IS NULL
        AND qb.feature_id IS NOT NULL
        AND qb.source_ref IS NOT NULL
      `);

      console.log(`  ✅ Updated ${updateResult.rowCount} packets with qdrant_point_id`);

      // Cleanup
      await pgClient.query('DROP TABLE IF EXISTS _qdrant_bulk_import');
    }

    // Final coverage report
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
    console.log(`Final atlas_packets coverage: ${with_qdrant_id}/${total} (${coverage_pct}%)`);

    if (!isApply) {
      const qdrantFilePoints = pointsForUpdate.filter(p => p.feature_id && p.source_ref).length;
      console.log(`Qdrant file-based points (expected matches): ${qdrantFilePoints}/${totalPoints}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

bridgeQdrantComplete();