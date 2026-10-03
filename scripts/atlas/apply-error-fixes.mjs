#!/usr/bin/env node
// AGENTIC-ERROR-FIX-APPLY-QUARANTINE-01: this script is READ-ONLY BY CONSTRUCTION.
//
// The committed baseline (git HEAD before this fix) had a real high-risk bug: when the
// embedding-service health probe failed, `restartEmbeddingService()` ran `docker restart
// legal-ai-ollama` via execSync UNCONDITIONALLY -- before `isDryRun` was ever checked. "Dry-run"
// could mutate live service state. In `--apply` mode it additionally ran `UPDATE error_logs ...`
// via `markErrorsAsResolved()`. Both capabilities are removed entirely below, not merely gated --
// there is no `execSync`, `execFile`, `spawn`, `docker restart`, or `UPDATE error_logs` anywhere
// in this file, in any mode.
//
// The committed baseline also had a real semantic bug: dry-run incremented `totalFixed += count`
// for candidates that were merely eligible, then reported that number as "Total Fixed" -- a
// would-be repair was represented as an actual one. This file never reports a nonzero
// `totalFixed`; `repairProof` is always `false`; and eligible-but-unactioned candidates are
// reported separately as diagnostic-only counts, never folded into a "fixed" total.
//
// Governed apply (a real service restart or `error_logs` mutation, gated on an approved mutation
// plan + receipt) does not exist yet and belongs in its own governed executor -- do not re-add a
// restart or write path here to "finish" this script.
import pg from 'pg';

const isVerbose = process.argv.includes('--verbose');

if (process.argv.includes('--apply')) {
  console.error('AGENTIC_ERROR_FIX_APPLY_BLOCKED_GOVERNED_EXECUTOR_REQUIRED');
  console.error('This legacy wrapper is audit/proposal-only; no service restart or database update is permitted.');
  process.exit(2);
}

const log = (msg) => console.log(`[P1.3 Audit] ${msg}`);
const verbose = (msg) => isVerbose && console.log(`  ${msg}`);

async function getDb() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin@127.0.0.1:5434/legal_ai_db'
  });
  return pool;
}

async function checkEmbeddingServiceHealth() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function main() {
  const db = await getDb();

  try {
    log('Starting error census (READ-ONLY -- this script has no apply mode)');

    const auditResult = await db.query(`
      SELECT error_category, COUNT(*) as error_count, MAX(severity) as max_severity
      FROM error_logs
      WHERE resolved = false
      GROUP BY error_category
      ORDER BY error_count DESC
    `);

    // Real repair counts, not this script's business -- it never performs a repair.
    const totalFixed = 0;
    const repairProof = false;
    let wouldAffectCount = 0;
    let unfixableCount = 0;
    const results = [];

    for (const row of auditResult.rows) {
      const category = row.error_category;
      const count = row.error_count;

      verbose(`Processing category: ${category} (${count} errors)`);

      if (category === 'inference_error') {
        log(`  [${category}] Diagnostic candidate: health_check_and_restart (not performed)`);

        const healthy = await checkEmbeddingServiceHealth();
        if (healthy) {
          log(`    ✓ Embedding service is healthy -- would mark ${count} as already-healthy (not applied)`);
          wouldAffectCount += count;
          results.push({ category, status: 'candidate', reason: 'already_healthy', count });
        } else {
          log(`    ✗ Embedding service unhealthy -- restart is a governed-executor action, not performed here`);
          unfixableCount += count;
          results.push({ category, status: 'blocked', reason: 'governed_executor_required', count });
        }
      } else {
        log(`  [${category}] No fixer defined (skipped)`);
        unfixableCount += count;
        results.push({ category, status: 'skipped', reason: 'no_fixer', count });
      }
    }

    log('\nCensus Summary:');
    log(`  Total Fixed: ${totalFixed} (this script never performs a repair)`);
    log(`  Would Affect (diagnostic only, not applied): ${wouldAffectCount}`);
    log(`  Unfixable / blocked / skipped: ${unfixableCount}`);
    log(`  Repair Proof: ${repairProof}`);
    log('  Mode: READ-ONLY (no changes applied -- this script has no apply mode)');

    if (results.length > 0) {
      log('\nDetailed Results:');
      results.forEach((r) => {
        log(`  ${r.category}: ${r.status} (${r.reason}, count=${r.count})`);
      });
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
