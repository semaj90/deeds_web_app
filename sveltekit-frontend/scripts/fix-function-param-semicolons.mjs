#!/usr/bin/env node

/**
 * Function Parameter Semicolon Fixer
 *
 * Fixes pattern: function(param1: Type; param2: Type) → function(param1: Type, param2: Type)
 * Common in function signatures after mass semicolon fixes
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 FUNCTION PARAMETER SEMICOLON FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = false; // Set to true to preview changes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE\n');
}

// Get all TypeScript files
const gitFiles = execSync(
  'git ls-files "src/**/*.ts" "src/**/*.d.ts"',
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

    // Pattern: Function parameter with semicolon separator
    // Matches: (param1: Type; param2: Type) or (param1: Type; param2: Type, param3: Type)
    // Must be conservative - only fix inside function signatures

    // Split content into lines for safer processing
    const lines = content.split('\n');
    const fixedLines = lines.map(line => {
      let fixedLine = line;
      let lineFixCount = 0;

      // Only process lines that look like function signatures
      if (line.match(/\(.*:.*;\s*[a-zA-Z_$][\w$]*\s*:/)) {
        // Pattern: Inside parentheses, type followed by semicolon and next parameter
        // Matches: : Type; nextParam: → : Type, nextParam:
        const regex = /(\([^)]*?):\s*([^;:)(]+?)\s*;\s*([a-zA-Z_$][\w$]*)\s*:/g;

        let match;
        const matches = [];
        while ((match = regex.exec(line)) !== null) {
          matches.push(match);
        }

        // Apply fixes in reverse order to maintain positions
        for (let i = matches.length - 1; i >= 0; i--) {
          const m = matches[i];
          const before = m[1];
          const type = m[2];
          const nextParam = m[3];

          // Build the fixed version
          const original = `${before}: ${type}; ${nextParam}:`;
          const fixed = `${before}: ${type}, ${nextParam}:`;

          fixedLine = fixedLine.replace(original, fixed);
          lineFixCount++;
        }
      }

      if (lineFixCount > 0) {
        fileFixCount += lineFixCount;
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

console.log(`\n${DRY_RUN ? '⚠️  DRY RUN - Set DRY_RUN = false to apply' : '✅ Applied!'}\\n`);

// Save report
writeFileSync(
  resolve('function-param-semicolons-report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    filesProcessed,
    filesWithMatches,
    totalFixes,
    fixedFiles
  }, null, 2)
);

console.log(`📄 Report: function-param-semicolons-report.json\n`);
