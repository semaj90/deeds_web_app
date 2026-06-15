#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load environment variables
function loadAtlasEnv(root) {
  const envFile = path.join(root, 'sveltekit-frontend', '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const [key, val] = line.split('=');
      if (key && val && !key.startsWith('#')) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
  return { loadedFiles: [envFile] };
}

const { loadedFiles } = loadAtlasEnv(REPO_ROOT);
console.log(`[ATLAS:ERROR:VERIFY] Loaded env from: ${loadedFiles.join(', ') || '(none)'}`);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
  idleTimeoutMillis: 5000,
  max: 2,
});

const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const TIMESTAMP = new Date().toISOString().split('T')[0];
const REPORT_JSON = path.join(REPORT_DIR, `error-verify-${TIMESTAMP}.json`);
const REPORT_MD = path.join(REPORT_DIR, `error-verify-${TIMESTAMP}.md`);

fs.mkdirSync(REPORT_DIR, { recursive: true });

async function runVerify() {
  console.log('[ATLAS:ERROR:VERIFY] Starting error fix verification...\n');

  const client = await pool.connect();

  try {
    const currentStats = await client.query(`
      SELECT
        COUNT(*) as total_errors,
        COUNT(CASE WHEN fixed_at IS NOT NULL THEN 1 END) as fixed_count,
        COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_count,
        COUNT(CASE WHEN fixed_at IS NULL THEN 1 END) as unfixed_count,
        AVG(CASE WHEN fixed_at IS NOT NULL THEN fix_confidence ELSE NULL END) as avg_fix_confidence
      FROM error_logs
    `);

    const stats = currentStats.rows[0];

    console.log(`[ATLAS:ERROR:VERIFY] Current state:`);
    console.log(`  Total errors: ${stats.total_errors}`);
    console.log(`  Fixed: ${stats.fixed_count}`);
    console.log(`  Resolved: ${stats.resolved_count}`);
    console.log(`  Unfixed: ${stats.unfixed_count}`);

    const gates = {
      gate_1: {
        name: 'Error count decreased ≥10%',
        pass: stats.total_errors > 0 ? stats.fixed_count >= (stats.total_errors * 0.1) : true,
        value: stats.fixed_count,
        threshold: stats.total_errors > 0 ? Math.ceil(stats.total_errors * 0.1) : 0
      },
      gate_2: {
        name: 'No regressions (unfixed stable or decreased)',
        pass: stats.unfixed_count <= stats.total_errors,
        value: stats.unfixed_count,
        threshold: stats.total_errors
      },
      gate_3: {
        name: 'Fix confidence >0.85',
        pass: stats.avg_fix_confidence ? parseFloat(stats.avg_fix_confidence) > 0.85 : true,
        value: stats.avg_fix_confidence ? parseFloat(stats.avg_fix_confidence).toFixed(2) : 'N/A',
        threshold: 0.85
      },
      gate_4: {
        name: 'Coverage >50% (at least half addressed)',
        pass: stats.total_errors > 0 ? (stats.fixed_count + stats.resolved_count) >= (stats.total_errors * 0.5) : true,
        value: stats.total_errors > 0 ? ((stats.fixed_count + stats.resolved_count) / stats.total_errors * 100).toFixed(1) : 100,
        threshold: 50
      }
    };

    const allPass = Object.values(gates).every(g => g.pass);
    const passCount = Object.values(gates).filter(g => g.pass).length;

    for (const [key, gate] of Object.entries(gates)) {
      console.log(`[ATLAS:ERROR:VERIFY] ${gate.pass ? '✅' : '❌'} ${gate.name} (${gate.value}/${gate.threshold})`);
    }

    const result = {
      status: allPass ? 'pass' : 'warn',
      summary: {
        total_errors: stats.total_errors,
        fixed_count: stats.fixed_count,
        resolved_count: stats.resolved_count,
        unfixed_count: stats.unfixed_count,
        gates_pass: passCount,
        gates_total: 4
      },
      gates: Object.entries(gates).map(([key, gate]) => ({
        name: gate.name,
        pass: gate.pass,
        value: gate.value,
        threshold: gate.threshold
      })),
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
    fs.writeFileSync(REPORT_MD, `# P1.4: Error Verify Report\n\n**Date**: ${new Date().toISOString()}\n**Status**: ${allPass ? '✅ PASS' : '⚠️ WARNING'}\n\n## Summary\n\nTotal errors: ${stats.total_errors}\nFixed: ${stats.fixed_count}\nResolved: ${stats.resolved_count}\nGates pass: ${passCount}/4\n`);

    console.log(`\n[ATLAS:ERROR:VERIFY] ${allPass ? '✅ PASS' : '⚠️ WARNING'}`);
    console.log(`[ATLAS:ERROR:VERIFY] Report: ${REPORT_JSON}`);

    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  const result = await runVerify();
  process.exit(result.status === 'pass' ? 0 : 1);
} catch (err) {
  console.error('[ATLAS:ERROR:VERIFY] Fatal error:', err.message);
  process.exit(2);
}
