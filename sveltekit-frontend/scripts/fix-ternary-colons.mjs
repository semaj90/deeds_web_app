#!/usr/bin/env node

/**
 * Ternary Operator Colon Fixer
 *
 * Fixes pattern: condition ? 'value1' 'value2' → condition ? 'value1' : 'value2'
 * Common after mass replacements that affected colons
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 TERNARY OPERATOR COLON FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = false; // Set to true to preview changes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE\n');
}

// Get all Svelte and TypeScript files
const gitFiles = execSync(
  'git ls-files "src/**/*.svelte" "src/**/*.ts" "src/**/*.tsx"',
  { encoding: 'utf-8' }
)
  .split('\n')
  .filter(Boolean)
  .map(f => f.trim());

console.log(`Found ${gitFiles.length} files\n`);

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

    // Pattern 1: Ternary with two string literals missing colon
    // Matches: ? 'string1' 'string2'  or  ? "string1" "string2"
    const pattern1 = /\?\s*['"]([^'"]+)['"]\s+['"]/g;

    // More conservative: look for the complete pattern with closing quote
    const lines = content.split('\n');
    const fixedLines = lines.map(line => {
      let fixedLine = line;

      // Pattern: condition ? 'value1' 'value2' (missing colon)
      // Must have ? followed by quoted string, space, quoted string
      const ternaryPattern = /(\?)\s*(['"])([^'"]*)\2\s+(['"])([^'"]*)\4/g;

      let match;
      const matches = [];
      while ((match = ternaryPattern.exec(line)) !== null) {
        matches.push(match);
      }

      // Apply fixes in reverse to maintain positions
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        const questionMark = m[1];  // ?
        const quote1 = m[2];         // ' or "
        const value1 = m[3];         // first value
        const quote2 = m[4];         // ' or "
        const value2 = m[5];         // second value

        const original = `${questionMark} ${quote1}${value1}${quote1} ${quote2}${value2}${quote2}`;
        const fixed = `${questionMark} ${quote1}${value1}${quote1} : ${quote2}${value2}${quote2}`;

        fixedLine = fixedLine.replace(original, fixed);
        fileFixCount++;
      }

      return fixedLine;
    });

    content = fixedLines.join('\n');

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
  console.log(`\n📝 Fixed files:\n`);
  fixedFiles
    .sort((a, b) => b.fixes - a.fixes)
    .forEach(({ file, fixes }) => {
      console.log(`  • ${file} (${fixes} fixes)`);
    });
}

console.log(`\n${DRY_RUN ? '⚠️  DRY RUN - Set DRY_RUN = false to apply' : '✅ Applied!'}\n`);

// Save report
writeFileSync(
  resolve('ternary-colons-report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    filesProcessed,
    filesWithMatches,
    totalFixes,
    fixedFiles
  }, null, 2)
);

console.log(`📄 Report: ternary-colons-report.json\n`);
