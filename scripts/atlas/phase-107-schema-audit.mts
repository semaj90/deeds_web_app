#!/usr/bin/env npx tsx
/**
 * Phase 107 Schema Audit and Migration Manifest
 *
 * Objective: Inspect live database schema and identify:
 * - existing columns
 * - missing canonical joins
 * - row counts and coverage
 * - safe additive migrations
 * - unresolved dependencies
 *
 * OUTPUT: JSON manifest for Phase B additive migration
 */

import { pool } from '$lib/server/db/client.js';
import type { PoolClient } from 'pg';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface TableAudit {
  table_name: string;
  live_columns: ColumnInfo[];
  row_count: number;
  candidate_joins: {
    packet_key: {
      present: boolean;
      non_null_count?: number;
    };
    source_ref: {
      present: boolean;
      non_null_count?: number;
    };
    content_hash: {
      present: boolean;
      non_null_count?: number;
    };
  };
  recommendations: string[];
}

interface MigrationManifest {
  timestamp: string;
  phase: string;
  tables_audited: TableAudit[];
  missing_tables: string[];
  required_additions: {
    table_name: string;
    new_columns: {
      column_name: string;
      data_type: string;
      default?: string;
      nullable: boolean;
    }[];
    new_tables: boolean;
  }[];
  safe_to_migrate: boolean;
  blockers: string[];
}

async function getTableColumns(client: PoolClient, tableName: string): Promise<ColumnInfo[]> {
  const result = await client.query(`
    SELECT
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);

  return result.rows;
}

async function getRowCount(client: PoolClient, tableName: string): Promise<number> {
  const result = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
  return parseInt(result.rows[0].count);
}

async function auditTable(client: PoolClient, tableName: string): Promise<TableAudit> {
  const columns = await getTableColumns(client, tableName);
  const rowCount = await getRowCount(client, tableName);

  // Check for candidate join columns
  const hasPacketKey = columns.some(c => c.column_name === 'packet_key');
  const hasSourceRef = columns.some(c => c.column_name === 'source_ref');
  const hasContentHash = columns.some(c => c.column_name === 'content_hash');

  let packetKeyNonNull = 0;
  let sourceRefNonNull = 0;
  let contentHashNonNull = 0;

  if (hasPacketKey) {
    const result = await client.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE packet_key IS NOT NULL`);
    packetKeyNonNull = parseInt(result.rows[0].count);
  }

  if (hasSourceRef) {
    const result = await client.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE source_ref IS NOT NULL`);
    sourceRefNonNull = parseInt(result.rows[0].count);
  }

  if (hasContentHash) {
    const result = await client.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE content_hash IS NOT NULL`);
    contentHashNonNull = parseInt(result.rows[0].count);
  }

  const recommendations: string[] = [];

  if (tableName === 'feature_implementations') {
    if (!hasPacketKey) {
      recommendations.push('ADD packet_key text (nullable) — link to atlas_packets');
    }
    if (!hasSourceRef) {
      recommendations.push('ADD source_ref text (nullable) — canonical Atlas source identity');
    }
    if (!hasContentHash) {
      recommendations.push('ADD content_hash text (nullable) — content integrity check');
    }
  }

  if (tableName === 'feature_file_edges') {
    const hasFilePath = columns.some(c => c.column_name === 'file_path');
    if (!hasSourceRef && hasFilePath) {
      recommendations.push('ADD source_ref text (nullable) — resolve from file_path via registry');
    }
    if (!hasPacketKey) {
      recommendations.push('ADD packet_key text (nullable) — join to atlas_packets');
    }
    if (!hasContentHash) {
      recommendations.push('ADD content_hash text (nullable) — content hash for dedup');
    }
  }

  return {
    table_name: tableName,
    live_columns: columns,
    row_count: rowCount,
    candidate_joins: {
      packet_key: {
        present: hasPacketKey,
        non_null_count: hasPacketKey ? packetKeyNonNull : undefined
      },
      source_ref: {
        present: hasSourceRef,
        non_null_count: hasSourceRef ? sourceRefNonNull : undefined
      },
      content_hash: {
        present: hasContentHash,
        non_null_count: hasContentHash ? contentHashNonNull : undefined
      }
    },
    recommendations
  };
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('📋 Phase 107 Schema Audit\n');

    const existingTables = [
      'feature_implementations',
      'feature_file_edges',
      'atlas_packets'
    ];

    const missingTables = [
      'feature_lexical_facts',
      'feature_domain_facts',
      'feature_structural_facts',
      'feature_ontology_tuples'
    ];

    const tableAudits: TableAudit[] = [];
    const blockers: string[] = [];

    // Audit existing tables
    for (const table of existingTables) {
      try {
        const audit = await auditTable(client, table);
        tableAudits.push(audit);

        console.log(`✓ ${table}`);
        console.log(`  Columns: ${audit.live_columns.length}`);
        console.log(`  Rows: ${audit.row_count}`);
        console.log(`  packet_key: ${audit.candidate_joins.packet_key.present ? `YES (${audit.candidate_joins.packet_key.non_null_count} non-null)` : 'NO'}`);
        console.log(`  source_ref: ${audit.candidate_joins.source_ref.present ? `YES (${audit.candidate_joins.source_ref.non_null_count} non-null)` : 'NO'}`);
        console.log(`  content_hash: ${audit.candidate_joins.content_hash.present ? `YES (${audit.candidate_joins.content_hash.non_null_count} non-null)` : 'NO'}`);

        if (audit.recommendations.length > 0) {
          console.log(`  Recommendations:`);
          audit.recommendations.forEach(r => console.log(`    - ${r}`));
        }
        console.log();
      } catch (err: any) {
        blockers.push(`Failed to audit ${table}: ${err.message}`);
      }
    }

    // Check for missing tables
    console.log('Missing Feature Tables:');
    for (const table of missingTables) {
      console.log(`  ✗ ${table} (needs creation)`);
    }
    console.log();

    // Validate atlas_packets uniqueness
    console.log('Validating atlas_packets uniqueness...');
    const uniqueCheck = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT packet_key) as distinct_keys,
        COUNT(DISTINCT source_ref) as distinct_refs
      FROM atlas_packets
    `);

    const row = uniqueCheck.rows[0];
    console.log(`  Total packets: ${row.total}`);
    console.log(`  Distinct packet_key: ${row.distinct_keys}`);
    console.log(`  Distinct source_ref: ${row.distinct_refs}`);

    if (row.total === row.distinct_keys) {
      console.log(`  ✓ packet_key is unique (safe for PK reference)\n`);
    } else {
      blockers.push('atlas_packets.packet_key is NOT unique — cannot use as FK target');
    }

    // Generate manifest
    const manifest: MigrationManifest = {
      timestamp: new Date().toISOString(),
      phase: 'A-AUDIT',
      tables_audited: tableAudits,
      missing_tables: missingTables,
      required_additions: [
        {
          table_name: 'feature_implementations',
          new_columns: [
            { column_name: 'packet_key', data_type: 'text', nullable: true },
            { column_name: 'source_ref', data_type: 'text', nullable: true },
            { column_name: 'content_hash', data_type: 'text', nullable: true },
            { column_name: 'processing_pass_id', data_type: 'uuid', nullable: true }
          ],
          new_tables: false
        },
        {
          table_name: 'feature_file_edges',
          new_columns: [
            { column_name: 'packet_key', data_type: 'text', nullable: true },
            { column_name: 'source_ref', data_type: 'text', nullable: true },
            { column_name: 'content_hash', data_type: 'text', nullable: true }
          ],
          new_tables: false
        }
      ],
      safe_to_migrate: blockers.length === 0,
      blockers
    };

    console.log('📊 MIGRATION MANIFEST\n');
    console.log(JSON.stringify(manifest, null, 2));

    if (manifest.safe_to_migrate) {
      console.log('\n✅ SAFE TO PROCEED TO PHASE B (Additive Migration)');
    } else {
      console.log('\n❌ BLOCKERS FOUND — Fix before proceeding:\n');
      blockers.forEach(b => console.log(`  - ${b}`));
    }

  } finally {
    await client.release();
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
