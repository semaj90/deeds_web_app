#!/usr/bin/env node

/**
 * Gate 12: Feature Extraction → SOM Clustering → Materialization
 *
 * Pipeline: Load packets → Extract features (40-dim) → K-Means cluster → Postgres UPDATE
 * Expected duration: 4-5 hours for 61,659 packets
 *
 * Usage:
 *   npx tsx scripts/atlas/gate-12-feature-extraction.mts --dry-run
 *   npx tsx scripts/atlas/gate-12-feature-extraction.mts --dry-run --limit=100
 *   npx tsx scripts/atlas/gate-12-feature-extraction.mts --apply
 *   npx tsx scripts/atlas/gate-12-feature-extraction.mts --apply --verbose
 */

import { FeatureExtractionOrchestrator } from '../../sveltekit-frontend/src/lib/server/ace/features/feature-extraction-orchestrator.js';
import { validateSomAssignment } from '../../sveltekit-frontend/src/lib/schemas/atlas_canonical_schema.js';

interface Gate12Options {
  dryRun: boolean;
  apply: boolean;
  limit?: number;
  verbose: boolean;
  skipDomain: boolean;
}

function parseArgs(): Gate12Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    apply: args.includes('--apply'),
    limit: parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0'),
    verbose: args.includes('--verbose'),
    skipDomain: args.includes('--skip-domain'),
  };
}

async function main() {
  const opts = parseArgs();

  if (!opts.dryRun && !opts.apply) {
    console.error('Error: Specify --dry-run or --apply');
    process.exit(1);
  }

  console.log('═'.repeat(80));
  console.log('GATE 12: FEATURE EXTRACTION → SOM CLUSTERING → MATERIALIZATION');
  console.log('═'.repeat(80));
  console.log();

  const orchestrator = new FeatureExtractionOrchestrator();

  const startTime = Date.now();

  try {
    const result = await orchestrator.orchestrate({
      dryRun: opts.dryRun,
      limit: opts.limit,
      verbose: opts.verbose,
      skipDomainClassification: opts.skipDomain,
    });

    console.log();
    console.log('═'.repeat(80));
    console.log('GATE 12 RESULTS');
    console.log('═'.repeat(80));
    console.log(`Total packets:        ${result.totalPackets}`);
    console.log(`Processed:            ${result.processed}`);
    console.log(`Features extracted:   ${result.featuresExtracted}`);
    console.log(`Clustered:            ${result.clustered}`);
    console.log(`Materialized:         ${result.materialized}`);
    console.log(`Failed:               ${result.failed}`);
    console.log(`Duration:             ${(result.duration / 1000).toFixed(2)}s`);
    console.log();

    if (result.errors.length > 0) {
      console.log(`ERRORS (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach(e => {
        console.log(`  ${e.packetKey}: ${e.error}`);
      });
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
      console.log();
    }

    // Verification gate
    if (opts.apply && result.materialized > 0) {
      const successRate = (result.materialized / result.totalPackets * 100).toFixed(1);
      console.log(`SUCCESS RATE: ${successRate}% (${result.materialized}/${result.totalPackets})`);

      if (parseFloat(successRate) >= 95) {
        console.log('✅ GATE 12 PASS: >95% materialization success');
        process.exit(0);
      } else if (parseFloat(successRate) >= 80) {
        console.log('⚠️  GATE 12 PARTIAL PASS: 80-95% success (review errors)');
        process.exit(0);
      } else {
        console.log('❌ GATE 12 FAIL: <80% success rate');
        process.exit(1);
      }
    } else if (opts.dryRun) {
      console.log('✅ DRY RUN COMPLETE: No writes performed');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ GATE 12 FATAL ERROR:', err);
    process.exit(1);
  }
}

main();
