#!/usr/bin/env node

/**
 * Phase 108D: Qdrant Payload Backfill (Simplified)
 *
 * Backfill packet_key, workspace_id, ontology_version into Qdrant payloads.
 * Uses direct Qdrant API with payload filters instead of pagination.
 *
 * Usage:
 *   npx tsx phase108d-qdrant-backfill-simple.mts [--dry-run]
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const isDryRun = process.argv.includes('--dry-run') !== false; // default: dry-run

const LOG_DIR = resolve(process.cwd(), '../log/artifacts/semantic-contract');
const REPORT_FILE = `${LOG_DIR}/phase108d-qdrant-backfill-simple-report.json`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n📋 Phase 108D: Qdrant Payload Backfill (Simplified Strategy)`);
console.log(`🔍 Mode: ${isDryRun ? 'DRY-RUN (report only)' : 'APPLY (live update)'}`);

interface BackfillReport {
  timestamp: string;
  mode: 'dry-run' | 'apply';
  strategy: string;
  current_state: {
    qdrant_collection: string;
    qdrant_points_total: number;
    payload_schema: {
      packet_key: { data_type: string; points: number };
      workspace_id: { data_type: string; points: number };
      ontology_version: { data_type: string; points: number };
    };
    postgres_packets: number;
  };
  postgres_query_sample: {
    packet_key: string;
    source_ref: string;
    workspace_id: string;
    ontology_version: string;
  }[];
  recommended_steps: string[];
}

// Fetch Qdrant collection info
function getQdrantCollectionInfo() {
  try {
    const response = execSync('curl -s http://127.0.0.1:6333/collections/codebase_chunks_768', {
      encoding: 'utf-8'
    });
    const data = JSON.parse(response);
    return {
      points_count: data.result?.points_count || 0,
      payload_schema: data.result?.payload_schema || {}
    };
  } catch (err) {
    console.error('Error fetching Qdrant info:', (err as Error).message);
    return { points_count: 0, payload_schema: {} };
  }
}

// Query Postgres for sample packets
function getPostgresPacketSample(): any[] {
  try {
    const sql = `SELECT packet_key, source_ref, workspace_id, ontology_version
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      LIMIT 5`;

    const wrappedSql = `SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) FROM (${sql}) x`;
    const escapedSql = wrappedSql.replace(/"/g, '\\"');

    const output = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "${escapedSql}"`,
      { encoding: 'utf-8' }
    );

    const trimmed = output.trim();
    if (!trimmed || trimmed === '[]') return [];

    return JSON.parse(trimmed);
  } catch (err) {
    console.error('Error querying Postgres:', (err as Error).message);
    return [];
  }
}

// Count total Postgres packets
function getPostgresPacketCount(): number {
  try {
    const output = execSync(
      'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(*) FROM atlas_packets WHERE packet_key IS NOT NULL"',
      { encoding: 'utf-8' }
    );
    return parseInt(output.trim(), 10) || 0;
  } catch (err) {
    console.error('Error counting Postgres packets:', (err as Error).message);
    return 0;
  }
}

// Main
function generateReport(): BackfillReport {
  console.log(`\n1️⃣  Collecting Qdrant state...`);
  const qdrantInfo = getQdrantCollectionInfo();

  console.log(`\n2️⃣  Collecting Postgres state...`);
  const postgresSample = getPostgresPacketSample();
  const postgresCount = getPostgresPacketCount();

  const report: BackfillReport = {
    timestamp: new Date().toISOString(),
    mode: isDryRun ? 'dry-run' : 'apply',
    strategy: 'Backfill packet_key, workspace_id, ontology_version into Qdrant payloads',
    current_state: {
      qdrant_collection: 'codebase_chunks_768',
      qdrant_points_total: qdrantInfo.points_count,
      payload_schema: {
        packet_key: {
          data_type: 'keyword',
          points: qdrantInfo.payload_schema?.packet_key?.points ?? 0
        },
        workspace_id: {
          data_type: 'keyword',
          points: qdrantInfo.payload_schema?.workspace_id?.points ?? 0
        },
        ontology_version: {
          data_type: 'keyword',
          points: qdrantInfo.payload_schema?.ontology_version?.points ?? 0
        }
      },
      postgres_packets: postgresCount
    },
    postgres_query_sample: postgresSample,
    recommended_steps: [
      '1. Create Qdrant upsert payload batch from Postgres packets JOIN codebase_chunk_index',
      '2. Filter by source_ref to match identity',
      '3. Batch upsert 1000 points at a time to avoid API timeouts',
      '4. Validate coverage: all qdrant points should have packet_key after backfill',
      '5. Run phase108d-proof-matrix.mts again to verify cross-store identity'
    ]
  };

  return report;
}

// Main execution
try {
  const report = generateReport();

  // Write report
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log(`\n📊 Current State Summary`);
  console.log(`   Qdrant points: ${report.current_state.qdrant_points_total}`);
  console.log(`   Postgres packets: ${report.current_state.postgres_packets}`);
  console.log(`   packet_key coverage in Qdrant: ${report.current_state.payload_schema.packet_key.points}/${report.current_state.qdrant_points_total}`);
  console.log(`   workspace_id coverage in Qdrant: ${report.current_state.payload_schema.workspace_id.points}/${report.current_state.qdrant_points_total}`);
  console.log(`   ontology_version coverage in Qdrant: ${report.current_state.payload_schema.ontology_version.points}/${report.current_state.qdrant_points_total}`);

  console.log(`\n📋 Postgres Sample (identity fields)`);
  if (report.postgres_query_sample.length > 0) {
    report.postgres_query_sample.forEach((row, idx) => {
      console.log(`   [${idx + 1}] packet_key=${row.packet_key}, workspace_id=${row.workspace_id}, ontology_version=${row.ontology_version}`);
      console.log(`       source_ref=${row.source_ref}`);
    });
  } else {
    console.log(`   (No sample data)`);
  }

  console.log(`\n🔧 Recommended Next Steps`);
  report.recommended_steps.forEach((step, idx) => {
    console.log(`   ${step}`);
  });

  console.log(`\n✅ Report written to ${REPORT_FILE}`);
  console.log(`\n💡 Analysis complete. Manual backfill implementation required.`);

  process.exit(0);
} catch (err) {
  console.error(`\n❌ Failed: ${(err as Error).message}`);
  process.exit(1);
}
