#!/usr/bin/env node

/**
 * Legacy Gate 4 PageRank simulation.
 *
 * IMPORTANT: this file never executed Neo4j GDS. Its historical --apply path
 * printed simulated phase timings, convergence values, scores, and database
 * updates. It is retained only as an explicit non-authoritative migration
 * marker. Canonical PageRank execution is owned by Parent Atlas Graph Analysis
 * through PageRankExecutionPlanV1 and the validated graph executor adapters.
 *
 * Usage:
 *   npx tsx scripts/atlas/compute-neo4j-pagerank.mts --dry-run
 *   npx tsx scripts/atlas/compute-neo4j-pagerank.mts --simulate
 *
 * --apply intentionally fails closed.
 */

interface LegacyGate4Options {
  dryRun: boolean;
  simulate: boolean;
  apply: boolean;
}

function parseArgs(): LegacyGate4Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    simulate: args.includes('--simulate'),
    apply: args.includes('--apply'),
  };
}

function printMigrationNotice(): void {
  console.log('═'.repeat(80));
  console.log('LEGACY PAGERANK SIMULATION — NON_AUTHORITATIVE');
  console.log('═'.repeat(80));
  console.log('algorithm_id: PAGERANK');
  console.log('executor_id: NON_AUTHORITATIVE_SIMULATION');
  console.log('canonical_run_owner: PARENT_ATLAS_GRAPH_ANALYSIS');
  console.log('canonical_receipt_eligible: false');
  console.log();
  console.log('Use the validated PageRankExecutionPlanV1 path for real computation.');
}

async function main(): Promise<void> {
  const options = parseArgs();
  printMigrationNotice();

  if (options.apply) {
    console.error('Refusing --apply: this legacy script does not execute Neo4j GDS and cannot produce canonical PageRank evidence.');
    process.exitCode = 2;
    return;
  }

  if (options.dryRun) {
    console.log('DRY RUN: migration marker only; no graph projection, PageRank computation, or database mutation occurred.');
    return;
  }

  if (options.simulate) {
    console.log(JSON.stringify({
      schema: 'atlas.legacy-pagerank-simulation.v1',
      algorithmId: 'PAGERANK',
      executorId: 'NON_AUTHORITATIVE_SIMULATION',
      canonicalRunOwner: 'PARENT_ATLAS_GRAPH_ANALYSIS',
      authoritative: false,
      writesCanonicalEvidence: false,
    }, null, 2));
    return;
  }

  console.error('Specify --dry-run or --simulate. --apply is intentionally disabled.');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Legacy PageRank marker failed:', error);
  process.exitCode = 1;
});
