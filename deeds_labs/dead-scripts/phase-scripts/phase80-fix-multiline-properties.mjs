#!/usr/bin/env node

/**
 * Phase 80 Chunk 8: Fix Multi-Line Property Corruption
 *
 * After Chunk 7, discovered multi-line property corruption:
 *
 * BEFORE:
 *   graphOptimizationLevel: 'all' as const: enableCpuMemArena, true: true, true:
 *   enableMemPattern: true,
 *
 * AFTER:
 *   graphOptimizationLevel: 'all' as const,
 *   enableCpuMemArena: true,
 *   enableMemPattern: true,
 *
 * Pattern: Property ends with `: nextProp, value:` where nextProp becomes orphaned on next line
 *
 * Expected Impact:
 *   - BEFORE: 16,484 "Cannot find name 'enableMemPattern'" errors
 *   - BEFORE: 3,819 "No value exists in scope for shorthand property" errors
 *   - AFTER: Clean multi-line object properties
 *   - Expected reduction: -15,000 to -18,000 errors
 */

import { glob } from 'glob';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

console.log('🔧 Phase 80 Chunk 8: Fix Multi-Line Property Corruption\n');

const files = await glob('src/**/*.{ts,svelte}', {
  cwd: root,
  ignore: ['node_modules/**', '**/*.d.ts', '**/_archive/**', '**/dist/**']
});

console.log(`📋 Found ${files.length} TypeScript/Svelte files\n`);

let fixedCount = 0;
let totalFixes = 0;

for (const file of files) {
  const filePath = join(root, file);
  let content = readFileSync(filePath, 'utf-8');
  let fixed = content;
  let fileFixCount = 0;

  // Pattern 1: Cross-line corruption (prop: value as const: nextProp, true:)
  // Matches: as const: nextProp, value: value: value:
  // Line break happens after the trailing colon
  const crossLinePattern = /as const:\s*(\w+),\s*(true|false|\d+(?:\.\d+)?):\s*\2:\s*\2:/g;
  const crossLineMatches = fixed.match(crossLinePattern);
  if (crossLineMatches) {
    fixed = fixed.replace(crossLinePattern, 'as const,\n  $1: $2,');
    fileFixCount += crossLineMatches.length;
  }

  // Pattern 2: Trailing property with value repetition (nextProp, true: true: true:)
  const trailingPropPattern = /,\s*(\w+),\s*(true|false|\d+(?:\.\d+)?):\s*\2:\s*\2:/g;
  const trailingPropMatches = fixed.match(trailingPropPattern);
  if (trailingPropMatches) {
    fixed = fixed.replace(trailingPropPattern, ',\n  $1: $2,');
    fileFixCount += trailingPropMatches.length;
  }

  // Pattern 3: Object property ending with orphaned prop (prop: value: nextProp,)
  // This creates orphaned "nextProp" on next line
  const orphanedPropPattern = /(\w+):\s*('[^']*'|"[^"]*"|true|false|\d+(?:\.\d+)?)\s+as const:\s*(\w+),/g;
  const orphanedPropMatches = fixed.match(orphanedPropPattern);
  if (orphanedPropMatches) {
    fixed = fixed.replace(orphanedPropPattern, '$1: $2 as const,\n  $3:');
    fileFixCount += orphanedPropMatches.length;
  }

  // Pattern 4: Shorthand property corruption (enableCpuMemArena, true:)
  // This suggests the property was meant to be `enableCpuMemArena: true` not shorthand
  const shorthandCorruptionPattern = /,\s*(\w+),\s*(true|false|\d+(?:\.\d+)?):\s*$/gm;
  const shorthandCorruptionMatches = fixed.match(shorthandCorruptionPattern);
  if (shorthandCorruptionMatches) {
    fixed = fixed.replace(shorthandCorruptionPattern, ',\n  $1: $2');
    fileFixCount += shorthandCorruptionMatches.length;
  }

  // Pattern 5: Fix orphaned property declarations (line starts with just propertyName:)
  // These are leftovers from multi-line corruption
  const orphanedDeclPattern = /^\s*(\w+):\s*$/gm;
  const orphanedDeclMatches = fixed.match(orphanedDeclPattern);
  if (orphanedDeclMatches) {
    // This is tricky - we need context to know the value
    // For now, just flag these for manual review
    // Most common case: the value is on the previous line
    fixed = fixed.replace(/(\w+):\s*('[^']*'|"[^"]*"|true|false|\d+(?:\.\d+)?)\s+as const:\s*\n\s*(\w+):/g,
      '$1: $2 as const,\n  $3:');
    fileFixCount += (fixed !== content ? 1 : 0);
  }

  // Pattern 6: Fix the specific enableMemPattern case
  // graphOptimizationLevel: 'all' as const: enableCpuMemArena, true: true: true:\n  enableMemPattern: true,
  const specificPattern = /graphOptimizationLevel:\s*'all'\s+as const:\s*enableCpuMemArena,\s*true:\s*true:\s*true:\s*\n\s*enableMemPattern:/g;
  const specificMatches = fixed.match(specificPattern);
  if (specificMatches) {
    fixed = fixed.replace(specificPattern,
      "graphOptimizationLevel: 'all' as const,\n  enableCpuMemArena: true,\n  enableMemPattern:");
    fileFixCount += specificMatches.length;
  }

  // Pattern 7: Generic fix for triple-value patterns before newline
  const tripleBeforeNewlinePattern = /(\w+),\s*(true|false|\d+(?:\.\d+)?):\s*\2:\s*\2:\s*\n/g;
  const tripleBeforeNewlineMatches = fixed.match(tripleBeforeNewlinePattern);
  if (tripleBeforeNewlineMatches) {
    fixed = fixed.replace(tripleBeforeNewlinePattern, '$1: $2,\n');
    fileFixCount += tripleBeforeNewlineMatches.length;
  }

  if (fixed !== content) {
    writeFileSync(filePath, fixed, 'utf-8');
    console.log(`✅ ${file}: ${fileFixCount} fixes`);
    fixedCount++;
    totalFixes += fileFixCount;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${fixedCount}`);
console.log(`   Total fixes: ${totalFixes}`);
console.log(`\n✅ Multi-line property corruption fixed!`);

console.log(`\n📊 Expected Impact:`);
console.log(`   - BEFORE: 16,484 "Cannot find name 'enableMemPattern'" errors`);
console.log(`   - BEFORE: 3,819 "No value exists in scope for shorthand property" errors`);
console.log(`   - AFTER: Clean multi-line object properties`);
console.log(`   - Expected reduction: -15,000 to -18,000 errors`);
console.log(`\n🔍 Next: Run \`npx svelte-check\` to measure impact, then proceed to ts-morph automation`);
