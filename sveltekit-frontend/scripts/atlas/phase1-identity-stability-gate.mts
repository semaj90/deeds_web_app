/**
 * Phase 1: Identity Stability Gate Executor
 *
 * Runs the IDENTITY_STABLE exit gate against live Postgres.
 * Produces machine-readable JSON report.
 */

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { verifyIdentityStability } from '../../src/lib/server/atlas/identity/cross_store_identity_verifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isVerbose = process.argv.includes('--verbose');
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  try {
    if (isDryRun) {
      console.log('[DRY-RUN] Would execute IDENTITY_STABLE gate against Postgres');
      console.log('[DRY-RUN] Gate execution deferred until --dry-run flag removed');
      process.exit(0);
    }

    console.log('[Phase 1] Executing IDENTITY_STABLE gate...');
    const startTime = Date.now();

    const result = await verifyIdentityStability();

    const endTime = Date.now();
    const executedAt = new Date().toISOString();
    const durationMs = endTime - startTime;

    // Output machine-readable report
    const report = {
      gate: result.gate_name,
      status: result.status,
      executed_at: executedAt,
      duration_ms: durationMs,
      postgres_count: result.postgres_uniqueness.total_nodes,
      null_tree_node_ids: result.postgres_uniqueness.null_tree_node_ids,
      duplicate_count: result.postgres_uniqueness.duplicate_ids,
      field_validity_pass: result.field_validity.pass,
      naming_compliance_pass: result.naming_compliance.pass,
      overall_pass: result.overall_pass,
      contract_version: '1.0.0',
      failure_reasons: result.failure_reasons,
      remediation_steps: result.remediation_steps,
    };

    console.log('\n[Phase 1 Gate Report]');
    console.log(JSON.stringify(report, null, 2));

    if (isVerbose) {
      console.log('\n[Detailed Gate Output]');
      console.log(JSON.stringify(result, null, 2));
    }

    if (!result.overall_pass) {
      console.error(`\n[FAILED] IDENTITY_STABLE gate did not pass`);
      process.exit(1);
    }

    console.log(`\n[PASSED] IDENTITY_STABLE gate completed successfully in ${durationMs}ms`);
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] IDENTITY_STABLE gate execution failed:');
    console.error(err instanceof Error ? err.message : String(err));
    if (isVerbose && err instanceof Error) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
