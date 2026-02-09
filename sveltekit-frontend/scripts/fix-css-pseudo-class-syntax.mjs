#!/usr/bin/env node
/**
 * CSS Pseudo-Class Syntax Fixer
 *
 * Fixes common CSS corruption pattern: `focus: border` → `focus:border`
 *
 * Pattern:
 * - Pseudo-classes with space before colon (focus: , hover: , select: , disabled: )
 * - CSS properties incorrectly separated by commas instead of spaces
 *
 * Examples:
 * - focus: border-blue-500 → focus:border-blue-500
 * - hover: bg-red-500, focus: outline → hover:bg-red-500 focus:outline
 * - select: dropdown → select:dropdown
 *
 * Usage:
 *   node scripts/fix-css-pseudo-class-syntax.mjs
 *   node scripts/fix-css-pseudo-class-syntax.mjs --dry-run
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

// CSS pseudo-class patterns to fix
const PSEUDO_CLASS_PATTERNS = [
  { name: 'focus', regex: /\bfocus\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'focus:$1' },
  { name: 'hover', regex: /\bhover\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'hover:$1' },
  { name: 'active', regex: /\bactive\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'active:$1' },
  { name: 'disabled', regex: /\bdisabled\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'disabled:$1' },
  { name: 'visited', regex: /\bvisited\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'visited:$1' },
  { name: 'checked', regex: /\bchecked\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'checked:$1' },
  { name: 'first-child', regex: /\bfirst-child\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'first-child:$1' },
  { name: 'last-child', regex: /\blast-child\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'last-child:$1' },
  { name: 'odd', regex: /\bodd\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'odd:$1' },
  { name: 'even', regex: /\beven\s*:\s*([a-zA-Z0-9_-]+)/g, replacement: 'even:$1' }
];

// Fix comma-separated CSS classes (should be space-separated)
const CLASS_COMMA_PATTERN = /class="([^"]*,\s*[^"]*)"/g;

async function findSvelteFiles() {
  const files = await glob('src/**/*.svelte', {
    cwd: process.cwd(),
    absolute: true,
    ignore: ['**/node_modules/**', '**/_archive/**', '**/routes_parked/**']
  });
  return files;
}

function fixPseudoClassSyntax(content) {
  let fixedContent = content;
  let fixCount = 0;
  const changes = [];

  // Fix pseudo-class patterns
  for (const { name, regex, replacement } of PSEUDO_CLASS_PATTERNS) {
    const matches = content.match(regex);
    if (matches) {
      fixedContent = fixedContent.replace(regex, replacement);
      fixCount += matches.length;
      changes.push({ pattern: name, count: matches.length });
    }
  }

  // Fix comma-separated classes
  const classMatches = content.match(CLASS_COMMA_PATTERN);
  if (classMatches) {
    fixedContent = fixedContent.replace(CLASS_COMMA_PATTERN, (match) => {
      return match.replace(/,\s*/g, ' ');
    });
    fixCount += classMatches.length;
    changes.push({ pattern: 'class commas', count: classMatches.length });
  }

  return { fixedContent, fixCount, changes };
}

async function main() {
  console.log('🔍 Scanning for CSS pseudo-class syntax errors...\n');

  const files = await findSvelteFiles();
  console.log(`Found ${files.length} Svelte files to check\n`);

  let totalFiles = 0;
  let totalFixes = 0;
  const fileResults = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const { fixedContent, fixCount, changes } = fixPseudoClassSyntax(content);

      if (fixCount > 0) {
        totalFiles++;
        totalFixes += fixCount;

        const relativePath = path.relative(process.cwd(), file);
        fileResults.push({ file: relativePath, fixCount, changes });

        if (!DRY_RUN) {
          writeFileSync(file, fixedContent, 'utf-8');
          console.log(`✅ Fixed ${relativePath} (${fixCount} fixes)`);
          changes.forEach(({ pattern, count }) => {
            console.log(`   - ${pattern}: ${count} fix(es)`);
          });
        } else {
          console.log(`🔍 [DRY RUN] Would fix ${relativePath} (${fixCount} fixes)`);
          changes.forEach(({ pattern, count }) => {
            console.log(`   - ${pattern}: ${count} fix(es)`);
          });
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
  } else {
    console.log('\n✅ All fixes applied successfully!');
    console.log('💡 Run svelte-check to verify error reduction');
  }

  return { totalFiles, totalFixes, fileResults };
}

main().catch(console.error);
