#!/usr/bin/env node

/**
 * Phase 80 Chunk 10: Syntax Mojibake Fixer
 *
 * Target: 27,675 syntax corruption errors
 *   - ',' expected: 21,464 errors
 *   - ';' expected: 6,211 errors
 *
 * Common Patterns:
 * 1. Missing comma in object literals: { prop1: 'value' prop2: 'value' }
 * 2. Missing semicolon after statements: const x = 1 const y = 2
 * 3. Extra/misplaced punctuation from mojibake
 *
 * Strategy:
 * - Focus on top 100 broken files first
 * - Use regex patterns to detect and fix common syntax issues
 * - Dry-run mode to verify fixes before applying
 *
 * Expected Impact:
 *   - BEFORE: 84,242 total errors
 *   - AFTER: <70,000 errors (-14,000+ from syntax fixes)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

console.log(`🔧 Phase 80 Chunk 10: Syntax Mojibake Fixer${dryRun ? ' (DRY RUN)' : ''}\n`);

// Read stratification report to get top broken files
const reportPath = join(root, 'phase80-stratification-report.json');
const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

// Get top 100 broken files
const topFiles = report.topFiles
  .slice(0, 100)
  .map(f => ({ path: join(root, f.file), errors: f.errorCount }));

console.log(`📋 Processing top ${topFiles.length} broken files\n`);

const SYNTAX_PATTERNS = [
  // Pattern 1: Missing comma between object properties
  // { prop1: 'value' prop2: 'value' } → { prop1: 'value', prop2: 'value' }
  {
    name: 'Missing comma in object literal',
    find: /(\w+):\s*('[^']*'|"[^"]*"|true|false|\d+(?:\.\d+)?|\[[^\]]*\])\s+(\w+):/g,
    replace: (match, prop1, value, prop2) => {
      // Only fix if this looks like an object property (not a label or type annotation)
      if (value.match(/^['"\d\[]/) || value === 'true' || value === 'false') {
        return `${prop1}: ${value}, ${prop2}:`;
      }
      return match;
    },
    description: 'Add missing comma between object properties'
  },

  // Pattern 2: Missing semicolon between statements
  // const x = 1 const y = 2 → const x = 1; const y = 2
  {
    name: 'Missing semicolon between statements',
    find: /\}\s+(const|let|var|function|class|export|import)\s/g,
    replace: '}; $1 ',
    description: 'Add semicolon after closing brace before new statement'
  },

  // Pattern 3: Missing semicolon after simple statements
  // const x = value\n → const x = value;\n
  {
    name: 'Missing semicolon after const/let/var',
    find: /(const|let|var)\s+(\w+)\s*=\s*([^;]+)\n/g,
    replace: (match, keyword, varName, value) => {
      // Check if value doesn't end with { (which would be a block)
      if (!value.trim().endsWith('{') && !value.trim().endsWith(',')) {
        return `${keyword} ${varName} = ${value};\n`;
      }
      return match;
    },
    description: 'Add semicolon after variable declarations'
  },

  // Pattern 4: Missing comma in function parameters
  // function foo(a: string b: number) → function foo(a: string, b: number)
  {
    name: 'Missing comma in function parameters',
    find: /\(([^)]+)\)/g,
    replace: (match, params) => {
      // Fix params that look like: "a: string b: number"
      const fixed = params.replace(/(\w+):\s*(\w+)\s+(\w+):/g, '$1: $2, $3:');
      return `(${fixed})`;
    },
    description: 'Add missing comma between function parameters'
  },

  // Pattern 5: Missing comma in array literals
  // [item1 item2 item3] → [item1, item2, item3]
  {
    name: 'Missing comma in array literal',
    find: /\[([^\]]+)\]/g,
    replace: (match, items) => {
      // Fix arrays that look like: "'value1' 'value2'"
      const fixed = items.replace(/('[^']*'|"[^"]*"|\d+)\s+('[^']*'|"[^"]*"|\d+)/g, '$1, $2');
      return `[${fixed}]`;
    },
    description: 'Add missing comma between array items'
  },

  // Pattern 6: Duplicate punctuation from mojibake
  // prop: value,, → prop: value,
  {
    name: 'Remove duplicate commas',
    find: /,\s*,+/g,
    replace: ',',
    description: 'Remove duplicate commas'
  },

  // Pattern 7: Duplicate semicolons
  // statement;;; → statement;
  {
    name: 'Remove duplicate semicolons',
    find: /;\s*;+/g,
    replace: ';',
    description: 'Remove duplicate semicolons'
  }
];

let totalFilesProcessed = 0;
let totalFilesModified = 0;
let totalFixes = 0;
const fixSummary = {};

for (const {path: filePath, errors} of topFiles) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.svelte')) {
    continue; // Skip non-TypeScript/Svelte files
  }

  try {
    let content = readFileSync(filePath, 'utf-8');
    let fixed = content;
    let fileFixes = 0;

    for (const pattern of SYNTAX_PATTERNS) {
      const before = fixed;

      if (typeof pattern.replace === 'function') {
        fixed = fixed.replace(pattern.find, pattern.replace);
      } else {
        fixed = fixed.replace(pattern.find, pattern.replace);
      }

      if (fixed !== before) {
        const matchCount = (before.match(pattern.find) || []).length;
        fileFixes += matchCount;
        fixSummary[pattern.name] = (fixSummary[pattern.name] || 0) + matchCount;

        if (verbose) {
          console.log(`   ${pattern.name}: ${matchCount} fixes`);
        }
      }
    }

    if (fixed !== content) {
      const relativePath = filePath.replace(root, '').replace(/\\/g, '/').substring(1);

      if (dryRun) {
        console.log(`🔍 [DRY RUN] ${relativePath}: ${fileFixes} potential fixes (${errors} errors)`);
      } else {
        writeFileSync(filePath, fixed, 'utf-8');
        console.log(`✅ ${relativePath}: ${fileFixes} fixes (${errors} errors)`);
      }

      totalFilesModified++;
      totalFixes += fileFixes;
    }

    totalFilesProcessed++;
  } catch (err) {
    console.log(`❌ Error processing ${filePath}: ${err.message}`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files processed: ${totalFilesProcessed}`);
console.log(`   Files ${dryRun ? 'to modify' : 'modified'}: ${totalFilesModified}`);
console.log(`   Total fixes: ${totalFixes}`);

if (Object.keys(fixSummary).length > 0) {
  console.log(`\n🔧 Fix Breakdown:`);
  for (const [patternName, count] of Object.entries(fixSummary).sort((a, b) => b[1] - a[1])) {
    console.log(`   • ${patternName}: ${count} fixes`);
  }
}

if (dryRun) {
  console.log(`\n✅ Dry run complete! Review the proposed changes above.`);
  console.log(`   Run without --dry-run to apply fixes.`);
} else {
  console.log(`\n✅ Syntax mojibake fixes applied!`);
  console.log(`\n📊 Expected Impact:`);
  console.log(`   - BEFORE: 84,242 total errors`);
  console.log(`   - Target: <70,000 errors (-14,000+ from syntax fixes)`);
  console.log(`\n🔍 Next: Run \`npx svelte-check\` to measure actual impact`);
}
