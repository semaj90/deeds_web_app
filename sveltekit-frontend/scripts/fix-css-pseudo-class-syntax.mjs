#!/usr/bin/env node
/**
 * Fix CSS Pseudo-Class Syntax Errors
 *
 * Pattern: focus: border → focus:border
 *          hover: bg → hover:bg
 *
 * Expected Impact: ~200 errors fixed
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

const pseudoClasses = ['focus', 'hover', 'active', 'disabled', 'first', 'last'];

const createPattern = (pseudo) => new RegExp(
  `(class=["'\`][^"'\`]*)(${pseudo}):\s+(\w)`,
  'g'
);

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileFixes = 0;

    for (const pseudo of pseudoClasses) {
      const pattern = createPattern(pseudo);
      const matches = modified.match(pattern);

      if (matches) {
        modified = modified.replace(pattern, `$1$2:$3`);
        fileFixes += matches.length;
      }
    }

    if (fileFixes > 0) {
      writeFileSync(filePath, modified, 'utf-8');
      filesModified++;
      totalFixes += fileFixes;
      console.log(`✅ Fixed ${fileFixes} in: ${path.relative(process.cwd(), filePath)}`);
    }

    totalFiles++;
  } catch (error) {
    console.error(`❌ Error ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔍 Fixing CSS pseudo-class syntax errors...\n');

  const files = await glob('src/**/*.svelte', {
    cwd: process.cwd(),
    ignore: ['**/routes_parked/**', '**/*.bak*', '**/*.backup*', '**/_archive/**'],
  });

  console.log(`Checking ${files.length} files\n`);

  for (const file of files) {
    await fixFile(file);
  }

  console.log('\n📊 Summary:');
  console.log(`   Files checked: ${totalFiles}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total fixes: ${totalFixes}`);

  if (totalFixes > 0) {
    console.log('\n✨ Run npm run check to verify');
  }
}

main().catch(console.error);
