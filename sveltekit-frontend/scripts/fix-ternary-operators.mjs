#!/usr/bin/env node
/**
 * Fix Ternary Operator Errors - Session 13
 * 
 * Pattern: condition ? value | undefined → condition ? value : undefined
 * 
 * IMPORTANT: Only fixes ternary expressions, NOT type unions
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

let totalFiles = 0;
let totalFixes = 0;
let filesModified = 0;

// Pattern: Match ternary with | undefined (not : undefined)
// Looks for: ? ... | undefined followed by comma, semicolon, closing brace/paren
const ternaryPattern = /(\?[^:;,\)\}]+)\|\s*undefined([,;\)\}])/g;

async function fixFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const matches = content.match(ternaryPattern);
    
    if (!matches) {
      totalFiles++;
      return;
    }

    // Replace | undefined with : undefined in ternary expressions
    const modified = content.replace(ternaryPattern, '$1: undefined$2');
    
    writeFileSync(filePath, modified, 'utf-8');
    filesModified++;
    totalFixes += matches.length;
    
    console.log(`✅ Fixed ${matches.length} ternary(s) in: ${path.relative(process.cwd(), filePath)}`);
    totalFiles++;
  } catch (error) {
    console.error(`❌ Error in ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔍 Fixing ternary operator errors...\n');

  // Search all TypeScript/Svelte files (exclude archives/backups)
  const files = await glob('src/**/*.{ts,tsx,svelte}', {
    cwd: process.cwd(),
    ignore: ['**/_archive/**', '**/*.bak*', '**/*.backup*', '**/routes_parked/**'],
  });

  console.log(`Checking ${files.length} files\n`);

  for (const file of files) {
    await fixFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Files checked: ${totalFiles}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Total ternary fixes: ${totalFixes}`);
  console.log('='.repeat(60));

  if (totalFixes > 0) {
    console.log('\n✨ Run `npm run check` to verify fixes');
  } else {
    console.log('\n✓ No ternary errors found');
  }
}

main().catch(console.error);
