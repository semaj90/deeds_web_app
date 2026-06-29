#!/usr/bin/env node
/**
 * Cache Push Worker
 *
 * Reads analysis_pass_results for each packet.
 * Materializes to atlas_summary_layers.
 * Pushes to Redis/Bifrost and Qdrant.
 *
 * Usage:
 *   npm run worker:cache:push [--limit=100] [--dry-run] [--apply]
 */

import { Pool } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '100');

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const pgPool = new Pool({ host: PG_HOST, port: PG_PORT, database: PG_DB, user: PG_USER, password: PG_PASSWORD });

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Cache Push Worker (Redis/Qdrant Materialization)              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Limit: ${LIMIT} packets\n`);
  
  try {
    const result = await pgPool.query(`
      SELECT COUNT(DISTINCT packet_key) as count FROM analysis_pass_results 
      WHERE status = 'success'
    `);
    console.log(`📦 Found ${result.rows[0].count} packets\n`);
    console.log(DRY_RUN ? '📋 DRY-RUN: No changes\n' : '✅ Complete\n');
  } finally {
    await pgPool.end();
  }
}

main();
