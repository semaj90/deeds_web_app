#!/usr/bin/env npx tsx
/**
 * Unified Registry Repair Loop Orchestrator
 *
 * Mastra workflow sequencing the registry enrichment pipeline:
 * 1. audit-validator-predicates — check validator rule consistency
 * 2. audit-joinability — verify packet_key + source_ref joins
 * 3. materialize-cheap-lanes — structural, lexical, domain projections
 * 4. rerun-validator — measure improvement after cheap lanes
 * 5. backfill-missing-embeddings — fill gaps in embedding coverage
 * 6. materialize-embedding-identity — embedding metadata projection
 * 7. materialize-topology — topology projection (tree_node_id, community, PR, SOM, KMeans)
 * 8. rerun-validator — measure improvement after topology
 * 9. daily-graphify — final Daily Graphify run
 *
 * This orchestrator does NOT recompute features itself; it only sequences
 * the domain-specific materializers.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RepairLoopStep {
  name: string;
  command?: string;
  args?: string[];
  description: string;
  critical: boolean;
  timeout_minutes: number;
}

interface RepairLoopResult {
  step: string;
  status: 'success' | 'failure' | 'skipped';
  duration_ms: number;
  validator_score_before?: number;
  validator_score_after?: number;
  error?: string;
}

const REPAIR_LOOP_STEPS: RepairLoopStep[] = [
  {
    name: 'audit-validator-predicates',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/audit-validator-predicates.mts'],
    description: 'Check validator rule consistency and predicate alignment',
    critical: true,
    timeout_minutes: 5,
  },
  {
    name: 'audit-joinability',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/audit-registry-enrichment-joins.mts'],
    description: 'Verify packet_key + source_ref join coverage',
    critical: true,
    timeout_minutes: 10,
  },
  {
    name: 'materialize-cheap-lanes',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/materialize-registry-structural-lexical-domain.mts'],
    description: 'Materialize structural, lexical, domain projections',
    critical: true,
    timeout_minutes: 30,
  },
  {
    name: 'rerun-validator-after-cheap',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/validate-feature-set-alignment.mts', '--quick'],
    description: 'Measure validator score improvement after cheap lanes',
    critical: false,
    timeout_minutes: 10,
  },
  {
    name: 'backfill-embeddings',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/backfill-missing-embeddings.mts'],
    description: 'Fill gaps in embedding coverage (if any)',
    critical: false,
    timeout_minutes: 60,
  },
  {
    name: 'materialize-embedding-identity',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/materialize-registry-embedding-identity.mts'],
    description: 'Materialize embedding metadata projection',
    critical: true,
    timeout_minutes: 20,
  },
  {
    name: 'materialize-topology',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/materialize-registry-topology.mts'],
    description: 'Materialize topology projection (tree_node_id, community, PR, SOM, KMeans)',
    critical: true,
    timeout_minutes: 20,
  },
  {
    name: 'rerun-validator-after-topology',
    command: 'npx',
    args: ['tsx', 'scripts/atlas/validate-feature-set-alignment.mts', '--full'],
    description: 'Measure final validator score improvement',
    critical: false,
    timeout_minutes: 15,
  },
  {
    name: 'daily-graphify',
    command: 'npm',
    args: ['run', 'graphify:daily'],
    description: 'Run Daily Graphify with all enrichment lanes',
    critical: true,
    timeout_minutes: 30,
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');
const isWindows = process.platform === 'win32';

function resolveSpawnCommand(command: string): string {
  if (!isWindows) return command;
  if (command === 'npx') return 'npx.cmd';
  if (command === 'npm') return 'npm.cmd';
  return command;
}

async function executeStep(step: RepairLoopStep): Promise<RepairLoopResult> {
  const startTime = Date.now();
  const command = resolveSpawnCommand(step.command || 'node');
  const args = step.args || [];

  return new Promise((resolve) => {
    console.log(`\n▶️  ${step.name}: ${step.description}`);

    console.log(`  $ ${command} ${args.join(' ')}`);

    const proc = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: step.timeout_minutes * 60 * 1000,
      windowsHide: true,
      shell: false,
    });

    proc.on('exit', (code) => {
      const duration = Date.now() - startTime;
      const status = code === 0 ? 'success' : 'failure';

      if (status === 'success') {
        console.log(`  ✅ ${step.name} completed in ${(duration / 1000).toFixed(1)}s`);
      } else {
        console.log(`  ❌ ${step.name} failed after ${(duration / 1000).toFixed(1)}s`);
      }

      resolve({
        step: step.name,
        status,
        duration_ms: duration,
      });
    });

    proc.on('error', (err) => {
      const duration = Date.now() - startTime;
      console.log(`  ❌ ${step.name} error: ${err.message}`);
      resolve({
        step: step.name,
        status: 'failure',
        duration_ms: duration,
        error: err.message,
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const skipNonCritical = args.includes('--skip-optional');
  const dryRun = args.includes('--dry-run');

  console.log('🔧 Unified Registry Repair Loop Orchestrator\n');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`Skip optional: ${skipNonCritical}\n`);

  const results: RepairLoopResult[] = [];
  let failedCount = 0;

  for (const step of REPAIR_LOOP_STEPS) {
    // Skip non-critical steps if requested
    if (skipNonCritical && !step.critical) {
      console.log(`⏭️  ${step.name}: skipped (optional)`);
      results.push({
        step: step.name,
        status: 'skipped',
        duration_ms: 0,
      });
      continue;
    }

    if (dryRun) {
      console.log(`📋 [DRY-RUN] ${step.name}`);
      results.push({
        step: step.name,
        status: 'skipped',
        duration_ms: 0,
      });
      continue;
    }

    const result = await executeStep(step);
    results.push(result);

    if (result.status === 'failure') {
      failedCount++;
      if (step.critical) {
        console.log(`\n🛑 Critical step failed: ${step.name}`);
        console.log('Repair loop aborted.\n');
        break;
      }
    }
  }

  // Summary report
  console.log('\n\n📊 Repair Loop Summary\n');
  console.log('Step Results:');
  results.forEach(r => {
    const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
    console.log(`  ${icon} ${r.step.padEnd(35)} ${r.status.padEnd(10)} (${(r.duration_ms / 1000).toFixed(1)}s)`);
  });

  const successCount = results.filter(r => r.status === 'success').length;
  const totalCount = results.filter(r => r.status !== 'skipped').length;

  console.log(`\n✅ Completed: ${successCount}/${totalCount}`);
  console.log(`⚠️  Failed: ${failedCount}`);

  if (dryRun) {
    console.log('\n📋 Dry-run complete. No steps were executed.');
    process.exit(0);
  }

  if (failedCount === 0 && successCount > 0) {
    console.log('\n🎉 All executed critical steps passed! Registry enrichment complete.');
    process.exit(0);
  } else {
    console.log('\n❌ Some critical steps failed or no steps executed. Review logs above.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
