#!/usr/bin/env node

/**
 * Phase 108D: Qdrant Payload Backfill (packet_key, workspace_id, ontology_version)
 *
 * Backfills three critical identity fields into Qdrant codebase_chunks_768 payloads.
 * These fields are missing from the mirror, preventing cross-store validation.
 *
 * Usage:
 *   npx tsx phase108d-qdrant-backfill-identity.mts [--dry-run] [--limit N]
 *   npx tsx phase108d-qdrant-backfill-identity.mts --dry-run --limit 100
 *
 * Mode: --dry-run (default) shows what would be updated without applying changes.
 * Apply: Remove --dry-run flag to apply updates to live Qdrant.
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Parse arguments
const isDryRun = process.argv.includes('--dry-run') !== false; // default: dry-run
const limitArg = process.argv.find(arg => arg.startsWith('--limit=')) || '--limit=99999';
const LIMIT = parseInt(limitArg.split('=')[1], 10) || 99999;

const LOG_DIR = resolve(process.cwd(), '../log/artifacts/semantic-contract');
const REPORT_FILE = `${LOG_DIR}/phase108d-qdrant-backfill-identity-report.json`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n📋 Phase 108D: Qdrant Payload Backfill (packet_key, workspace_id, ontology_version)`);
console.log(`🔍 Mode: ${isDryRun ? 'DRY-RUN (no changes)' : 'APPLY (live update)'}`);
console.log(`📊 Limit: ${LIMIT} points`);

// Types
interface QdrantPoint {
  id: string | number;
  payload: Record<string, any>;
}

interface BackfillResult {
  source_ref: string;
  packet_key_before: string | null;
  packet_key_after: string | null;
  workspace_id_before: string | null;
  workspace_id_after: string | null;
  ontology_version_before: string | null;
  ontology_version_after: string | null;
  matched: boolean;
  updated: boolean;
  error?: string;
}

interface Report {
  mode: 'dry-run' | 'apply';
  timestamp: string;
  limit: number;
  total_scanned: number;
  total_matched: number;
  total_updated: number;
  total_skipped: number;
  total_errors: number;
  results: BackfillResult[];
  summary: {
    packet_key_missing_before: number;
    packet_key_added: number;
    workspace_id_missing_before: number;
    workspace_id_added: number;
    ontology_version_missing_before: number;
    ontology_version_added: number;
  };
}

// Fetch all points from Qdrant with pagination
async function fetchAllQdrantPoints(): Promise<QdrantPoint[]> {
  console.log(`\n1️⃣  Fetching points from Qdrant codebase_chunks_768...`);

  const allPoints: QdrantPoint[] = [];
  let offset = 0;
  const pageSize = 100;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = execSync(
        `curl -s "http://127.0.0.1:6333/collections/codebase_chunks_768/points?limit=${pageSize}&offset=${offset}"`,
        { encoding: 'utf-8' }
      );

      const data = JSON.parse(response);
      const points: QdrantPoint[] = data.result?.points || [];

      if (points.length === 0) break;

      allPoints.push(...points);
      offset += points.length;

      console.log(`   Fetched ${allPoints.length} points so far...`);

      if (allPoints.length >= LIMIT) break;
    }
  } catch (err) {
    console.error(`   ❌ Error fetching from Qdrant:`, (err as Error).message);
    process.exit(1);
  }

  console.log(`   ✅ Total points fetched: ${allPoints.length}`);
  return allPoints.slice(0, LIMIT);
}

// Query Postgres for identity fields by source_ref
function queryPostgresForPacket(sourceRef: string): {
  packet_key: string | null;
  workspace_id: string | null;
  ontology_version: string | null;
} | null {
  try {
    const wrappedSql = `SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (
      SELECT packet_key, workspace_id, ontology_version
      FROM atlas_packets
      WHERE source_ref = '${sourceRef.replace(/'/g, "''")}'
      LIMIT 1
    ) x`;

    const escapedSql = wrappedSql.replace(/"/g, '\\"');
    const output = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "${escapedSql}"`,
      { encoding: 'utf-8' }
    );

    const trimmed = output.trim();
    if (!trimmed || trimmed === '[]') return null;

    const parsed = JSON.parse(trimmed);
    return parsed[0] || null;
  } catch (err) {
    console.error(`   Warning: Failed to query Postgres for ${sourceRef}: ${(err as Error).message}`);
    return null;
  }
}

// Main backfill logic
async function runBackfill(): Promise<Report> {
  const points = await fetchAllQdrantPoints();

  console.log(`\n2️⃣  Resolving identity fields from Postgres...`);

  const results: BackfillResult[] = [];
  const summary = {
    packet_key_missing_before: 0,
    packet_key_added: 0,
    workspace_id_missing_before: 0,
    workspace_id_added: 0,
    ontology_version_missing_before: 0,
    ontology_version_added: 0
  };

  let processed = 0;
  for (const point of points) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`   Processed ${processed}/${points.length}...`);
    }

    const sourceRef = point.payload?.source_ref as string | undefined;
    if (!sourceRef) {
      results.push({
        source_ref: '(missing)',
        packet_key_before: null,
        packet_key_after: null,
        workspace_id_before: null,
        workspace_id_after: null,
        ontology_version_before: null,
        ontology_version_after: null,
        matched: false,
        updated: false,
        error: 'source_ref missing from Qdrant payload'
      });
      continue;
    }

    const pgPacket = queryPostgresForPacket(sourceRef);
    if (!pgPacket) {
      results.push({
        source_ref: sourceRef,
        packet_key_before: point.payload?.packet_key ?? null,
        packet_key_after: point.payload?.packet_key ?? null,
        workspace_id_before: point.payload?.workspace_id ?? null,
        workspace_id_after: point.payload?.workspace_id ?? null,
        ontology_version_before: point.payload?.ontology_version ?? null,
        ontology_version_after: point.payload?.ontology_version ?? null,
        matched: false,
        updated: false,
        error: 'Not found in Postgres'
      });
      continue;
    }

    // Track before state
    const packetKeyBefore = point.payload?.packet_key ?? null;
    const workspaceIdBefore = point.payload?.workspace_id ?? null;
    const ontologyVersionBefore = point.payload?.ontology_version ?? null;

    // Prepare updates
    const updates: Record<string, any> = {};
    let shouldUpdate = false;

    if (packetKeyBefore !== pgPacket.packet_key) {
      updates.packet_key = pgPacket.packet_key;
      shouldUpdate = true;
      if (!packetKeyBefore) summary.packet_key_missing_before++;
      if (pgPacket.packet_key) summary.packet_key_added++;
    }

    if (workspaceIdBefore !== pgPacket.workspace_id) {
      updates.workspace_id = pgPacket.workspace_id;
      shouldUpdate = true;
      if (!workspaceIdBefore) summary.workspace_id_missing_before++;
      if (pgPacket.workspace_id) summary.workspace_id_added++;
    }

    if (ontologyVersionBefore !== pgPacket.ontology_version) {
      updates.ontology_version = pgPacket.ontology_version;
      shouldUpdate = true;
      if (!ontologyVersionBefore) summary.ontology_version_missing_before++;
      if (pgPacket.ontology_version) summary.ontology_version_added++;
    }

    // Apply update if needed
    if (shouldUpdate && !isDryRun) {
      try {
        // Update point in Qdrant by merging payload
        const mergedPayload = { ...point.payload, ...updates };
        const updateBody = JSON.stringify({
          points: [
            {
              id: point.id,
              payload: mergedPayload
            }
          ]
        });

        execSync(
          `curl -s -X PUT "http://127.0.0.1:6333/collections/codebase_chunks_768/points" \
            -H "Content-Type: application/json" \
            -d '${updateBody.replace(/'/g, "'\\''")}'`,
          { encoding: 'utf-8' }
        );
      } catch (err) {
        console.error(`   Error updating point ${point.id}: ${(err as Error).message}`);
      }
    }

    results.push({
      source_ref: sourceRef,
      packet_key_before: packetKeyBefore,
      packet_key_after: shouldUpdate ? pgPacket.packet_key : packetKeyBefore,
      workspace_id_before: workspaceIdBefore,
      workspace_id_after: shouldUpdate ? pgPacket.workspace_id : workspaceIdBefore,
      ontology_version_before: ontologyVersionBefore,
      ontology_version_after: shouldUpdate ? pgPacket.ontology_version : ontologyVersionBefore,
      matched: true,
      updated: shouldUpdate && !isDryRun
    });
  }

  const report: Report = {
    mode: isDryRun ? 'dry-run' : 'apply',
    timestamp: new Date().toISOString(),
    limit: LIMIT,
    total_scanned: points.length,
    total_matched: results.filter(r => r.matched).length,
    total_updated: results.filter(r => r.updated).length,
    total_skipped: results.filter(r => !r.matched).length,
    total_errors: results.filter(r => r.error).length,
    results,
    summary
  };

  return report;
}

// Main
(async () => {
  try {
    const report = await runBackfill();

    // Write report
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

    console.log(`\n📊 Backfill Summary`);
    console.log(`   Mode: ${report.mode}`);
    console.log(`   Total scanned: ${report.total_scanned}`);
    console.log(`   Total matched: ${report.total_matched}`);
    console.log(`   Total updated: ${report.total_updated}`);
    console.log(`   Total skipped: ${report.total_skipped}`);
    console.log(`   Total errors: ${report.total_errors}`);

    console.log(`\n📈 Field Coverage`);
    console.log(`   packet_key missing before: ${report.summary.packet_key_missing_before}`);
    console.log(`   packet_key added: ${report.summary.packet_key_added}`);
    console.log(`   workspace_id missing before: ${report.summary.workspace_id_missing_before}`);
    console.log(`   workspace_id added: ${report.summary.workspace_id_added}`);
    console.log(`   ontology_version missing before: ${report.summary.ontology_version_missing_before}`);
    console.log(`   ontology_version added: ${report.summary.ontology_version_added}`);

    console.log(`\n✅ Report written to ${REPORT_FILE}`);

    if (isDryRun) {
      console.log(`\n💡 This was a DRY-RUN. To apply changes, remove --dry-run flag.`);
      process.exit(0);
    } else {
      console.log(`\n✅ Updates applied to Qdrant.`);
      process.exit(report.total_errors > 0 ? 1 : 0);
    }
  } catch (err) {
    console.error(`\n❌ Backfill failed: ${(err as Error).message}`);
    process.exit(1);
  }
})();
