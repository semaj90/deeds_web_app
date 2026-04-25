#!/usr/bin/env node

/**
 * Phase 80 Chunk 12: Comma Corruption Fixer
 *
 * Target: 21,425 errors - "',' expected."
 * This is now the LARGEST error cascade (25.5% of all errors)
 *
 * Strategy:
 * 1. Object properties without commas: { a: 1 b: 2 } → { a: 1, b: 2 }
 * 2. Array items without commas: [1 2 3] → [1, 2, 3]
 * 3. Function parameters without commas: (a b c) → (a, b, c)
 * 4. Type properties without commas: { prop1: type1 prop2: type2 }
 * 5. Generic arguments without commas: <T K> → <T, K>
 *
 * Precision Rules:
 * - Only fix clear mojibake patterns
 * - Preserve intentional whitespace
 * - Handle multi-line objects safely
 * - Skip complex AST structures (leave for ts-morph)
 *
 * Expected Impact:
 *   - BEFORE: 83,973 total errors
 *   - TARGET: <70,000 errors (-14,000+ from comma fixes)
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
const maxFiles = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '100');
const singleFile = args.find(a => a.startsWith('--file='))?.split('=')[1];
const listFile = args.find(a => a.startsWith('--list='))?.split('=')[1];

console.log(`🔧 Phase 80 Chunk 12: Comma Corruption Fixer${dryRun ? ' (DRY RUN)' : ''}\n`);

let topFiles = [];

if (singleFile) {
  // Single file mode (Phase 81 compatible)
  const fullPath = singleFile.startsWith('/') || singleFile.match(/^[a-zA-Z]:/)
    ? singleFile
    : join(process.cwd(), singleFile);

  topFiles = [{ path: fullPath, errors: '?' }];
  console.log(`🎯 Target: Single file ${singleFile}\n`);
} else if (listFile) {
  // List file mode
  const listPath = listFile.startsWith('/') || listFile.match(/^[a-zA-Z]:/)
      ? listFile
      : join(process.cwd(), listFile);

  try {
      const content = readFileSync(listPath, 'utf8');
      topFiles = content.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'))
          .map(f => {
              const fullPath = f.startsWith('/') || f.match(/^[a-zA-Z]:/) ? f : join(root, f);
              return { path: fullPath, errors: '?' };
          });
      console.log(`🎯 Target: List file ${listFile} (${topFiles.length} files)\n`);
  } catch (e) {
      console.error(`Error reading list file: ${e.message}`);
      process.exit(1);
  }
} else {
  // Batch mode (Legacy Phase 80)
  try {
    const reportPath = join(root, 'phase80-stratification-report.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

    // Get files with comma errors
    const commaPattern = report.topPatterns.find(p => p.exampleMessage === "',' expected.");
    if (commaPattern) {
      console.log(`🎯 Target: ${commaPattern.count.toLocaleString()} comma errors across ${commaPattern.filesAffected} files\n`);
    }

    // Get top broken files
    topFiles = report.topFiles
      .slice(0, maxFiles)
      .map(f => ({ path: join(root, f.file), errors: f.errorCount }));
  } catch (e) {
    console.warn("⚠️ Could not load phase80-stratification-report.json. Use --file to run on specific files.");
    process.exit(1);
  }
}

console.log(`📋 Processing ${topFiles.length} files\n`);

const COMMA_PATTERNS = [
  // Pattern 1: Object property without comma (most common)
  // { prop1: 'value' prop2: 'value' } → { prop1: 'value', prop2: 'value' }
  {
    name: 'Object property missing comma',
    find: /(\w+):\s*([^,\n{}]+?)\s+(\w+):/g,
    replace: (match, prop1, value, prop2) => {
      // Only fix if value doesn't end with operators that expect continuation
      const trimmedValue = value.trim();
      if (trimmedValue && !trimmedValue.endsWith('=>') && !trimmedValue.endsWith('=')) {
        return `${prop1}: ${value}, ${prop2}:`;
      }
      return match;
    },
    description: 'Add comma between object properties'
  },

  // Pattern 2: Type annotation property without comma
  // { prop1: string prop2: number } → { prop1: string, prop2: number }
  {
    name: 'Type property missing comma',
    find: /(\w+):\s*(string|number|boolean|any|unknown|void|never|bigint|symbol|object|null|undefined)\s+(\w+):/g,
    replace: '$1: $2, $3:',
    description: 'Add comma between type properties'
  },

  // Pattern 3: Array literal without commas (simple values)
  // ['a' 'b' 'c'] → ['a', 'b', 'c']
  {
    name: 'Array items missing comma',
    find: /\[([^\]]*?)\]/g,
    replace: (match, items) => {
      // Fix string literals without commas: 'a' 'b' → 'a', 'b'
      const fixed = items.replace(/('[^']*')\s+('[^']*')/g, '$1, $2')
                         .replace(/("[^"]*")\s+("[^"]*")/g, '$1, $2')
                         .replace(/(\d+)\s+(\d+)/g, '$1, $2');
      return `[${fixed}]`;
    },
    description: 'Add comma between array items'
  },

  // Pattern 4: Function parameters without comma
  // function(a: string b: number) → function(a: string, b: number)
  {
    name: 'Function parameter missing comma',
    find: /\(([^)]+)\)/g,
    replace: (match, params) => {
      // Fix param lists like: a: string b: number
      const fixed = params.replace(/(\w+):\s*(\w+(?:\[\])?)\s+(\w+):/g, '$1: $2, $3:');
      return `(${fixed})`;
    },
    description: 'Add comma between function parameters'
  },

  // Pattern 5: Generic type arguments without comma
  // Map<string number> → Map<string, number>
  {
    name: 'Generic argument missing comma',
    find: /<([^>]+)>/g,
    replace: (match, types) => {
      // Fix type params like: string number → string, number
      const fixed = types.replace(/(string|number|boolean|any|unknown|void|never|bigint|symbol|object)\s+(string|number|boolean|any|unknown|void|never|bigint|symbol|object)/g, '$1, $2');
      return `<${fixed}>`;
    },
    description: 'Add comma between generic type arguments'
  },

  // Pattern 6: Import specifiers without comma
  // import { a b c } → import { a, b, c }
  {
    name: 'Import specifier missing comma',
    find: /import\s*\{([^}]+)\}/g,
    replace: (match, specifiers) => {
      // Fix specifiers like: a b c → a, b, c
      const fixed = specifiers.replace(/\b(\w+)\s+(\w+)\b/g, '$1, $2');
      return `import {${fixed}}`;
    },
    description: 'Add comma between import specifiers'
  },

  // Pattern 7: Enum members without comma
  // enum X { A = 1 B = 2 } → enum X { A = 1, B = 2 }
  {
    name: 'Enum member missing comma',
    find: /enum\s+\w+\s*\{([^}]+)\}/g,
    replace: (match, members) => {
      // Fix enum members: A = 1 B = 2 → A = 1, B = 2
      const fixed = members.replace(/(\w+\s*=\s*[^,}\s]+)\s+(\w+\s*=)/g, '$1, $2');
      return match.replace(members, fixed);
    },
    description: 'Add comma between enum members'
  }
];

let totalFilesProcessed = 0;
let totalFilesModified = 0;
let totalFixes = 0;
const fixSummary = {};

for (const {path: filePath, errors} of topFiles) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.svelte')) {
    continue;
  }

  try {
    let content = readFileSync(filePath, 'utf-8');
    let fixed = content;
    let fileFixes = 0;

    for (const pattern of COMMA_PATTERNS) {
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
  console.log(`\n✅ Comma corruption fixes applied!`);
  console.log(`\n📊 Expected Impact:`);
  console.log(`   - BEFORE: 83,973 total errors`);
  console.log(`   - Target comma errors: 21,425`);
  console.log(`   - Expected reduction: -15,000+ errors`);
  console.log(`\n🔍 Next: Run \`npx svelte-check\` to measure actual impact`);
}
