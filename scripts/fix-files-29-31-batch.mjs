#!/usr/bin/env node
/**
 * Phase 96 Intelligent Corruption Fixer - Files 29, 30, 31
 *
 * Targets:
 * - File 29: cognitive-cache-integration.ts (336 errors)
 * - File 30: additional-tables.ts (335 errors)
 * - File 31: DecisionEngine.ts (335 errors)
 *
 * Multi-pass approach with pattern-specific fixes
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const FILES = [
  {
    path: 'src/lib/services/cognitive-cache-integration.ts',
    name: 'cognitive-cache-integration.ts',
    number: 29
  },
  {
    path: 'src/lib/server/db/additional-tables.ts',
    name: 'additional-tables.ts',
    number: 30
  },
  {
    path: 'src/lib/services/error-analysis/DecisionEngine.ts',
    name: 'DecisionEngine.ts',
    number: 31
  }
];

const ROOT = join(process.cwd(), 'sveltekit-frontend');

// Pattern fixes in priority order
const PATTERNS = [
  // 1. Colon chain corruption: `:` → `:`
  {
    name: 'colon_chains',
    regex: /:\s*:/g,
    replacement: ':'
  },
  // 2. Type annotation corruption: `name:type` → `name: type`
  {
    name: 'type_annotations',
    regex: /(\w+):([A-Z])/g,
    replacement: '$1: $2'
  },
  // 3. Missing commas in objects/arrays
  {
    name: 'missing_commas',
    regex: /([}\]'"`\w])\s*\n\s*([{['"A-Za-z])/g,
    replacement: '$1,\n$2'
  },
  // 4. Missing semicolons
  {
    name: 'missing_semicolons',
    regex: /([}\]'"`])\s*\n(\s*)(export |import |const |let |var |function |class |interface |type |async )/g,
    replacement: '$1;\n$2$3'
  },
  // 5. Object literal corruption: `{ key value }` → `{ key: value }`
  {
    name: 'object_literals',
    regex: /\{\s*(\w+)\s+([A-Z][a-zA-Z0-9<>[\]|&,\s]*)\s*\}/g,
    replacement: '{ $1: $2 }'
  }
];

function fixFile(filePath, fileName, fileNumber) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing File ${fileNumber}: ${fileName}`);
  console.log(`${'='.repeat(60)}`);

  const fullPath = join(ROOT, filePath);
  let content = readFileSync(fullPath, 'utf-8');
  const originalLength = content.length;
  let totalFixes = 0;
  let passNumber = 0;
  let previousContent = '';

  // Multi-pass fixing (max 4 passes)
  while (passNumber < 4 && content !== previousContent) {
    passNumber++;
    previousContent = content;
    let passFixes = 0;

    console.log(`\n--- Pass ${passNumber} ---`);

    for (const pattern of PATTERNS) {
      const before = content;
      content = content.replace(pattern.regex, pattern.replacement);
      const fixes = (before.length - content.length) / 2; // Rough estimate

      if (before !== content) {
        passFixes += Math.abs(fixes);
        console.log(`  ✓ ${pattern.name}: ~${Math.abs(Math.round(fixes))} fixes`);
      }
    }

    totalFixes += passFixes;
    console.log(`  Pass ${passNumber} total: ${Math.round(passFixes)} fixes`);

    // Stop if no changes in this pass
    if (content === previousContent) {
      console.log(`  → Converged after ${passNumber} passes`);
      break;
    }
  }

  // Write fixed content
  writeFileSync(fullPath, content, 'utf-8');

  const changePercent = ((originalLength - content.length) / originalLength * 100).toFixed(1);
  console.log(`\n✅ File ${fileNumber} Complete:`);
  console.log(`   Total fixes: ${Math.round(totalFixes)}`);
  console.log(`   Passes: ${passNumber}`);
  console.log(`   Size change: ${changePercent}%`);

  return {
    file: fileName,
    number: fileNumber,
    fixes: Math.round(totalFixes),
    passes: passNumber,
    changePercent: parseFloat(changePercent)
  };
}

// Process all files
console.log('🔧 Phase 96 Iligent Fixer - Files 29, 30, 31');
console.log('Starting batch processing...\n');

const results = FILES.map(file => fixFile(file.path, file.name, file.number));

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log('📊 BATCH SUMMARY');
console.log(`${'='.repeat(60)}`);

let totalFixes = 0;
results.forEach(r => {
  console.log(`File ${r.number} (${r.file}):`);
  console.log(`  ${r.fixes} fixes in ${r.passes} passes (${r.changePercent}% changed)`);
  totalFixes += r.fixes;
});

console.log(`\n🎯 Total: ${totalFixes} corruption patterns fixed`);
console.log(`✅ All files processed successfully!`);
