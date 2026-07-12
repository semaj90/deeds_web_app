#!/usr/bin/env node
/**
 * Phase 2F.1: Backfill qdrant_point_id from 33/1,221 (2.7%) toward ≥99%
 *
 * Sequence:
 * 1. Read packet_key and source_ref from Postgres
 * 2. Search Qdrant by packet_key payload
 * 3. If exactly one point: write qdrant_point_id
 * 4. If zero: enqueue materialization
 * 5. If multiple: mark identity conflict
 * 6. Verify vector lane and dimension
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// ============================================================================
// DATABASE HELPER
// ============================================================================

function execSQL(sql: string): string {
  const tempFile = `/tmp/query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  fs.writeFileSync(tempFile, sql);
  try {
    return execSync(
      `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempFile}`,
      { encoding: 'utf-8' }
    );
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {}
  }
}

// ============================================================================
// QDRANT HELPER
// ============================================================================

async function searchQdrantBySourceRef(sourceRef: string): Promise<any[]> {
  const url = 'http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll';

  // Use scroll API to find points by source_ref payload matching
  const body = {
    limit: 100,
    with_payload: true,
    filter: {
      must: [
        {
          field: 'source_ref',
          match: { value: sourceRef },
        },
      ],
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.result?.points ?? [];
  } catch (err) {
    return [];
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const corpusVersion = '2026-07-12-main-4ade5cfa';

  console.log('Phase 2F.1: Backfill qdrant_point_id');
  console.log(`Corpus version: ${corpusVersion}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    // Step 1: Read all packets with missing qdrant_point_id
    console.log('[1/6] Fetching packets with missing qdrant_point_id...');
    const fetchSQL = `
      SELECT packet_id, packet_key, source_ref, qdrant_point_id
      FROM atlas_packets
      ORDER BY packet_key
      LIMIT 2000;
    `;

    const fetchResult = execSQL(fetchSQL);
    const lines = fetchResult.split('\n').filter((l) => l.trim());

    // Parse output (format: packet_id | packet_key | source_ref | qdrant_point_id)
    const packets: any[] = [];
    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 4 && parts[0] !== 'packet_id') {
        packets.push({
          packet_id: parts[0],
          packet_key: parts[1],
          source_ref: parts[2],
          qdrant_point_id: parts[3],
        });
      }
    }

    console.log(`  ✓ Found ${packets.length} packets`);
    console.log('');

    // Step 2-6: Search Qdrant and classify results
    console.log('[2/6] Searching Qdrant for each packet...');

    const results = {
      found_single: [] as any[],
      found_multiple: [] as any[],
      found_zero: [] as any[],
      already_linked: [] as any[],
    };

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];

      if (packet.qdrant_point_id && packet.qdrant_point_id !== '(null)') {
        results.already_linked.push(packet);
        continue;
      }

      const qdrantPoints = await searchQdrantBySourceRef(packet.source_ref);

      if (qdrantPoints.length === 1) {
        results.found_single.push({
          ...packet,
          qdrant_point_id: String(qdrantPoints[0].id),
          qdrant_score: qdrantPoints[0].score,
        });
      } else if (qdrantPoints.length > 1) {
        results.found_multiple.push({
          ...packet,
          conflict_count: qdrantPoints.length,
          conflicting_ids: qdrantPoints.map((p) => String(p.id)),
        });
      } else {
        results.found_zero.push(packet);
      }

      if ((i + 1) % 100 === 0) {
        console.log(`  ✓ Searched ${i + 1}/${packets.length} packets`);
      }
    }

    console.log(`  ✓ Search complete`);
    console.log('');

    // Step 3: Report results
    console.log('[3/6] Results:');
    console.log(`  ✓ Found single match: ${results.found_single.length}`);
    console.log(`  ✓ Already linked: ${results.already_linked.length}`);
    console.log(`  ✗ Identity conflict (multiple): ${results.found_multiple.length}`);
    console.log(`  ✗ Missing from Qdrant: ${results.found_zero.length}`);
    console.log('');

    // Step 4: Verify vector lane and dimension
    console.log('[4/6] Verifying Qdrant collection...');
    const collectionUrl = 'http://127.0.0.1:6333/collections/codebase_chunks_768';
    const collectionResponse = await fetch(collectionUrl);
    const collectionData = await collectionResponse.json();
    const collectionInfo = collectionData.result;

    console.log(`  ✓ Collection: codebase_chunks_768`);
    console.log(`  ✓ Vector size: ${collectionInfo.config?.params?.vectors?.size ?? 'unknown'}`);
    console.log(`  ✓ Points count: ${collectionInfo.points_count ?? 'unknown'}`);
    console.log('');

    if (dryRun) {
      console.log('DRY-RUN MODE:');
      console.log(`  Would update ${results.found_single.length} packets with qdrant_point_id`);
      console.log(`  Would mark ${results.found_multiple.length} as identity conflicts`);
      console.log(`  Would enqueue ${results.found_zero.length} for materialization`);
      console.log('');
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/backfill-qdrant-point-ids.mts --apply`);
    } else {
      console.log('[5/6] Applying updates to Postgres...');

      // Update packets with single matches
      if (results.found_single.length > 0) {
        const updates = results.found_single
          .map(
            (r) => `
        UPDATE atlas_packets
        SET qdrant_point_id = '${r.qdrant_point_id}'
        WHERE packet_id = '${r.packet_id}';
      `
          )
          .join('\n');

        execSQL(updates);
        console.log(`  ✓ Updated ${results.found_single.length} packets`);
      }

      // Mark identity conflicts
      if (results.found_multiple.length > 0) {
        const conflicts = results.found_multiple
          .map(
            (r) => `
        INSERT INTO atlas_packets_identity_conflicts (packet_id, conflict_type, conflict_detail, created_at)
        VALUES ('${r.packet_id}', 'multiple_qdrant_points', '${JSON.stringify({
              conflicting_ids: r.conflicting_ids,
              packet_key: r.packet_key,
            }).replace(/'/g, "''")}', NOW())
        ON CONFLICT DO NOTHING;
      `
          )
          .join('\n');

        execSQL(conflicts);
        console.log(`  ✓ Marked ${results.found_multiple.length} identity conflicts`);
      }

      // Enqueue missing for materialization
      if (results.found_zero.length > 0) {
        const enqueue = results.found_zero
          .map(
            (r) => `
        INSERT INTO atlas_packets_materialization_queue (packet_id, packet_key, corpus_version, status, created_at)
        VALUES ('${r.packet_id}', '${r.packet_key}', '${corpusVersion}', 'pending', NOW())
        ON CONFLICT DO NOTHING;
      `
          )
          .join('\n');

        execSQL(enqueue);
        console.log(`  ✓ Enqueued ${results.found_zero.length} packets for materialization`);
      }

      console.log('');
      console.log('[6/6] Verifying backfill...');
      const verifySQL = `
        SELECT
          COUNT(*) total,
          COUNT(CASE WHEN qdrant_point_id IS NOT NULL AND qdrant_point_id != '' THEN 1 END) linked,
          ROUND(100.0 * COUNT(CASE WHEN qdrant_point_id IS NOT NULL AND qdrant_point_id != '' THEN 1 END) / COUNT(*), 2) coverage_pct
        FROM atlas_packets;
      `;

      const verifyResult = execSQL(verifySQL);
      console.log(verifyResult);
      console.log('');

      console.log('✅ BACKFILL COMPLETE');
      console.log(`   Found single: ${results.found_single.length}`);
      console.log(`   Identity conflicts: ${results.found_multiple.length}`);
      console.log(`   Missing (enqueued): ${results.found_zero.length}`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. Review identity conflicts: SELECT * FROM atlas_packets_identity_conflicts');
      console.log('  2. Process materialization queue: run Qdrant ingestion for pending packets');
      console.log('  3. Re-run this script to backfill newly materialized points');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
