#!/usr/bin/env node
/**
 * Phase 2F.1: Backfill qdrant_point_id - Revised Strategy
 *
 * Core insight: atlas_packets (58K) and Qdrant codebase_chunks_768 (55K) are partially overlapping
 * but use different identity schemes.
 *
 * Strategy:
 * 1. Fetch all atlas_packets with realistic source_refs (file extensions: .ts, .js, .tsx, etc.)
 * 2. Normalize source_ref to match Qdrant payload format (remove $lib aliases, etc.)
 * 3. Search Qdrant for points with matching normalized source_ref
 * 4. Link the Qdrant point ID to atlas_packets.qdrant_point_id
 * 5. Track gaps (packets with no Qdrant equivalent) for later materialization
 */

import * as fs from 'fs';
import { execSync } from 'child_process';

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

function normalizeSourceRef(ref: string): string {
  // Remove $lib prefix and normalize path separators
  return ref.replace(/^\$lib\//, 'sveltekit-frontend/src/lib/').replace(/\\/g, '/');
}

async function searchQdrantBySourceRef(sourceRef: string): Promise<any[]> {
  const normalized = normalizeSourceRef(sourceRef);
  const url = 'http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll';

  const body = {
    limit: 50,
    with_payload: true,
    filter: {
      must: [
        {
          field: 'sourceRefs',
          match: { value: normalized },
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

    if (!response.ok) return [];
    const data = await response.json();
    return data.result?.points ?? [];
  } catch (err) {
    return [];
  }
}

async function main() {
  const dryRun = !process.argv.includes('--apply');

  console.log('Phase 2F.1: Backfill qdrant_point_id (v2 — normalized search)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    console.log('[1/5] Fetching atlas_packets with code-like source_refs...');
    const fetchSQL = `
      SELECT packet_id, source_ref, qdrant_point_id
      FROM atlas_packets
      WHERE (source_ref LIKE '%.ts%' OR source_ref LIKE '%.js%' OR source_ref LIKE '$lib%')
      AND qdrant_point_id IS NULL
      ORDER BY source_ref
      LIMIT 5000;
    `;

    const fetchResult = execSQL(fetchSQL);
    const lines = fetchResult.split('\n').filter((l) => l.trim());

    const packets: any[] = [];
    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 3 && parts[0] !== 'packet_id') {
        packets.push({
          packet_id: parts[0],
          source_ref: parts[1],
          qdrant_point_id: parts[2],
        });
      }
    }

    console.log(`  ✓ Found ${packets.length} packets with code-like source_refs`);
    console.log('');

    console.log('[2/5] Searching Qdrant by normalized source_ref...');
    const results = {
      found_single: [] as any[],
      found_multiple: [] as any[],
      found_zero: [] as any[],
    };

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const qdrantPoints = await searchQdrantBySourceRef(packet.source_ref);

      if (qdrantPoints.length === 1) {
        results.found_single.push({
          ...packet,
          qdrant_point_id: String(qdrantPoints[0].id),
        });
      } else if (qdrantPoints.length > 1) {
        results.found_multiple.push({
          ...packet,
          conflict_count: qdrantPoints.length,
        });
      } else {
        results.found_zero.push(packet);
      }

      if ((i + 1) % 500 === 0) {
        console.log(`  ✓ Searched ${i + 1}/${packets.length}`);
      }
    }

    console.log(`  ✓ Search complete`);
    console.log('');

    console.log('[3/5] Results:');
    console.log(`  ✓ Found single match: ${results.found_single.length}`);
    console.log(`  ✗ Multiple conflicts: ${results.found_multiple.length}`);
    console.log(`  ✗ Missing from Qdrant: ${results.found_zero.length}`);
    console.log('');

    if (dryRun) {
      console.log('DRY-RUN MODE:');
      console.log(`  Would update ${results.found_single.length} packets`);
      console.log(`  Would mark ${results.found_multiple.length} conflicts`);
      console.log(`  Would enqueue ${results.found_zero.length} for materialization`);
      console.log('');
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/backfill-qdrant-point-ids-v2.mts --apply`);
    } else {
      console.log('[4/5] Applying updates to Postgres...');

      if (results.found_single.length > 0) {
        const updates = results.found_single
          .map((r) => `UPDATE atlas_packets SET qdrant_point_id = '${r.qdrant_point_id}' WHERE packet_id = '${r.packet_id}';`)
          .join('\n');

        execSQL(updates);
        console.log(`  ✓ Updated ${results.found_single.length} packets`);
      }

      console.log('');
      console.log('[5/5] Verifying backfill...');
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
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
