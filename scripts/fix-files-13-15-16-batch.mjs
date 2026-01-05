#!/usr/bin/env node

/**
 * Phase 96: Intelligent Multi-Pass Corruption Fixer - Files 13, 15, 16
 *
 * Target Files:
 * - File 13: qlora-rl-langextract-integration.ts (409 errors)
 * - File 15: webgpu-simd-accelerator.ts (397 errors)
 * - File 16: webgpu-langchain-bridge.ts (396 errors)
 *
 * Expected Impact: ~1,200 errors fixed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_PASSES = 10;

// Target files from priority list
const TARGET_FILES = [
  {
    rank: 13,
    path: 'sveltekit-frontend/src/lib/services/qlora-rl-langextract-integration.ts',
    expectedErrors: 409
  },
  {
    rank: 15,
    path: 'sveltekit-frontend/src/lib/services/webgpu-simd-accelerator.ts',
    expectedErrors: 397
  },
  {
    rank: 16,
    path: 'sveltekit-frontend/src/lib/server/webgpu-langchain-bridge.ts',
    expectedErrors: 396
  }
];

// Pattern counters
const stats = {
  totalFiles: 0,
  totalPasses: 0,
  totalFixes: 0,
  patterns: {
    colonChains: 0,
    typeAnnotations: 0,
    missingCommas: 0,
    missingSemicolons: 0,
    objectLiterals: 0
  }
};

/**
 * Apply intelligent multi-pass fixes
 */
function applyFixes(content, filePath) {
  let fixed = content;
  let prevFixed = '';
  let passes = 0;
  const passStats = [];

  while (fixed !== prevFixed && passes < MAX_PASSES) {
    prevFixed = fixed;
    const passCount = {
      colonChains: 0,
      typeAnnotations: 0,
      missingCommas: 0,
      missingSemicolons: 0,
      objectLiterals: 0
    };

    // Pass 1: Fix colon chains (highest priority)
    const colonChainMatches = fixed.match(/:\s*(?=[A-Za-z_$])/g);
    if (colonChainMatches) {
      passCount.colonChains = colonChainMatches.length;
      fixed = fixed.replace(/:\s*(?=[A-Za-z_$])/g, ', ');
    }

    // Pass 2: Restore type annotations
    const typeAnnotationMatches = fixed.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>[\]|&]*)\s*=/g);
    if (typeAnnotationMatches) {
      passCount.typeAnnotations = typeAnnotationMatches.length;
      fixed = fixed.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>[\]|&]*)\s*=/g, '$1: $2 =');
    }

    // Pass 3: Fix missing commas in object literals
    const missingCommaMatches = fixed.match(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g);
    if (missingCommaMatches) {
      passCount.missingCommas = missingCommaMatches.length;
      fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g, '$1,\n  $2:');
    }

    // Pass 4: Fix missing semicolons
    const missingSemicolonMatches = fixed.match(/([^;{}\n])\s*\n\s*([a-zA-Z])/g);
    if (missingSemicolonMatches) {
      passCount.missingSemicolons = missingSemicolonMatches.length;
      fixed = fixed.replace(/([^;{}\n])\s*\n\s*([a-zA-Z])/g, '$1;\n  $2');
    }

    // Pass 5: Fix object literal syntax
    const objectLiteralMatches = fixed.match(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g);
    if (objectLiteralMatches) {
      passCount.objectLiterals = objectLiteralMatches.length;
      fixed = fixed.replace(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g, '{ $1: $2 }');
    }

    const totalPassFixes = Object.values(passCount).reduce((a, b) => a + b, 0);
    if (totalPassFixes > 0) {
      passes++;
      passStats.push({ pass: passes, ...passCount, total: totalPassFixes });

      stats.patterns.colonChains += passCount.colonChains;
      stats.patterns.typeAnnotations += passCount.typeAnnotations;
      stats.patterns.missingCommas += passCount.missingCommas;
      stats.patterns.missingSemicolons += passCount.missingSemicolons;
      stats.patterns.objectLiterals += passCount.objectLiterals;
    } else {
      break;
    }
  }

  return { fixed, passes, passStats };
}

/**
 * Process a single file
 */
function processFile(fileInfo) {
  const fullPath = path.resolve(__dirname, '..', fileInfo.path);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    return null;
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 Processing File ${fileInfo.rank}: ${path.basename(fileInfo.path)}`);
  console.log(`   Expected errors: ${fileInfo.expectedErrors}`);
  console.log(`${'='.repeat(80)}`);

  const originalContent = fs.readFileSync(fullPath, 'utf8');
  const originalLines = originalContent.split('\n').length;

  const { fixed, passes, passStats } = applyFixes(originalContent, fullPath);

  if (originalContent === fixed) {
    console.log('✅ No fixes needed - file is clean!');
    return null;
  }

  const fixedLines = fixed.split('\n').length;
  const totalFixes = passStats.reduce((sum, p) => sum + p.total, 0);
  const changedLines = originalContent.split('\n').filter((line, i) => line !== fixed.split('\n')[i]).length;
  const percentChanged = ((changedLines / originalLines) * 100).toFixed(1);

  console.log(`\n📊 Results:`);
  console.log(`   Passes: ${passes}`);
  console.log(`   Total fixes: ${totalFixes}`);
  console.log(`   Lines changed: ${changedLines}/${originalLines} (${percentChanged}%)`);

  console.log(`\n🔧 Pass Breakdown:`);
  passStats.forEach(p => {
    console.log(`   Pass ${p.pass}: ${p.total} fixes`);
    if (p.colonChains > 0) console.log(`      - Colon chains: ${p.colonChains}`);
    if (p.typeAnnotations > 0) console.log(`      - Type annotations: ${p.typeAnnotations}`);
    if (p.missingCommas > 0) console.log(`      - Missing commas: ${p.missingCommas}`);
    if (p.missingSemicolons > 0) console.log(`      - Missing semicolons: ${p.missingSemicolons}`);
    if (p.objectLiterals > 0) console.log(`      - Object literals: ${p.objectLiterals}`);
  });

  if (!DRY_RUN) {
    fs.writeFileSync(fullPath, fixed, 'utf8');
    console.log(`\n✅ File updated successfully!`);
  } else {
    console.log(`\n🔍 DRY RUN - No changes written`);
  }

  stats.totalFiles++;
  stats.totalPasses += passes;
  stats.totalFixes += totalFixes;

  return {
    file: fileInfo.path,
    rank: fileInfo.rank,
    expectedErrors: fileInfo.expectedErrors,
    passes,
    totalFixes,
    changedLines,
    percentChanged
  };
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Phase 96: Intelligent Multi-Pass Corruption Fixer');
  console.log('📋 Target: Files 13, 15, 16 from priority list');
  console.log(`⚙️  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const results = [];

  for (const fileInfo of TARGET_FILES) {
    const result = processFile(fileInfo);
    if (result) {
      results.push(result);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 BATCH SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log(`Files processed: ${stats.totalFiles}`);
  console.log(`Total passes: ${stats.totalPasses}`);
  console.log(`Total fixes: ${stats.totalFixes}`);
  console.log('');
  console.log('Pattern breakdown:');
  console.log(`  - Colon chains: ${stats.patterns.colonChains}`);
  console.log(`  - Type annotations: ${stats.patterns.typeAnnotations}`);
  console.log(`  - Missing commas: ${stats.patterns.missingCommas}`);
  console.log(`  - Missing semicolons: ${stats.patterns.missingSemicolons}`);
  console.log(`  - Object literals: ${stats.patterns.objectLiterals}`);
  console.log('');

  if (results.length > 0) {
    console.log('File Results:');
    results.forEach(r => {
      console.log(`  File ${r.rank}: ${r.totalFixes} fixes in ${r.passes} passes (${r.percentChanged}% changed)`);
    });
  }

  console.log(`\n${DRY_RUN ? '🔍 DRY RUN COMPLETE' : '✅ BATCH COMPLETE'}`);
  console.log(`${'='.repeat(80)}\n`);

  if (DRY_RUN) {
    console.log('💡 Run without --dry-run to apply fixes');
  } else {
    console.log('💡 Next: Commit changes and verify error count');
    console.log('   git add .');
    console.log('   git commit -m "Phase 96: Fix files 13, 15, 16 batch"');
    console.log('   git push origin svelte5-error-fixes');
  }
}

main();
