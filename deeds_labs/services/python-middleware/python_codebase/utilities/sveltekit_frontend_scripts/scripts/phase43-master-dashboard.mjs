#!/usr/bin/env node
/**
 * Phase 43 — Master Dashboard & Orchestrator
 * Coordinates all fix scripts and tracks progress
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DASHBOARD_FILE = path.join(ROOT, 'PHASE43-DASHBOARD.json');

function runCommand(cmd, description) {
  console.log(`\n🔧 ${description}...`);
  try {
    const start = Date.now();
    const output = execSync(cmd, { 
      cwd: ROOT, 
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: 'pipe'
    });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ Complete in ${duration}s`);
    return { success: true, output, duration };
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message, output: error.stdout || '' };
  }
}

function parseSvelteCheckOutput(output) {
  const match = output.match(/found (\d+) errors? and (\d+) warnings? in (\d+) files?/);
  if (match) {
    return {
      errors: parseInt(match[1]),
      warnings: parseInt(match[2]),
      files: parseInt(match[3])
    };
  }
  return null;
}

async function runPhase43Pipeline() {
  const dashboard = {
    timestamp: new Date().toISOString(),
    phases: [],
    baseline: null,
    current: null,
    totalReduction: 0
  };
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 Phase 43 Master Pipeline — GPU-Accelerated Error Remediation`);
  console.log(`${'='.repeat(70)}\n`);
  
  // Phase 0: Get baseline
  console.log(`📊 Phase 0: Establishing Error Baseline`);
  const baseline = runCommand(
    'npx svelte-check 2>&1',
    'Running svelte-check (baseline)'
  );
  
  if (baseline.success || baseline.output) {
    const stats = parseSvelteCheckOutput(baseline.output);
    if (stats) {
      dashboard.baseline = stats;
      console.log(`\n   📈 Baseline: ${stats.errors.toLocaleString()} errors, ${stats.warnings.toLocaleString()} warnings`);
    }
  }
  
  fs.writeFileSync(
    path.join(ROOT, 'svelte-check-baseline.log'),
    baseline.output || baseline.error
  );
  
  // Phase 1: CSS Syntax Fixes
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Phase 1: CSS Syntax Remediation`);
  console.log(`${'='.repeat(70)}`);
  
  const cssFix = runCommand(
    'node scripts/phase43-css-syntax-fixer.mjs --apply',
    'Fixing CSS syntax errors'
  );
  
  dashboard.phases.push({
    phase: 1,
    name: 'CSS Syntax',
    ...cssFix
  });
  
  // Run prettier after CSS fixes
  runCommand(
    'npx prettier --write "src/**/*.svelte"',
    'Formatting Svelte files'
  );
  
  // Check progress
  const afterCss = runCommand(
    'npx svelte-check 2>&1',
    'Checking errors after CSS fixes'
  );
  
  if (afterCss.output) {
    const stats = parseSvelteCheckOutput(afterCss.output);
    if (stats && dashboard.baseline) {
      const reduction = dashboard.baseline.errors - stats.errors;
      console.log(`\n   📉 Reduction: ${reduction.toLocaleString()} errors (${((reduction / dashboard.baseline.errors) * 100).toFixed(1)}%)`);
      console.log(`   📊 Remaining: ${stats.errors.toLocaleString()} errors`);
      dashboard.phases[dashboard.phases.length - 1].reduction = reduction;
      dashboard.phases[dashboard.phases.length - 1].remaining = stats.errors;
    }
  }
  
  fs.writeFileSync(
    path.join(ROOT, 'svelte-check-after-css.log'),
    afterCss.output || afterCss.error
  );
  
  // Phase 2: Event Directive Check (should be 0)
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Phase 2: Event Directive Verification`);
  console.log(`${'='.repeat(70)}`);
  
  const eventCheck = runCommand(
    'node scripts/fix-event-directives.mjs',
    'Checking event directives'
  );
  
  dashboard.phases.push({
    phase: 2,
    name: 'Event Directives',
    ...eventCheck
  });
  
  // Phase 3: Async Effect Check (should be 0)
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Phase 3: Async Effect Verification`);
  console.log(`${'='.repeat(70)}`);
  
  const asyncCheck = runCommand(
    'node scripts/phase43-async-effects.mjs',
    'Checking async effects'
  );
  
  dashboard.phases.push({
    phase: 3,
    name: 'Async Effects',
    ...asyncCheck
  });
  
  // Final check
  const final = runCommand(
    'npx svelte-check 2>&1',
    'Final error check'
  );
  
  if (final.output) {
    const stats = parseSvelteCheckOutput(final.output);
    if (stats) {
      dashboard.current = stats;
      if (dashboard.baseline) {
        dashboard.totalReduction = dashboard.baseline.errors - stats.errors;
      }
    }
  }
  
  fs.writeFileSync(
    path.join(ROOT, 'svelte-check-final.log'),
    final.output || final.error
  );
  
  // Save dashboard
  fs.writeFileSync(DASHBOARD_FILE, JSON.stringify(dashboard, null, 2));
  
  // Print summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 Phase 43 Pipeline Complete`);
  console.log(`${'='.repeat(70)}\n`);
  
  if (dashboard.baseline && dashboard.current) {
    console.log(`   Baseline:       ${dashboard.baseline.errors.toLocaleString()} errors`);
    console.log(`   Current:        ${dashboard.current.errors.toLocaleString()} errors`);
    console.log(`   Total Reduction: ${dashboard.totalReduction.toLocaleString()} errors`);
    console.log(`   Improvement:    ${((dashboard.totalReduction / dashboard.baseline.errors) * 100).toFixed(2)}%\n`);
  }
  
  console.log(`📁 Logs saved:`);
  console.log(`   - svelte-check-baseline.log`);
  console.log(`   - svelte-check-after-css.log`);
  console.log(`   - svelte-check-final.log`);
  console.log(`   - PHASE43-DASHBOARD.json\n`);
  
  console.log(`🎯 Next Steps:`);
  console.log(`   1. Review PHASE43-DASHBOARD.json for detailed metrics`);
  console.log(`   2. Create module export fixer for next batch`);
  console.log(`   3. Run GPU analyzer: node scripts/phase43-gpu-json-parser.mjs`);
  console.log(`   4. Continue with type inference fixes\n`);
}

// Run pipeline
runPhase43Pipeline().catch(console.error);
