#!/usr/bin/env node
/**
 * Phase 2 - Master Fix Script
 *
 * Runs all Phase 2 fixes in sequence with validation
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXES = [
  {
    name: 'Bits UI Components',
    script: 'phase2-fix-bits-ui-components.mjs',
    description: 'Fix Bits UI v2.0 component imports (Dialog.Root → DialogRoot)'
  },
  {
    name: 'Syntax Errors',
    script: 'phase2-fix-syntax-errors.mjs',
    description: 'Fix Drizzle ORM array syntax and object literals'
  },
  {
    name: 'Null Safety',
    script: 'phase2-fix-null-safety.mjs',
    description: 'Fix "Cannot find name" errors with proper declarations'
  }
];

function runCommand(cmd, cwd) {
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, output: error.stdout || error.message };
  }
}

function getSvelteCheckCount() {
  console.log('Running svelte-check to count errors...');
  const result = runCommand(
    'npx svelte-check --threshold error --output machine 2>&1',
    path.join(__dirname, '..', 'sveltekit-frontend')
  );

  const match = result.output.match(/(\d+) ERRORS/);
  return match ? parseInt(match[1]) : 0;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Phase 2: Hybrid Error Fixing Approach             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Get baseline error count
  console.log('📊 Getting baseline error count...\n');
  const baselineErrors = getSvelteCheckCount();
  console.log(`   Baseline: ${baselineErrors.toLocaleString()} errors\n`);

  const results = [];

  // Run each fix script
  for (let i = 0; i < FIXES.length; i++) {
    const fix = FIXES[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Fix ${i + 1}/${FIXES.length}: ${fix.name}`);
    console.log(`Description: ${fix.description}`);
    console.log(`${'='.repeat(60)}\n`);

    const scriptPath = path.join(__dirname, fix.script);
    const result = runCommand(`node "${scriptPath}"`, __dirname);

    if (result.success) {
      console.log(result.output);

      // Get error count after this fix
      const errorsAfter = getSvelteCheckCount();
      const reduction = baselineErrors - errorsAfter;
      const percentReduction = ((reduction / baselineErrors) * 100).toFixed(2);

      results.push({
        name: fix.name,
        success: true,
        errorsAfter,
        reduction,
        percentReduction
      });

      console.log(`\n✓ ${fix.name} complete`);
      console.log(`   Errors after: ${errorsAfter.toLocaleString()}`);
      console.log(`   Reduction: ${reduction.toLocaleString()} (${percentReduction}%)\n`);
    } else {
      console.error(`✗ ${fix.name} failed:`);
      console.error(result.output);
      results.push({
        name: fix.name,
        success: false,
        error: result.output
      });
    }
  }

  // Final summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Baseline errors:  ${baselineErrors.toLocaleString()}`);

  const finalErrors = results[results.length - 1]?.errorsAfter || baselineErrors;
  const totalReduction = baselineErrors - finalErrors;
  const totalPercent = ((totalReduction / baselineErrors) * 100).toFixed(2);

  console.log(`Final errors:     ${finalErrors.toLocaleString()}`);
  console.log(`Total reduction:  ${totalReduction.toLocaleString()} (${totalPercent}%)`);
  console.log(`\nTarget: 59,829 errors (27,000 reduction from 86,829)`);
  console.log(`Progress: ${((totalReduction / 27000) * 100).toFixed(1)}% of Phase 2 goal\n`);

  // Individual fix results
  console.log('Fix Results:');
  results.forEach((result, i) => {
    if (result.success) {
      console.log(`  ${i + 1}. ${result.name}: -${result.reduction.toLocaleString()} (${result.percentReduction}%)`);
    } else {
      console.log(`  ${i + 1}. ${result.name}: FAILED`);
    }
  });

  // Save results to file
  const reportPath = path.join(__dirname, '..', 'PHASE2_FIX_RESULTS.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    baseline: baselineErrors,
    final: finalErrors,
    reduction: totalReduction,
    percentReduction: totalPercent,
    fixes: results
  }, null, 2));

  console.log(`\n📄 Results saved to: PHASE2_FIX_RESULTS.json`);
}

main().catch(console.error);
