#!/usr/bin/env node
/**
 * Phase 89: Targeted Cluster Fixes Based on ACE Analysis
 *
 * Implements recommendation iterations from ACE contextual engineering
 *
 * Cluster 1: Split Global Selectors (`: global(` → `:global(`)
 * Cluster 2: Other CSS parsing errors
 * Cluster 3: TypeScript type errors
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('\n🎯 Phase 89: Targeted Cluster Fixes\n');
console.log('Based on ACE contextual analysis recommendations\n');
console.log('═'.repeat(60));

// ============================================================================
// Cluster 1: Split Global Selectors
// ============================================================================
async function fixSplitGlobalSelectors() {
  console.log('\n📊 Cluster 1: Split Global Selectors');
  console.log('Pattern: `: global(` → `:global(`\n');

  const cssFiles = await glob('**/*.{css,svelte}', {
    ignore: ['node_modules/**', 'build/**', '.svelte-kit/**'],
    absolute: true
  });

  let fixCount = 0;
  const fixedFiles = [];

  for (const file of cssFiles) {
    const content = readFileSync(file, 'utf-8');

    // Pattern 1: : global( with space
    const pattern1 = /:\s+global\(/g;
    // Pattern 2: : global with space
    const pattern2 = /:\s+global\s/g;

    if (pattern1.test(content) || pattern2.test(content)) {
      const fixed = content
        .replace(pattern1, ':global(')
        .replace(pattern2, ':global ');

      writeFileSync(file, fixed, 'utf-8');
      fixedFiles.push(file.replace(process.cwd() + '\\', ''));

      // Count number of fixes in this file
      const matches = (content.match(pattern1) || []).length + (content.match(pattern2) || []).length;
      fixCount += matches;
    }
  }

  console.log(`✅ Fixed ${fixCount} split global selectors in ${fixedFiles.length} files\n`);

  if (fixedFiles.length > 0) {
    console.log('Files modified:');
    fixedFiles.slice(0, 10).forEach(f => console.log(`   - ${f}`));
    if (fixedFiles.length > 10) {
      console.log(`   ... and ${fixedFiles.length - 10} more`);
    }
  }

  return { fixCount, files: fixedFiles };
}

// ============================================================================
// Cluster 2: Malformed Keyframes
// ============================================================================
async function fixMalformedKeyframes() {
  console.log('\n📊 Cluster 2: Malformed Keyframes');
  console.log('Pattern: `<percentage>%` within keyframes\n');

  const cssFiles = await glob('**/*.{css,svelte}', {
    ignore: ['node_modules/**', 'build/**', '.svelte-kit/**'],
    absolute: true
  });

  let fixCount = 0;
  const fixedFiles = [];

  for (const file of cssFiles) {
    const content = readFileSync(file, 'utf-8');

    // Pattern: "50"% (quoted percentage in keyframes)
    const pattern = /"(\d+)"%/g;

    if (pattern.test(content)) {
      const fixed = content.replace(pattern, '$1%');

      writeFileSync(file, fixed, 'utf-8');
      fixedFiles.push(file.replace(process.cwd() + '\\', ''));

      const matches = (content.match(pattern) || []).length;
      fixCount += matches;
    }
  }

  console.log(`✅ Fixed ${fixCount} malformed keyframes in ${fixedFiles.length} files\n`);

  return { fixCount, files: fixedFiles };
}

// ============================================================================
// Cluster 3: TypeScript TS1005 (Missing commas/semicolons)
// ============================================================================
async function fixTS1005Errors() {
  console.log('\n📊 Cluster 3: TypeScript TS1005 Errors');
  console.log('Pattern: Missing commas and semicolons\n');

  // Run svelte-check to get TS1005 errors
  let errors = [];
  try {
    execSync('npx svelte-check --threshold error', { encoding: 'utf-8' });
  } catch (e) {
    const output = e.stdout || e.stderr || '';
    const matches = output.matchAll(/(.+?)\((\d+),(\d+)\):\s+error TS1005:\s+(.+)/g);
    for (const match of matches) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        message: match[4]
      });
    }
  }

  const ts1005Errors = errors.filter(e => e.message.includes('expected'));
  console.log(`Found ${ts1005Errors.length} TS1005 errors`);

  if (ts1005Errors.length === 0) {
    console.log('✅ No TS1005 errors to fix\n');
    return { fixCount: 0, files: [] };
  }

  // Group by file
  const fileGroups = {};
  for (const error of ts1005Errors.slice(0, 50)) { // Limit to 50
    if (!fileGroups[error.file]) {
      fileGroups[error.file] = [];
    }
    fileGroups[error.file].push(error);
  }

  let fixCount = 0;
  const fixedFiles = [];

  for (const [file, fileErrors] of Object.entries(fileGroups)) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (const error of fileErrors) {
        const line = lines[error.line - 1];
        if (!line) continue;

        // Pattern: ',' expected
        if (error.message.includes("',' expected")) {
          // Find likely locations for missing comma (before word boundaries)
          const fixed = line.replace(/(\w+:\s*[^,\s]+)\s+(\w+:)/g, '$1, $2');
          if (fixed !== line) {
            lines[error.line - 1] = fixed;
            fixCount++;
          }
        }

        // Pattern: ';' expected
        if (error.message.includes("';' expected")) {
          // Add semicolon at end if missing
          const fixed = line.replace(/(\w+:\s*\w+)\s*$/g, '$1;');
          if (fixed !== line) {
            lines[error.line - 1] = fixed;
            fixCount++;
          }
        }
      }

      writeFileSync(file, lines.join('\n'), 'utf-8');
      fixedFiles.push(file.replace(process.cwd() + '\\', ''));
    } catch (e) {
      console.error(`❌ Error fixing ${file}: ${e.message}`);
    }
  }

  console.log(`✅ Fixed ${fixCount} TS1005 errors in ${fixedFiles.length} files\n`);

  return { fixCount, files: fixedFiles };
}

// ============================================================================
// Main Execution
// ============================================================================
async function main() {
  const startTime = Date.now();

  console.log('\n🚀 Starting targeted cluster fixes...\n');

  // Get initial error count
  let initialErrors = 0;
  try {
    execSync('npx svelte-check --threshold error', { encoding: 'utf-8' });
  } catch (e) {
    const match = (e.stdout || e.stderr || '').match(/found (\d+) errors/);
    if (match) {
      initialErrors = parseInt(match[1]);
    }
  }

  console.log(`📊 Initial error count: ${initialErrors.toLocaleString()}\n`);

  // Run cluster fixes
  const results = {
    cluster1: await fixSplitGlobalSelectors(),
    cluster2: await fixMalformedKeyframes(),
    cluster3: await fixTS1005Errors()
  };

  // Get final error count
  let finalErrors = 0;
  try {
    execSync('npx svelte-check --threshold error', { encoding: 'utf-8' });
  } catch (e) {
    const match = (e.stdout || e.stderr || '').match(/found (\d+) errors/);
    if (match) {
      finalErrors = parseInt(match[1]);
    }
  }

  const totalFixes = results.cluster1.fixCount + results.cluster2.fixCount + results.cluster3.fixCount;
  const errorReduction = initialErrors - finalErrors;
  const reductionPct = ((errorReduction / initialErrors) * 100).toFixed(1);

  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 Summary\n');
  console.log(`Total fixes applied: ${totalFixes}`);
  console.log(`  - Cluster 1 (Split global selectors): ${results.cluster1.fixCount}`);
  console.log(`  - Cluster 2 (Malformed keyframes): ${results.cluster2.fixCount}`);
  console.log(`  - Cluster 3 (TS1005 errors): ${results.cluster3.fixCount}`);
  console.log(`\nError count: ${initialErrors.toLocaleString()} → ${finalErrors.toLocaleString()}`);
  console.log(`Reduction: ${errorReduction.toLocaleString()} errors (-${reductionPct}%)`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Duration: ${duration}s`);
  console.log('\n✅ Targeted cluster fixes complete!\n');

  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    duration: parseFloat(duration),
    initialErrors,
    finalErrors,
    errorReduction,
    reductionPercentage: parseFloat(reductionPct),
    clusters: results
  };

  writeFileSync(
    'reports/phase89-cluster-fixes-iteration-1.json',
    JSON.stringify(report, null, 2)
  );

  console.log('📊 Results saved to reports/phase89-cluster-fixes-iteration-1.json\n');
}

main().catch(console.error);
