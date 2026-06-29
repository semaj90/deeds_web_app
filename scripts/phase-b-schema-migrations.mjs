#!/usr/bin/env node
/**
 * Phase B Schema Migrations
 * 
 * Adds Phase B enrichment columns to atlas_packets:
 * - extracted_entities: JSONB array of entity extraction results
 * - feature_group_id: UUID for domain grouping
 * - domain_class: varchar for domain classification
 * - keywords: TEXT[] for keyword ranking
 * - error_pattern: varchar for error pattern detection
 */

import pg from 'pg';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456'
});

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  log('\n╔════════════════════════════════════════════════════════════════╗');
  log('║  Phase B Schema Migrations                                     ║');
  log('╚════════════════════════════════════════════════════════════════╝\n');
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  log(`Time: ${new Date().toISOString()}\n`);

  const migrations = [
    {
      name: 'Add extracted_entities column',
      sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS extracted_entities JSONB DEFAULT '[]'::JSONB;`,
    },
    {
      name: 'Add feature_group_id column',
      sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS feature_group_id UUID;`,
    },
    {
      name: 'Add domain_class column',
      sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS domain_class VARCHAR(100);`,
    },
    {
      name: 'Add keywords column',
      sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT ARRAY[]::TEXT[];`,
    },
    {
      name: 'Add error_pattern column',
      sql: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS error_pattern VARCHAR(100);`,
    },
    {
      name: 'Create index on extracted_entities',
      sql: `CREATE INDEX IF NOT EXISTS idx_atlas_packets_extracted_entities ON atlas_packets USING GIN (extracted_entities);`,
    },
    {
      name: 'Create index on domain_class',
      sql: `CREATE INDEX IF NOT EXISTS idx_atlas_packets_domain_class ON atlas_packets (domain_class);`,
    },
    {
      name: 'Create index on keywords',
      sql: `CREATE INDEX IF NOT EXISTS idx_atlas_packets_keywords ON atlas_packets USING GIN (keywords);`,
    },
  ];

  let applied = 0;
  let skipped = 0;

  for (const migration of migrations) {
    log(`📝 ${migration.name}`);
    
    if (DRY_RUN) {
      log(`   [DRY-RUN] ${migration.sql}`);
      skipped++;
    } else {
      try {
        await pool.query(migration.sql);
        log(`   ✅ Applied`);
        applied++;
      } catch (error) {
        log(`   ⚠️  ${error.message.split('\n')[0]}`);
        skipped++;
      }
    }
  }

  log(`\n✅ Phase B Schema Migrations Complete`);
  log(`   Applied: ${applied}`);
  log(`   Skipped/Errors: ${skipped}\n`);

  await pool.end();
}

main().catch((error) => {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
});
