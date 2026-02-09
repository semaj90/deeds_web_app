#!/usr/bin/env node

/**
 * Phantom Comma Fixer for TypeScript
 *
 * Fixes pattern: "; ," → ";"
 * Common in interfaces, type definitions, and object literals
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 PHANTOM COMMA FIXER (TypeScript)\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = false; // Applying fixes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE\n');
}

const gitFiles = execSync(
  'git ls-files "src/**/*.ts"',
  { encoding: 'utf-8' }
)
  .split('\n')
  .filter(Boolean)
  .map(f => f.trim());

console.log(`Found ${gitFiles.length} TypeScript files\n`);

let filesProcessed = 0;
let filesWithMatches = 0;
let totalFixes = 0;
const fixedFiles = [];

for (const filePath of gitFiles) {
  try {
    const fullPath = resolve(filePath);
    let content = readFileSync(fullPath, 'utf-8');
    const originalContent = content;
    let fileFixCount = 0;

    // Pattern 1: Semicolon-space-comma (interface properties, etc.)
    const pattern1Matches = content.match(/;\s*,/g);
    if (pattern1Matches) {
      content = content.replace(/;\s*,/g, ';');
      fileFixCount += pattern1Matches.length;
    }

    // Pattern 2: Comma after colon in type definitions (rare but happens)
    // Only fix in interface/type contexts, not in objects
    const pattern2 = /:([^,;{}]+),\s*([a-zA-Z_$][\w$]*)\s*:/g;
    let match;
    while ((match = pattern2.exec(originalContent)) !== null) {
      // Check if this looks like a type definition (not object literal)
      const before = originalContent.substring(Math.max(0, match.index - 100), match.index);
      if (before.includes('interface') || before.includes('type ') || before.includes('export interface')) {
        content = content.replace(match[0], `:${match[1]}; ${match[2]}:`);
        fileFixCount++;
      }
    }

    if (content !== originalContent) {
      filesWithMatches++;
      totalFixes += fileFixCount;
      fixedFiles.push({ file: filePath, fixes: fileFixCount });

      if (!DRY_RUN) {
        writeFileSync(fullPath, content, 'utf-8');
      }

      console.log(`📄 ${filePath} (${fileFixCount} fixes)`);
    }

    filesProcessed++;
  } catch (err) {
    console.error(`✗ Error: ${filePath}:`, err instanceof Error ? err.message : String(err));
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 ${DRY_RUN ? 'DRY RUN ' : ''}RESULTS:\n`);
console.log(`Files scanned: ${filesProcessed}`);
console.log(`Files with matches: ${filesWithMatches}`);
console.log(`Total fixes: ${totalFixes}`);

if (filesWithMatches > 0) {
  console.log(`\n📝 Top 20 files:\n`);
  fixedFiles
    .sort((a, b) => b.fixes - a.fixes)
    .slice(0, 20)
    .forEach(({ file, fixes }) => {
      console.log(`  • ${file} (${fixes} fixes)`);
    });
}

console.log(`\n${DRY_RUN ? '⚠️  DRY RUN - Set DRY_RUN = false to apply' : '✅ Applied!'}\n`);

writeFileSync(
  resolve('phantom-commas-ts-report.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), dryRun: DRY_RUN, filesProcessed, filesWithMatches, totalFixes, fixedFiles }, null, 2)
);

console.log(`📄 Report: phantom-commas-ts-report.json\n`);
