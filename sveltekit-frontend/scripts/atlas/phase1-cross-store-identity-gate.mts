/**
 * Phase 1: Cross-Store Identity Parity Gate Executor
 *
 * Phase 1: Postgres-only validation (Qdrant, Neo4j, Valkey connections deferred to Phase 2+)
 * Produces machine-readable JSON report.
 */

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { verifyIdentityCrossStoreParitySchema } from '../../src/lib/server/atlas/identity/cross_store_identity_verifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isVerbose = process.argv.includes('--verbose');
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  try {
    if (isDryRun) {
      console.log('[DRY-RUN] Would execute CROSS_STORE_IDENTITY_PROVEN gate');
      console.log('[DRY-RUN] Phase 1: Postgres-only validation');
      console.log('[DRY-RUN] Phase 2+: Qdrant, Neo4j, Valkey connections required');
      process.exit(0);
    }

    console.log('[Phase 1] Executing CROSS_STORE_IDENTITY_PROVEN gate...');
    console.log('[Phase 1] Note: Qdrant, Neo4j, Valkey connections deferred to Phase 2+');
    const startTime = Date.now();

    const result = await verifyIdentityCrossStoreParitySchema();

    const endTime = Date.now();
    const executedAt = new Date().toISOString();
    const durationMs = endTime - startTime;

    // Output machine-readable report
    const report = {
      gate: result.gate_name,
      status: result.status, // "NOT_EXECUTED" in Phase 1
      executed_at: executedAt,
      duration_ms: durationMs,
      postgres_count: result.parity_result.postgres_count,
      qdrant_checked: result.parity_result.qdrant_count,
      neo4j_checked: result.parity_result.neo4j_count,
      redis_checked: result.parity_result.redis_count,
      unresolved_qdrant_ids: result.qdrant_proof.verified_count,
      unresolved_neo4j_ids: result.neo4j_proof.verified_count,
      invalid_cache_entries: 0, // Phase 2+
      eligible_missing_mirrors: result.parity_result.missing_somewhere.length,
      contract_version: '1.0.0',
      phase_1_note: 'Cross-store verification not yet executed. Qdrant, Redis, Neo4j connections required for Phase 2.',
      failure_reasons: result.failure_reasons,
    };

    console.log('\n[Phase 1 Gate Report]');
    console.log(JSON.stringify(report, null, 2));

    if (isVerbose) {
      console.log('\n[Detailed Gate Output]');
      console.log(JSON.stringify(result, null, 2));
    }

    if (result.status === 'NOT_EXECUTED') {
      console.log(`\n[NOT_EXECUTED] CROSS_STORE_IDENTITY_PROVEN gate deferred to Phase 2`);
      console.log('Phase 1 validates Postgres only. Phase 2+ will connect to Qdrant, Neo4j, Valkey.');
      process.exit(0);
    }

    if (!result.overall_pass) {
      console.error(`\n[FAILED] CROSS_STORE_IDENTITY_PROVEN gate did not pass`);
      process.exit(1);
    }

    console.log(`\n[PASSED] CROSS_STORE_IDENTITY_PROVEN gate completed successfully in ${durationMs}ms`);
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] CROSS_STORE_IDENTITY_PROVEN gate execution failed:');
    console.error(err instanceof Error ? err.message : String(err));
    if (isVerbose && err instanceof Error) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
