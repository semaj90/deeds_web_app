#!/usr/bin/env node
/**
 * Phase 96 Intelligent Fixer - Files 4-6 Batch
 * File 4: NESYoRHaHybrid3D.ts (714 errors)
 * File 5: NESYoRHaHybrid3D_FIXED.ts (709 errors)
 * File 6: CaseScoringService.ts (505 errors, partially fixed)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');

const TARGET_FILES = [
  {
    name: 'File 4: NESYoRHaHybrid3D.ts',
    path: path.join(__dirname, '../sveltekit-frontend/src/lib/components/three/yorha-ui/NESYoRHaHybrid3D.ts'),
    expectedErrors: 714
  },
  {
    name: 'File 5: NESYoRHaHybrid3D_FIXED.ts',
    path: path.join(__dirname, '../sveltekit-frontend/src/lib/components/three/yorha-ui/NESYoRHaHybrid3D_FIXED.ts'),
    expectedErrors: 709
  },
  {
    name: 'File 6: CaseScoringService.ts',
    path: path.join(__dirname, '../sveltekit-frontend/src/lib/server/services/CaseScoringService.ts'),
    expectedErrors: 505
  }
];

console.log('🔧 Phase 96 Intelligent Fixer - Files 4-6 Batch');
console.log(`🧪 Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

function applyFixes(content) {
  let fixed = content;
  let prevFixed = '';
  let passes = 0;
  const maxPasses = 10;
  const passStats = [];

  while (fixed !== prevFixed && passes < maxPasses) {
    prevFixed = fixed;
    passes++;

    const stats = { pass: passes, fixes: {} };

    // Pass 1: Fix colon chains (highest priority)
    const colonChainsBefore = (fixed.match(/:\s*(?=[A-Za-z_$])/g) || []).length;
    fixed = fixed.replace(/:\s*(?=[A-Za-z_$])/g, ', ');
    stats.fixes.colonChains = colonChainsBefore - (fixed.match(/:\s*(?=[A-Za-z_$])/g) || []).length;

    // Pass 2: Fix type annotations (restore first colon after identifier)
    const typeAnnotationsBefore = (fixed.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>]*)\s*=/g) || []).length;
    fixed = fixed.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>]*)\s*=/g, '$1: $2 =');
    stats.fixes.typeAnnotations = typeAnnotationsBefore - (fixed.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>]*)\s*=/g) || []).length;

    // Pass 3: Fix missing commas in object literals
    const missingCommasBefore = (fixed.match(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g) || []).length;
    fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g, '$1,\n  $2:');
    stats.fixes.missingCommas = missingCommasBefore - (fixed.match(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g) || []).length;

    // Pass 4: Fix missing semicolons
    const missingSemicolonsBefore = (fixed.match(/([^;{}\n])\s*\n\s*([a-zA-Z])/g) || []).length;
    fixed = fixed.replace(/([^;{}\n])\s*\n\s*([a-zA-Z])/g, '$1;\n  $2');
    stats.fixes.missingSemicolons = missingSemicolonsBefore - (fixed.match(/([^;{}\n])\s*\n\s*([a-zA-Z])/g) || []).length;

    // Pass 5: Fix object literal syntax
    const objectLiteralsBefore = (fixed.match(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g) || []).length;
    fixed = fixed.replace(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g, '{ $1: $2 }');
    stats.fixes.objectLiterals = objectLiteralsBefore - (fixed.match(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g) || []).length;

    stats.total = Object.values(stats.fixes).reduce((a, b) => a + b, 0);
    passStats.push(stats);

    if (stats.total === 0) {
      break;
    }
  }

  return { content: fixed, passes, passStats };
}

function countDiff(before, after) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  let changes = 0;

  for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
    if (beforeLines[i] !== afterLines[i]) {
      changes++;
    }
  }

  return changes;
}

// Main execution
const results = [];

for (const file of TARGET_FILES) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📁 ${file.name}`);
  console.log(`📍 ${path.basename(file.path)}`);
  console.log(`🎯 Expected errors: ${file.expectedErrors}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    if (!fs.existsSync(file.path)) {
      console.log(`⚠️  File not found, skipping...`);
      results.push({ file: file.name, status: 'skipped', reason: 'not found' });
      continue;
    }

    console.log('📖 Reading file...');
    const originalContent = fs.readFileSync(file.path, 'utf8');
    const originalLines = originalContent.split('\n').length;

    console.log(`📏 File size: ${originalLines} lines`);

    console.log('\n🚀 Applying fixes...');
    const { content: fixedContent, passes, passStats } = applyFixes(originalContent);

    // Print pass statistics
    passStats.forEach(stat => {
      console.log(`\n🔄 Pass ${stat.pass}:`);
      console.log(`  ✓ Colon chains: ${stat.fixes.colonChains}`);
      console.log(`  ✓ Type annotations: ${stat.fixes.typeAnnotations}`);
      console.log(`  ✓ Missing commas: ${stat.fixes.missingCommas}`);
      console.log(`  ✓ Missing semicolons: ${stat.fixes.missingSemicolons}`);
      console.log(`  ✓ Object literals: ${stat.fixes.objectLiterals}`);
      console.log(`  📊 Total: ${stat.total}`);
    });

    const totalFixes = passStats.reduce((sum, stat) => sum + stat.total, 0);
    const changedLines = countDiff(originalContent, fixedContent);
    const percentChanged = ((changedLines / originalLines) * 100).toFixed(1);

    console.log(`\n📊 Summary:`);
    console.log(`  • Total passes: ${passes}`);
    console.log(`  • Total fixes: ${totalFixes}`);
    console.log(`  • Lines changed: ${changedLines} (${percentChanged}%)`);
    console.log(`  • Original size: ${originalLines} lines`);
    console.log(`  • Fixed size: ${fixedContent.split('\n').length} lines`);

    if (originalContent === fixedContent) {
      console.log('\n✅ No changes needed - file is already clean!');
      results.push({ file: file.name, status: 'clean', fixes: 0 });
      continue;
    }

    if (!DRY_RUN) {
      console.log('\n💾 Writing fixed file...');
      fs.writeFileSync(file.path, fixedContent, 'utf8');
      console.log('✅ File updated successfully!');
    }

    results.push({
      file: file.name,
      status: 'fixed',
      fixes: totalFixes,
      passes,
      changedLines,
      percentChanged
    });

  } catch (error) {
    console.error(`\n❌ Error processing ${file.name}:`, error.message);
    results.push({ file: file.name, status: 'error', error: error.message });
  }
}

// Print final summary
console.log(`\n${'='.repeat(80)}`);
console.log('📊 BATCH PROCESSING SUMMARY');
console.log(`${'='.repeat(80)}\n`);

const totalFixes = results.reduce((sum, r) => sum + (r.fixes || 0), 0);
const successCount = results.filter(r => r.status === 'fixed').length;

results.forEach(result => {
  const statusIcon = {
    'fixed': '✅',
    'clean': '✨',
    'skipped': '⏭️',
    'error': '❌'
  }[result.status] || '❓';

  console.log(`${statusIcon} ${result.file}`);
  if (result.status === 'fixed') {
    console.log(`   ${result.fixes} fixes in ${result.passes} passes (${result.percentChanged}% changed)`);
  } else if (result.status === 'error') {
    console.log(`   Error: ${result.error}`);
  }
});

console.log(`\n📈 Overall Statistics:`);
console.log(`  • Files processed: ${results.length}`);
console.log(`  • Files fixed: ${successCount}`);
console.log(`  • Total fixes applied: ${totalFixes}`);
console.log(`  • Expected error reduction: ~${TARGET_FILES.reduce((sum, f) => sum + f.expectedErrors, 0)} → ~${TARGET_FILES.reduce((sum, f) => sum + f.expectedErrors, 0) - totalFixes}`);

if (DRY_RUN) {
  console.log('\n🧪 DRY RUN - No files modified');
  console.log('   Run without --dry-run to apply changes');
} else {
  console.log('\n📝 Next steps:');
  console.log('   1. Run: npx svelte-check --output human 2>&1 | grep -E "(NESYoRHa|CaseScoringService)"');
  console.log('   2. Verify error counts reduced');
  console.log('   3. Commit: git add . && git commit -m "Phase 96: Fix files 4-6 batch"');
}

process.exit(results.some(r => r.status === 'error') ? 1 : 0);
