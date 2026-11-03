#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

import { loadRepoEnv } from '../atlas/connection-config.mjs';
import { writeLaneReportV1 } from './lane-report-v1.mjs';

async function main() {
  console.log('\n=== Feature Memory Story Lane ===\n');

  const report = {
    timestamp: new Date().toISOString(),
    lane: 'story',
    status: 'PASS',
    checks: {},
  };

  let hasFailures = false;

  // 1. Verify primary files exist
  console.log('1. Verifying key integration files exist…');
  const criticalFiles = [
    'sveltekit-frontend/src/routes/api/codebase/search/multi-vector/+server.ts',
    'sveltekit-frontend/src/lib/server/utils/ollama-endpoint.ts',
    'scripts/atlas/verify-qdrant-packet-payload.mjs',
    'scripts/atlas/upsert-qdrant-packet-payload.mjs',
    'scripts/atlas/connection-config.mjs',
    'scripts/lib/canonical-source-ref.mjs'
  ];
  const fileStatus = {};
  for (const f of criticalFiles) {
    const fullPath = path.join(ROOT, f);
    const exists = existsSync(fullPath);
    fileStatus[f] = exists ? 'present' : 'missing';
    if (!exists) {
      hasFailures = true;
      console.log(`  ❌ Missing critical file: ${f}`);
    } else {
      console.log(`  ✅ ${f} is present.`);
    }
  }
  report.checks.files = {
    status: hasFailures ? 'FAIL' : 'PASS',
    detail: fileStatus
  };

  // 2. Verify Drizzle / Database schema contracts
  console.log('\n2. Verifying database schema contracts…');
  const env = loadRepoEnv(process.env);
  const dbUrl = env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  let schemaStatus = {};
  let schemaBlocked = false;
  try {
    const pool = new pg.Pool({ connectionString: dbUrl, connectionTimeoutMillis: 3000 });

    // Check tables existence and columns
    const tablesToCheck = ['atlas_packets', 'atlas_embeddings', 'atlas_token_map'];
    for (const table of tablesToCheck) {
      const { rows } = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);

      if (rows.length === 0) {
        schemaStatus[table] = { status: 'missing' };
        if (table === 'atlas_packets') {
          hasFailures = true;
          console.log(`  ❌ Table ${table} is missing!`);
        } else {
          console.log(`  ⚠️  Table ${table} is missing (optional/mirror).`);
        }
      } else {
        const cols = rows.map(r => r.column_name);
        schemaStatus[table] = { status: 'present', columns: cols };
        console.log(`  ✅ Table ${table} exists with ${cols.length} columns.`);
      }
    }

    await pool.end();
  } catch (err) {
    schemaBlocked = true;
    schemaStatus.error = err.message;
    console.log(`  ❌ Database schema check failed: ${err.message}`);
  }

  report.checks.schema = {
    status: hasFailures ? 'FAIL' : schemaBlocked ? 'BLOCKED' : 'PASS',
    detail: schemaStatus
  };

  report.status = hasFailures ? 'FAIL' : schemaBlocked ? 'BLOCKED' : 'PASS';
  if (report.status !== 'PASS') process.exitCode = 1;

  // Save report
  const reportPath = writeLaneReportV1('story', report);
  console.log(`\nFeature memory story lane report saved to ${path.relative(ROOT, reportPath)} with status: ${report.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
