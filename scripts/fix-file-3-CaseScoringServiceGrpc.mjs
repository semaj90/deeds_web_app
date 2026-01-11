#!/usr/bin/env node
/**
 * Phase 96 Intelligent Fixer - File 3: CaseScoringServiceGrpc.ts
 * Target: 1,013 errors
 * Patterns: colon chains, missing commas, missing semicolons
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_FILE = path.join(__dirname, '../sveltekit-frontend/src/lib/server/services/CaseScoringServiceGrpc.ts');

console.log('🔧 Phase 96 Intelligent Fixer - File 3');
console.log(`📁 Target: ${TARGET_FILE}`);
console.log(`🧪 Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

function applyFixes(content) {
  let fixed = content;
  let prevFixed = '';
  let passes = 0;
  const maxPasses = 10;

  while (fixed !== prevFixed && passes < maxPasses) {
    prevFixed = fixed;
    passes++;

    console.log(`\n🔄 Pass ${passes}:`);

    // Pass 1: Fix colon chains (highest priority)
    // Pattern: `: ` followed by identifier → `, `
    const colonChainsBefore = (fixed.match(/:\s*(?=[A-Za-z_$])/g) || []).length;
    fixed = fixed.replace(/:\s*(?=[A-Za-z_$])/g, ', ');
    const colonChainsFixed = colonChainsBefore - (fixed.match(/:\s*(?=[A-Za-z_$])/g) || []).length;
    console.log(`  ✓ Colon chains: ${colonChainsFixed} fixes`);

    // Pass 2: Fix type annotations (restore first colon after identifier)
    // Pattern: `identifier, Type =` → `identifier: Type =`
    const typeAnnotationsBefore = (fixed.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>]*)\s*=/g) || []).length;
    fixed = fixed.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>]*)\s*=/g, '$1: $2 =');
    const typeAnnotationsFixed = typeAnnotationsBefore - (fixed.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([A-Z][a-zA-Z0-9_$<>]*)\s*=/g) || []).length;
    console.log(`  ✓ Type annotations: ${typeAnnotationsFixed} fixes`);

    // Pass 3: Fix missing commas in object literals
    // Pattern: property on one line, property on next line without comma
    const missingCommasBefore = (fixed.match(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g) || []).length;
    fixed = fixed.replace(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g, '$1,\n  $2:');
    const missingCommasFixed = missingCommasBefore - (fixed.match(/([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g) || []).length;
    console.log(`  ✓ Missing commas: ${missingCommasFixed} fixes`);

    // Pass 4: Fix missing semicolons
    // Pattern: statement without semicolon followed by newline and identifier
    const missingSemicolonsBefore = (fixed.match(/([^;{}\n])\s*\n\s*([a-zA-Z])/g) || []).length;
    fixed = fixed.replace(/([^;{}\n])\s*\n\s*([a-zA-Z])/g, '$1;\n  $2');
    const missingSemicolonsFixed = missingSemicolonsBefore - (fixed.match(/([^;{}\n])\s*\n\s*([a-zA-Z])/g) || []).length;
    console.log(`  ✓ Missing semicolons: ${missingSemicolonsFixed} fixes`);

    // Pass 5: Fix object literal syntax
    // Pattern: `{ key value }` → `{ key: value }`
    const objectLiteralsBefore = (fixed.match(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g) || []).length;
    fixed = fixed.replace(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g, '{ $1: $2 }');
    const objectLiteralsFixed = objectLiteralsBefore - (fixed.match(/{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s+([^:}]+)\s*}/g) || []).length;
    console.log(`  ✓ Object literals: ${objectLiteralsFixed} fixes`);

    const totalPassFixes = colonChainsFixed + typeAnnotationsFixed + missingCommasFixed + missingSemicolonsFixed + objectLiteralsFixed;
    console.log(`  📊 Total fixes this pass: ${totalPassFixes}`);

    if (totalPassFixes === 0) {
      console.log(`  ✅ No more fixes needed`);
      break;
    }
  }

  return { content: fixed, passes };
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
try {
  console.log('📖 Reading file...');
  const originalContent = fs.readFileSync(TARGET_FILE, 'utf8');
  const originalLines = originalContent.split('\n').length;

  console.log(`📏 File size: ${originalLines} lines`);

  console.log('\n🚀 Applying fixes...');
  const { content: fixedContent, passes } = applyFixes(originalContent);

  const changedLines = countDiff(originalContent, fixedContent);
  const percentChanged = ((changedLines / originalLines) * 100).toFixed(1);

  console.log(`\n📊 Summary:`);
  console.log(`  • Total passes: ${passes}`);
  console.log(`  • Lines changed: ${changedLines} (${percentChanged}%)`);
  console.log(`  • Original size: ${originalLines} lines`);
  console.log(`  • Fixed size: ${fixedContent.split('\n').length} lines`);

  if (originalContent === fixedContent) {
    console.log('\n✅ No changes needed - file is already clean!');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN - No files modified');
    console.log('   Run without --dry-run to apply changes');
  } else {
    console.log('\n💾 Writing fixed file...');
    fs.writeFileSync(TARGET_FILE, fixedContent, 'utf8');
    console.log('✅ File updated successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run: npx svelte-check --output human 2>&1 | grep CaseScoringServiceGrpc');
    console.log('   2. Verify error count reduced');
    console.log('   3. Commit: git add . && git commit -m "Phase 96: Fix file 3 - CaseScoringServiceGrpc.ts"');
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}
