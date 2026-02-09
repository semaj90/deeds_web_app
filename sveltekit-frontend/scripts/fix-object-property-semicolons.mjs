#!/usr/bin/env node

/**
 * Object Property Semicolon Fixer
 *
 * Fixes pattern: prop: value; nextProp: → prop: value, nextProp:
 * In object literals and interface definitions
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 OBJECT PROPERTY SEMICOLON FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = false; // Set to true to preview changes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE\n');
}

// Get all TypeScript and Svelte files (exclude backup files)
const gitFiles = execSync(
  'git ls-files "src/**/*.ts" "src/**/*.svelte" | grep -v ".bak" | grep -v "_parked"',
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

    // Pattern 1: Object literal property separator
    // prop: value; nextProp: → prop: value, nextProp:
    // BUT NOT: type unions like string; number (those are valid)

    const lines = content.split('\n');
    const fixedLines = lines.map((line, lineNum) => {
      let fixedLine = line;

      // Skip lines that look like type unions or function return types
      if (line.includes('| {') || line.includes('} |') || /\}\s*;/.test(line)) {
        return line;
      }

      // Pattern: property: value; nextProperty:
      // Match: identifier: value; identifier:
      // Where value can be: string literal, number, identifier, null, boolean, array, object
      const propertyPattern = /(\w+:\s*(?:[^;{}]+?));\s+(\w+:)/g;

      let match;
      const replacements = [];
      while ((match = propertyPattern.exec(line)) !== null) {
        // Exclude cases where semicolon is part of a statement (e.g., for loop)
        const beforeMatch = line.substring(0, match.index);
        if (beforeMatch.includes('for ') || beforeMatch.includes('while ')) {
          continue;
        }

        replacements.push({
          original: match[0],
          replacement: `${match[1]}, ${match[2]}`,
          index: match.index
        });
      }

      // Apply replacements in reverse order to maintain positions
      for (let i = replacements.length - 1; i >= 0; i--) {
        const { original, replacement } = replacements[i];
        fixedLine = fixedLine.replace(original, replacement);
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
  resolve('object-property-semicolons-report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    filesProcessed,
    filesWithMatches,
    totalFixes,
    fixedFiles
  }, null, 2)
);

console.log(`📄 Report: object-property-semicolons-report.json\n`);
