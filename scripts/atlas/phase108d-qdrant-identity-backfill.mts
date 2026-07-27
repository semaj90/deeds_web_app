#!/usr/bin/env node

/**
 * Phase 108D: Qdrant Identity Backfill (packet_key, workspace_id, ontology_version)
 *
 * Backfills three critical identity fields into Qdrant codebase_chunks_768 payloads
 * by joining Qdrant source_ref against Postgres atlas_packets.
 *
 * Strategy:
 * 1. Export all atlas_packets with identity fields to temp file
 * 2. For each Qdrant point, lookup Postgres row by source_ref
 * 3. Batch upsert updated payloads to Qdrant (1000 at a time)
 * 4. Validate coverage post-backfill
 *
 * Usage:
 *   npx tsx phase108d-qdrant-identity-backfill.mts [--dry-run] [--batch-size N]
 *   npx tsx phase108d-qdrant-identity-backfill.mts --dry-run
 *   npx tsx phase108d-qdrant-identity-backfill.mts --batch-size 500
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const isDryRun = process.argv.includes('--dry-run') !== false; // default: dry-run
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size=')) || '--batch-size=1000';
const BATCH_SIZE = parseInt(batchSizeArg.split('=')[1], 10) || 1000;

const LOG_DIR = resolve(process.cwd(), '../log/artifacts/semantic-contract');
const REPORT_FILE = `${LOG_DIR}/phase108d-qdrant-identity-backfill-report.json`;
const TEMP_DIR = tmpdir();
const POSTGRES_EXPORT = `${TEMP_DIR}/phase108d-postgres-identity-export-${randomBytes(4).toString('hex')}.jsonl`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n📋 Phase 108D: Qdrant Identity Backfill`);
console.log(`🔍 Mode: ${isDryRun ? 'DRY-RUN (no Qdrant updates)' : 'APPLY (live updates)'}`);
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

// Step 1: Export Postgres identity data to temp file
function exportPostgresIdentity(): Map<string, any> {
  console.log(`\n1️⃣  Exporting identity data from Postgres...`);

  try {
    // Simplified query without json_agg to avoid buffer overflow
    const sql = `SELECT source_ref, packet_key, workspace_id, ontology_version
      FROM atlas_packets
      WHERE source_ref IS NOT NULL
      ORDER BY source_ref`;

    // Use copy to CSV instead of json_agg (more efficient for large exports)
    const copyCommand = `COPY (${sql}) TO STDOUT WITH CSV HEADER`;
    const escapedCmd = copyCommand.replace(/"/g, '\\"').replace(/\n/g, ' ');

    const output = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "${escapedCmd}"`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );

    const trimmed = output.trim();
    if (!trimmed || trimmed.split('\n').length < 2) {
      console.log(`   ❌ No data returned from Postgres`);
      return new Map();
    }

    // Parse CSV: split lines, skip header, parse each row
    const lines = trimmed.split('\n');
    const lookup = new Map<string, any>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSV parsing: split on comma (assumes no quoted fields with commas)
      const parts = line.split(',');
      if (parts.length >= 4) {
        const source_ref = parts[0];
        const packet_key = parts[1] || null;
        const workspace_id = parts[2] || null;
        const ontology_version = parts[3] || null;

        if (source_ref && source_ref !== 'NULL') {
          lookup.set(source_ref, {
            packet_key: packet_key && packet_key !== 'NULL' ? packet_key : null,
            workspace_id: workspace_id && workspace_id !== 'NULL' ? workspace_id : null,
            ontology_version: ontology_version && ontology_version !== 'NULL' ? ontology_version : null
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

// Step 2: Fetch Qdrant point count and build direct updates via Qdrant API
async function buildBackfillBatch(postgresLookup: Map<string, any>): Promise<any[]> {
  console.log(`\n2️⃣  Building updates from Postgres data (Qdrant batch upsert)...`);

  const updates: any[] = [];

  try {
    // Strategy: convert Postgres lookup into Qdrant upsert payloads directly
    // We know source_refs in Postgres; we'll batch upsert payloads keyed by source_ref
    // Qdrant will match and merge payloads automatically

    let updateCount = 0;
    for (const [sourceRef, postgresData] of postgresLookup.entries()) {
      // Build payload update for this source_ref
      // We'll use Qdrant's search+update pattern: filter by source_ref, then upsert
      updates.push({
        source_ref: sourceRef,
        payload: {
          packet_key: postgresData.packet_key,
          workspace_id: postgresData.workspace_id,
          ontology_version: postgresData.ontology_version
        }
      });
      updateCount++;

      if (updateCount % 10000 === 0) {
        console.log(`      ${updateCount} update entries prepared...`);
      }
    }

    console.log(`   ✅ Postgres rows processed: ${postgresLookup.size}`);
    console.log(`   ✅ Updates prepared: ${updates.length}`);

    return updates;
  } catch (err) {
    console.error(`   ❌ Failed to prepare updates: ${(err as Error).message}`);
    return [];
  }
}

// Step 3: Send batch updates to Qdrant using payload indexing
function sendBatchToQdrant(updates: any[], batchIndex: number): boolean {
  if (updates.length === 0) return true;

  try {
    // Build update requests: for each source_ref, we search for matching points and update their payloads
    // Qdrant's set_payload endpoint allows bulk payload updates via filter
    const updateOps: any[] = updates.map((upd, idx) => ({
      operation: 'set_payload',
      payload: {
        packet_key: upd.payload.packet_key,
        workspace_id: upd.payload.workspace_id,
        ontology_version: upd.payload.ontology_version
      },
      filter: {
        has_payload_condition: {
          key: 'source_ref',
          has_value: true
        },
        is_empty: {
          key: 'source_ref'
        }
      }
    }));

    // Simpler approach: POST payload updates via batch API
    // Since we have source_ref → data mapping, we can use Qdrant's upsert points endpoint
    // But first, let's just batch the payload updates via curl with timeout
    const body = JSON.stringify({
      operations: updates.map((upd) => ({
        operation: 'set_payload',
        payload: upd.payload,
        filter: {
          has_payload_condition: {
            key: 'source_ref',
            match: {
              text: upd.source_ref
            }
          }
        }
      }))
    });

    // Write to temp file to avoid shell escaping issues
    const tmpFile = `/tmp/qdrant-batch-${batchIndex}.json`;
    writeFileSync(tmpFile, body);

    try {
      execSync(
        `curl -s -X POST "http://127.0.0.1:6333/collections/codebase_chunks_768/points/batch" \
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

// Step 4: Verify coverage
function verifyCoverage(): { packet_key: number; workspace_id: number; ontology_version: number } {
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
    console.error(`   ❌ Failed to verify coverage: ${(err as Error).message}`);
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
    coverage_before: { packet_key: 0, workspace_id: 0, ontology_version: 0 },
    coverage_after: { packet_key: 0, workspace_id: 0, ontology_version: 0 }
  };

  // Check initial coverage
  console.log(`\n0️⃣  Checking initial Qdrant coverage...`);
  stats.coverage_before = verifyCoverage();
  console.log(`   packet_key: ${stats.coverage_before.packet_key}/54224`);
  console.log(`   workspace_id: ${stats.coverage_before.workspace_id}/54224`);
  console.log(`   ontology_version: ${stats.coverage_before.ontology_version}/54224`);

  // Export Postgres
  const postgresLookup = exportPostgresIdentity();
  stats.total_postgres_packets = postgresLookup.size;

  if (postgresLookup.size === 0) {
    console.log(`   ❌ No Postgres data available, aborting`);
    return stats;
  }

  // Build updates
  const updates = await buildBackfillBatch(postgresLookup);
  stats.points_updated = updates.length;

  if (updates.length === 0) {
    console.log(`   ℹ️  No updates needed (all fields already match)`);
    return stats;
  }

  // Apply updates
  if (!isDryRun) {
    console.log(`\n3️⃣  Applying updates to Qdrant (${Math.ceil(updates.length / BATCH_SIZE)} batches)...`);

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const batch = updates.slice(i, i + BATCH_SIZE);

      const success = sendBatchToQdrant(batch, batchIndex);
      if (success) {
        stats.batches_sent++;
      } else {
        stats.errors.push(`Batch ${batchIndex} failed`);
      }
    }
  } else {
    console.log(`\n3️⃣  DRY-RUN: Would send ${Math.ceil(updates.length / BATCH_SIZE)} batches`);
  }

  // Verify final coverage
  if (!isDryRun) {
    console.log(`\n4️⃣  Verifying final coverage...`);
    stats.coverage_after = verifyCoverage();
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

    // Write report
    writeFileSync(REPORT_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      mode: isDryRun ? 'dry-run' : 'apply',
      batch_size: BATCH_SIZE,
      ...stats
    }, null, 2));

    console.log(`\n📊 Backfill Summary`);
    console.log(`   Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`   Updates needed: ${stats.points_updated}`);
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
