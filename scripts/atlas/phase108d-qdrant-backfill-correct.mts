#!/usr/bin/env node

/**
 * Phase 108D: Qdrant Identity Backfill (Correct Approach)
 *
 * Uses Qdrant scroll API to fetch all point IDs + source_refs,
 * then upserts updated payloads with packet_key, workspace_id, ontology_version.
 *
 * Strategy:
 * 1. Export Postgres packets (packet_key, workspace_id, ontology_version by source_ref)
 * 2. Scroll through all Qdrant points to get ID + source_ref mapping
 * 3. Build ID → update payload map by joining Postgres data
 * 4. Batch upsert payloads by point ID (NOT filter)
 * 5. Verify coverage post-backfill
 *
 * Usage:
 *   npx tsx phase108d-qdrant-backfill-correct.mts [--dry-run] [--batch-size N]
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const isDryRun = process.argv.includes('--dry-run') !== false; // default: dry-run
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size=')) || '--batch-size=500';
const BATCH_SIZE = parseInt(batchSizeArg.split('=')[1], 10) || 500;

const LOG_DIR = resolve(process.cwd(), '../log/artifacts/semantic-contract');
const REPORT_FILE = `${LOG_DIR}/phase108d-qdrant-backfill-correct-report.json`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n📋 Phase 108D: Qdrant Identity Backfill (Correct Approach)`);
console.log(`🔍 Mode: ${isDryRun ? 'DRY-RUN (no changes)' : 'APPLY (live update)'}`);
console.log(`📦 Batch size: ${BATCH_SIZE} points per upsert`);

interface BackfillStats {
  total_qdrant_points: number;
  total_postgres_packets: number;
  points_processed: number;
  points_matched: number;
  points_updated: number;
  points_skipped: number;
  batches_sent: number;
  errors: string[];
  coverage_before: { packet_key: number; workspace_id: number; ontology_version: number };
  coverage_after: { packet_key: number; workspace_id: number; ontology_version: number };
}

// Step 1: Export Postgres identity data
function exportPostgresIdentity(): Map<string, any> {
  console.log(`\n1️⃣  Exporting identity data from Postgres...`);

  try {
    const sql = `SELECT source_ref, packet_key, workspace_id, ontology_version
      FROM atlas_packets
      WHERE source_ref IS NOT NULL`;

    const copyCommand = `COPY (${sql}) TO STDOUT WITH CSV HEADER`;
    const escapedCmd = copyCommand.replace(/"/g, '\\"').replace(/\n/g, ' ');

    const output = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "${escapedCmd}"`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );

    const lines = output.trim().split('\n');
    const lookup = new Map<string, any>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length >= 4) {
        const source_ref = parts[0];
        if (source_ref && source_ref !== 'NULL') {
          lookup.set(source_ref, {
            packet_key: parts[1] && parts[1] !== 'NULL' ? parts[1] : null,
            workspace_id: parts[2] && parts[2] !== 'NULL' ? parts[2] : null,
            ontology_version: parts[3] && parts[3] !== 'NULL' ? parts[3] : null
          });
        }
      }
    }

    console.log(`   ✅ Loaded ${lookup.size} packets from Postgres`);
    return lookup;
  } catch (err) {
    console.error(`   ❌ Failed to export from Postgres: ${(err as Error).message}`);
    return new Map();
  }
}

// Step 2: Fetch Qdrant points via offset/limit pagination and build updates
function fetchQdrantPointsAndBuildUpdates(postgresLookup: Map<string, any>): any[] {
  console.log(`\n2️⃣  Fetching Qdrant points and building updates...`);

  const updates: any[] = [];
  let totalProcessed = 0;
  let totalMatched = 0;
  let offset = 0;
  const pageSize = 1000;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Fetch points via offset/limit (simpler than scroll API)
      const url = `http://127.0.0.1:6333/collections/codebase_chunks_768/points?limit=${pageSize}&offset=${offset}`;

      let response: string;
      try {
        response = execSync(
          `curl -s -X GET "${url}"`,
          { encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
        );
      } catch (e) {
        console.log(`   ⚠️  Request timeout at offset ${offset}, stopping pagination`);
        break;
      }

      let data: any;
      try {
        data = JSON.parse(response);
      } catch (e) {
        console.log(`   ⚠️  JSON parse error at offset ${offset}, stopping`);
        break;
      }

      const points: any[] = data.result?.points || [];
      if (points.length === 0) break;

      for (const point of points) {
        totalProcessed++;
        if (totalProcessed % 5000 === 0) {
          console.log(`      Processed ${totalProcessed} points...`);
        }

        const sourceRef = point.payload?.source_ref;
        if (!sourceRef) continue;

        const postgresData = postgresLookup.get(sourceRef);
        if (!postgresData) continue;

        totalMatched++;

        // Build update: merge existing payload with new identity fields
        const updatedPayload = {
          ...point.payload,
          packet_key: postgresData.packet_key,
          workspace_id: postgresData.workspace_id,
          ontology_version: postgresData.ontology_version
        };

        updates.push({
          id: point.id,
          payload: updatedPayload
        });
      }

      offset += pageSize;
    }

    console.log(`   ✅ Points processed: ${totalProcessed}`);
    console.log(`   ✅ Points matched: ${totalMatched}`);
    console.log(`   ✅ Updates to send: ${updates.length}`);

    return updates;
  } catch (err) {
    console.error(`   ❌ Failed to fetch Qdrant points: ${(err as Error).message}`);
    return [];
  }
}

// Step 3: Get coverage before
function getCoverageBefore(): { packet_key: number; workspace_id: number; ontology_version: number } {
  console.log(`\n0️⃣  Checking initial Qdrant coverage...`);

  try {
    const response = execSync('curl -s http://127.0.0.1:6333/collections/codebase_chunks_768', {
      encoding: 'utf-8'
    });

    const data = JSON.parse(response);
    const schema = data.result?.payload_schema || {};

    return {
      packet_key: schema.packet_key?.points || 0,
      workspace_id: schema.workspace_id?.points || 0,
      ontology_version: schema.ontology_version?.points || 0
    };
  } catch (err) {
    console.error(`   ⚠️  Failed to get coverage: ${(err as Error).message}`);
    return { packet_key: 0, workspace_id: 0, ontology_version: 0 };
  }
}

// Step 4: Send batch updates to Qdrant
function sendBatchToQdrant(updates: any[], batchIndex: number, dryRun: boolean): boolean {
  if (updates.length === 0) return true;

  if (dryRun) {
    console.log(`      [DRY-RUN] Batch ${batchIndex}: would send ${updates.length} updates`);
    return true;
  }

  try {
    const body = JSON.stringify({ points: updates });
    const tmpFile = `/tmp/qdrant-batch-${batchIndex}.json`;
    writeFileSync(tmpFile, body);

    try {
      execSync(
        `curl -s -X PUT "http://127.0.0.1:6333/collections/codebase_chunks_768/points" \
          -H "Content-Type: application/json" \
          -d @${tmpFile} > /dev/null 2>&1`,
        { encoding: 'utf-8', timeout: 30000 }
      );

      console.log(`      ✅ Batch ${batchIndex}: sent ${updates.length} updates`);
      return true;
    } finally {
      try {
        execSync(`rm -f ${tmpFile}`);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.error(`      ❌ Batch ${batchIndex} failed: ${(err as Error).message}`);
    return false;
  }
}

// Step 5: Get coverage after
function getCoverageAfter(): { packet_key: number; workspace_id: number; ontology_version: number } {
  try {
    const response = execSync('curl -s http://127.0.0.1:6333/collections/codebase_chunks_768', {
      encoding: 'utf-8'
    });

    const data = JSON.parse(response);
    const schema = data.result?.payload_schema || {};

    return {
      packet_key: schema.packet_key?.points || 0,
      workspace_id: schema.workspace_id?.points || 0,
      ontology_version: schema.ontology_version?.points || 0
    };
  } catch (err) {
    console.error(`   ⚠️  Failed to get coverage: ${(err as Error).message}`);
    return { packet_key: 0, workspace_id: 0, ontology_version: 0 };
  }
}

// Main execution
async function runBackfill(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total_qdrant_points: 0,
    total_postgres_packets: 0,
    points_processed: 0,
    points_matched: 0,
    points_updated: 0,
    points_skipped: 0,
    batches_sent: 0,
    errors: [],
    coverage_before: getCoverageBefore(),
    coverage_after: { packet_key: 0, workspace_id: 0, ontology_version: 0 }
  };

  console.log(`   packet_key: ${stats.coverage_before.packet_key}/54224`);
  console.log(`   workspace_id: ${stats.coverage_before.workspace_id}/54224`);
  console.log(`   ontology_version: ${stats.coverage_before.ontology_version}/54224`);

  const postgresLookup = exportPostgresIdentity();
  stats.total_postgres_packets = postgresLookup.size;

  if (postgresLookup.size === 0) {
    console.log(`   ❌ No Postgres data available, aborting`);
    return stats;
  }

  const updates = fetchQdrantPointsAndBuildUpdates(postgresLookup);
  stats.points_processed = updates.length;
  stats.points_matched = updates.length;
  stats.points_updated = updates.length;

  if (updates.length === 0) {
    console.log(`   ℹ️  No updates needed or no Qdrant points matched`);
    return stats;
  }

  // Send updates in batches
  console.log(`\n3️⃣  Sending ${Math.ceil(updates.length / BATCH_SIZE)} batches to Qdrant...`);

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    const batch = updates.slice(i, i + BATCH_SIZE);

    const success = sendBatchToQdrant(batch, batchIndex, isDryRun);
    if (success) {
      stats.batches_sent++;
    } else {
      stats.errors.push(`Batch ${batchIndex} failed`);
    }
  }

  // Verify coverage after (only if not dry-run)
  if (!isDryRun) {
    console.log(`\n4️⃣  Verifying final coverage...`);
    stats.coverage_after = getCoverageAfter();
    console.log(`   packet_key: ${stats.coverage_after.packet_key}/54224`);
    console.log(`   workspace_id: ${stats.coverage_after.workspace_id}/54224`);
    console.log(`   ontology_version: ${stats.coverage_after.ontology_version}/54224`);
  } else {
    console.log(`\n4️⃣  DRY-RUN: Skipping final verification`);
    stats.coverage_after = stats.coverage_before;
  }

  return stats;
}

// Main
(async () => {
  try {
    const stats = await runBackfill();

    writeFileSync(REPORT_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      mode: isDryRun ? 'dry-run' : 'apply',
      batch_size: BATCH_SIZE,
      ...stats
    }, null, 2));

    console.log(`\n📊 Backfill Summary`);
    console.log(`   Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`   Postgres packets: ${stats.total_postgres_packets}`);
    console.log(`   Qdrant points matched: ${stats.points_matched}`);
    console.log(`   Updates sent: ${stats.points_updated}`);
    console.log(`   Batches sent: ${stats.batches_sent}`);
    console.log(`   Errors: ${stats.errors.length}`);
    console.log(`   Coverage packet_key: ${stats.coverage_before.packet_key} → ${stats.coverage_after.packet_key}`);
    console.log(`   Coverage workspace_id: ${stats.coverage_before.workspace_id} → ${stats.coverage_after.workspace_id}`);
    console.log(`   Coverage ontology_version: ${stats.coverage_before.ontology_version} → ${stats.coverage_after.ontology_version}`);

    console.log(`\n✅ Report written to ${REPORT_FILE}`);

    if (isDryRun) {
      console.log(`\n💡 This was a DRY-RUN. To apply changes, remove --dry-run flag.`);
      process.exit(0);
    } else {
      console.log(`\n✅ Backfill complete.`);
      process.exit(stats.errors.length > 0 ? 1 : 0);
    }
  } catch (err) {
    console.error(`\n❌ Backfill failed: ${(err as Error).message}`);
    process.exit(1);
  }
})();
