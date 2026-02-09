#!/usr/bin/env node
/**
 * Fix Playwright Test Syntax Errors - Session 13
 *
 * Pattern: object literal properties using : instead of ,
 * Example: { key1: value1: key2: value2 } → { key1: value1, key2: value2 }
 *
 * Common in test files due to encoding corruption
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    // Pattern 1: Object properties with : instead of , between properties
    // Matches: key: value: nextKey → key: value, nextKey
    // But NOT: key: value } or key: value; or key: value)
    const objectColonPattern = /(\w+):\s*([^:;,}\)]+?):\s*(\w+)\s*:/g;

    const objectMatches = [...modified.matchAll(objectColonPattern)];
    for (const match of objectMatches) {
      // Check if this looks like an object literal (not ternary, not type)
      const beforeMatch = modified.slice(Math.max(0, match.index - 50), match.index);
      const afterMatch = modified.slice(match.index + match[0].length, Math.min(modified.length, match.index + match[0].length + 50));

      // Skip if this looks like a ternary operator (has ? nearby)
      if (beforeMatch.includes('?') || afterMatch.includes('?')) {
        continue;
      }

      // Skip if this looks like a type annotation (in interface/type)
      if (beforeMatch.includes('interface') || beforeMatch.includes('type ')) {
        continue;
      }

      // Replace : with , between properties
      const fixed = `${match[1]}: ${match[2]}, ${match[3]}:`;
      modified = modified.replace(match[0], fixed);
      fileFixes++;
    }

    // Pattern 2: Specific pattern from error logs
    // hasServiceWorker: 'serviceWorker' in navigator: registrations
    const navigatorPattern = /(\w+):\s*(['"][^'"]+['"])\s+in\s+(\w+):\s*(\w+)/g;
    const navigatorMatches = [...modified.matchAll(navigatorPattern)];

    for (const match of navigatorMatches) {
      const fixed = `${match[1]}: ${match[2]} in ${match[3]}, ${match[4]}`;
      modified = modified.replace(match[0], fixed);
      fileFixes++;
    }

    // Pattern 3: options: { key: value: key2 } → options: { key: value, key2 }
    const optionsPattern = /options:\s*\{\s*(\w+):\s*(\w+):\s*(\w+)/g;
    const optionsMatches = [...modified.matchAll(optionsPattern)];

    for (const match of optionsMatches) {
      const fixed = `options: { ${match[1]}: ${match[2]}, ${match[3]}`;
      modified = modified.replace(match[0], fixed);
      fileFixes++;
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`  ✓ Fixed ${fileFixes} syntax error(s) in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing Playwright test syntax errors...\n');
  console.log('   Pattern: object properties using : instead of ,\n');

  // Search all test files
  const files = await glob('tests/**/*.{ts,js,spec.ts}', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**'],
  });

  console.log(`Checking ${files.length} test files\n`);

  for (const file of files) {
    await fixFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Files checked: ${totalFiles}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total syntax fixes: ${totalFixes}`);
  console.log('='.repeat(60));

  if (totalFixes > 0) {
    console.log('\n✨ Run `npx playwright test` to verify fixes');
  } else {
    console.log('\n✓ No Playwright syntax errors found');
  }
}

main().catch(console.error);
