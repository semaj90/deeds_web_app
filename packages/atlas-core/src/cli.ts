#!/usr/bin/env node

/**
 * Workstation Orchestrator CLI
 *
 * Entry point for running the full Phase 85 P5-P9 workstation pipeline.
 *
 * Usage:
 *   workstation-orchestrator [--dry-run] [--limit 1000] [--gpu] [--verbose]
 */

import { WorkstationOrchestrator } from './workstation-orchestrator.js';

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isVerbose = args.includes('--verbose');
  const enableGPU = !args.includes('--no-gpu');
  const enableBitFrost = !args.includes('--no-bitfrost');
  const enableKAG = !args.includes('--no-kag');

  // Parse limit
  let limit = 10000;
  const limitIdx = args.findIndex((a) => a === '--limit');
  if (limitIdx >= 0 && limitIdx + 1 < args.length) {
    limit = parseInt(args[limitIdx + 1], 10);
  }

  const config = {
    limit,
    enableGPU,
    enableBitFrost,
    enableKAG
  };

  const orchestrator = new WorkstationOrchestrator(config);

  try {
    if (isVerbose) {
      console.log('🔧 Configuration:', config);
      console.log('📋 Starting workstation orchestration...\n');
    }

    const results = await orchestrator.orchestrate();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 ORCHESTRATION SUMMARY');
    console.log('='.repeat(70));

    for (const result of results) {
      console.log(`\n✅ ${result.taskType}`);
      console.log(`   Packets: ${result.packets.length}`);
      console.log(`   Score: ${result.classificationScore.toFixed(3)}`);
      console.log(`   Batches: ${result.batchCount}`);
      console.log(`   Workload: ${result.workload}`);
      console.log(`   Handler: ${result.handler}`);
      console.log(`   Cache warmed: ${result.cacheWarmed ? 'yes' : 'no'}`);
      console.log(`   DAG hits: ${result.dagHits}`);
      if (isVerbose && result.trace) {
        console.log(`   Stages: ${result.trace.stages.join(' → ')}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`✨ Total: ${results.length} task types processed`);
    console.log(`📦 Total packets: ${results.reduce((sum, r) => sum + r.packets.length, 0)}`);
    console.log('='.repeat(70) + '\n');

    await orchestrator.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Orchestration failed:', err);
    await orchestrator.close();
    process.exit(1);
  }
}

main();