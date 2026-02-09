#!/usr/bin/env node
/**
 * Ternary Operator Corruption Fixer (Conservative Version)
 *
 * Fixes ternary operators with pipe corruption: `condition ? value | fallback` → `condition ? value : fallback`
 *
 * CONSERVATIVE APPROACH:
 * - Only fixes patterns with clear ternary structure (condition ? true | false)
 * - Excludes type annotations (as Type | OtherType)
 * - Excludes optional chaining without ternary (?.[0] | undefined)
 *
 * Examples:
 * - options.includeText ? text | undefined → options.includeText ? text : undefined ✅
 * - value as string | number → SKIPPED (type annotation) ❌
 * - array?.[0] | undefined → SKIPPED (optional chaining, not ternary) ❌
 *
 * Usage:
 *   node scripts/fix-ternary-operators.mjs
 *   node scripts/fix-ternary-operators.mjs --dry-run
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Conservative ternary pipe patterns
 * Only match when there's a clear condition before the ?
 * Exclude patterns after 'as' keyword (type annotations)
 */
const TERNARY_PIPE_PATTERNS = [
  // Pattern 1: property/identifier ? value | fallback
  // Example: options.includeText ? text | undefined
  {
    name: 'property ternary',
    regex: /\b([a-zA-Z_$][a-zA-Z0-9_$.]*)\s+\?\s+([a-zA-Z_$][a-zA-Z0-9_$.[\]()]*)\s+\|\s+(undefined|null|[a-zA-Z_$][a-zA-Z0-9_$.[\]()]*)/g,
    replacement: '$1 ? $2 : $3'
  },
  // Pattern 2: comparison ? value | fallback
  // Example: count > 0 ? result | fallback
  {
    name: 'comparison ternary',
    regex: /([a-zA-Z_$][a-zA-Z0-9_$.]*\s*[><=!]+\s*[a-zA-Z0-9_$.]+)\s+\?\s+([a-zA-Z_$][a-zA-Z0-9_$.[\]()]*)\s+\|\s+(undefined|null|[a-zA-Z_$][a-zA-Z0-9_$.[\]()]*)/g,
    replacement: '$1 ? $2 : $3'
  }
];

async function findTypeScriptFiles() {
  const files = await glob('src/**/*.{ts,svelte}', {
    cwd: process.cwd(),
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/_archive/**',
      '**/routes_parked/**',
      '**/*.d.ts' // Skip type declaration files
    ]
  });
  return files;
}

function fixTernaryOperators(content, filename) {
  let fixedContent = content;
  let fixCount = 0;
  const changes = [];
  const lineChanges = [];

  // Track line numbers for reporting
  const lines = content.split('\n');

  // Fix ternary pipe patterns
  for (const { name, regex, replacement } of TERNARY_PIPE_PATTERNS) {
    const matches = [...content.matchAll(regex)];
    if (matches.length > 0) {
      // Track which lines were changed
      for (const match of matches) {
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        lineChanges.push({
          line: lineNumber,
          pattern: name,
          before: match[0],
          after: match[0].replace(regex, replacement)
        });
      }

      fixedContent = fixedContent.replace(regex, replacement);
      fixCount += matches.length;
      changes.push({ pattern: name, count: matches.length });
    }
  }

  return { fixedContent, fixCount, changes, lineChanges };
}

async function main() {
  console.log('🔍 Scanning for ternary operator corruption...\n');

  const files = await findTypeScriptFiles();
  console.log(`Found ${files.length} TypeScript/Svelte files to check\n`);

  let totalFiles = 0;
  let totalFixes = 0;
  const fileResults = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const { fixedContent, fixCount, changes, lineChanges } = fixTernaryOperators(content, file);

      if (fixCount > 0) {
        totalFiles++;
        totalFixes += fixCount;

        const relativePath = path.relative(process.cwd(), file);
        fileResults.push({ file: relativePath, fixCount, changes, lineChanges });

        if (!DRY_RUN) {
          writeFileSync(file, fixedContent, 'utf-8');
          console.log(`✅ Fixed ${relativePath} (${fixCount} fixes)`);
          changes.forEach(({ pattern, count }) => {
            console.log(`   - ${pattern}: ${count} fix(es)`);
          });

          // Show first few line changes for verification
          if (lineChanges.length > 0 && lineChanges.length <= 3) {
            lineChanges.forEach(({ line, before, after }) => {
              console.log(`     Line ${line}: "${before.trim()}" → "${after.trim()}"`);
            });
          }
        } else {
          console.log(`🔍 [DRY RUN] Would fix ${relativePath} (${fixCount} fixes)`);
          changes.forEach(({ pattern, count }) => {
            console.log(`   - ${pattern}: ${count} fix(es)`);
          });

          // Show examples in dry run
          if (lineChanges.length > 0 && lineChanges.length <= 3) {
            lineChanges.forEach(({ line, before, after }) => {
              console.log(`     Line ${line}: "${before.trim()}" → "${after.trim()}"`);
            });
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log('='.repeat(60));
  console.log(`Files scanned: ${files.length}`);
  console.log(`Files with issues: ${totalFiles}`);
  console.log(`Total fixes: ${totalFixes}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'WRITE (files modified)'}`);
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply fixes');
    console.log('⚠️  Review examples above to ensure correctness');
  } else {
    console.log('\n✅ All fixes applied successfully!');
    console.log('💡 Run svelte-check to verify error reduction');
  }

  return { totalFiles, totalFixes, fileResults };
}

main().catch(console.error);
