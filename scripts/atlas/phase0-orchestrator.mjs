#!/usr/bin/env node
/**
 * phase0-orchestrator.mjs
 *
 * Orchestrate all Phase 0 blocker diagnostics and fixes:
 * 1. Source_ref identity validation
 * 2. Qdrant CPU latency benchmark
 * 3. MCP transport health check
 * 4. Gemma4 callsite audit
 *
 * Run: node scripts/atlas/phase0-orchestrator.mjs [--fix]
 * --fix flag: also apply fixes (source_ref backfill)
 * Default: dry-run only (audit + benchmark, no writes)
 */

import { execSync } from 'child_process';

const DRY_RUN = !process.argv.includes('--fix');
const VERBOSE = process.argv.includes('--verbose');

function runCommand(description, command) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${description}`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    const output = execSync(command, {
      stdio: 'inherit',
      encoding: 'utf-8'
    });
    console.log(`✅ ${description} completed\n`);
    return { pass: true, description };
  } catch (err) {
    console.error(`❌ ${description} failed`);
    return { pass: false, description, error: err.message };
  }
}

async function orchestrate() {
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`PHASE 0 BLOCKER ORCHESTRATOR`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (audit & benchmark, no writes)' : 'FIX (apply backfills)'}`);
  console.log(`${'█'.repeat(70)}\n`);

  const results = [];

  // Phase 0.1: Source_ref identity validation
  const sourceRefCmd = DRY_RUN
    ? 'node scripts/atlas/validate-source-ref-identity.mjs'
    : 'node scripts/atlas/validate-source-ref-identity.mjs --fix';
  results.push(runCommand('PHASE 0.1: Source_ref Identity Validation', sourceRefCmd));

  // Phase 0.2: Qdrant CPU latency benchmark
  const qdrantCmd = VERBOSE
    ? 'node scripts/atlas/benchmark-qdrant-768-latency.mjs --verbose'
    : 'node scripts/atlas/benchmark-qdrant-768-latency.mjs';
  results.push(runCommand('PHASE 0.2: Qdrant 768-dim CPU Latency Benchmark', qdrantCmd));

  // Phase 0.3: MCP transport health check
  const mcpCmd = VERBOSE
    ? 'node scripts/atlas/health-check-mcp-transport.mjs --verbose'
    : 'node scripts/atlas/health-check-mcp-transport.mjs';
  results.push(runCommand('PHASE 0.3: MCP Transport Health Check', mcpCmd));

  // Phase 0.4: Gemma4 callsite audit
  const gemmaCmd = VERBOSE
    ? 'node scripts/atlas/audit-gemma4-callsites.mjs --verbose'
    : 'node scripts/atlas/audit-gemma4-callsites.mjs';
  results.push(runCommand('PHASE 0.4: Gemma4 Callsite Audit', gemmaCmd));

  // Summary
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`PHASE 0 ORCHESTRATOR SUMMARY`);
  console.log(`${'█'.repeat(70)}\n`);

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  results.forEach((result, i) => {
    const icon = result.pass ? '✅' : '❌';
    console.log(`${icon} [${i + 1}] ${result.description}`);
    if (!result.pass && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(70)}\n`);

  if (failed === 0) {
    console.log('✅ PHASE 0 COMPLETE — All blockers resolved');
    console.log('\n🚀 Ready for Phase 1-17 ingestion pipeline implementation');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run atlas:phase17:end-to-end:smoke');
    console.log('  2. Verify all 10 phases pass');
    console.log('  3. Begin Phase 1 implementation (OKF adapter, hyperrag.proto, etc.)');
    process.exit(0);
  } else {
    console.log('⚠️  PHASE 0 INCOMPLETE — Fix blocker(s) before proceeding');
    console.log('\nFailing checks:');
    results
      .filter(r => !r.pass)
      .forEach(r => {
        console.log(`  ❌ ${r.description}`);
      });
    process.exit(1);
  }
}

orchestrate().catch(err => {
  console.error('Orchestrator error:', err.message);
  process.exit(1);
});
