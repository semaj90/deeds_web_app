#!/usr/bin/env node

/**
 * ULTRA-CONSERVATIVE Svelte CSS Newline Fixer
 *
 * Only fixes CSS properties missing semicolons before newline + next property
 * Pattern: property: value\n next-property: → property: value;\n next-property:
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 ULTRA-CONSERVATIVE CSS NEWLINE SEMICOLON FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = false; // Applying fixes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE\n');
}

const gitFiles = execSync(
  'git ls-files "src/**/*.svelte"',
  { encoding: 'utf-8' }
)
  .split('\n')
  .filter(Boolean)
  .map(f => f.trim());

console.log(`Found ${gitFiles.length} Svelte files\n`);

let filesProcessed = 0;
let filesWithMatches = 0;
let totalFixes = 0;
const fixedFiles = [];

// Ultra-conservative: only fix clear newline cases in <style> blocks
function fixStyleBlock(styleContent) {
  let fixed = styleContent;
  let fixCount = 0;

  // Pattern: CSS property without semicolon before newline and next property
  // Must be: word characters, colon, value, newline, whitespace, word-dash (next prop)
  const regex = /([\w-]+):\s*([^;{}\n]+)\s*\n(\s+)([\w-]+):/g;

  fixed = fixed.replace(regex, (match, prop, value, spaces, nextProp) => {
    // Don't fix if value contains parentheses (function calls like rgb(), var())
    if (value.includes('(') || value.includes(')')) {
      return match;
    }

    // Don't fix if this looks like a selector (contains pseudo-selectors)
    if (prop.includes('hover') || prop.includes('focus') || prop.includes('before') || prop.includes('after')) {
      return match;
    }

    // Don't fix if value contains pipe (Svelte syntax)
    if (value.includes('|')) {
      return match;
    }

    // Don't fix if value looks incomplete (ends with comma)
    if (value.trim().endsWith(',')) {
      return match;
    }

    fixCount++;
    return `${prop}: ${value.trim()};\n${spaces}${nextProp}:`;
  });

  return { fixed, fixCount };
}

for (const filePath of gitFiles) {
  try {
    const fullPath = resolve(filePath);
    let content = readFileSync(fullPath, 'utf-8');
    const originalContent = content;
    let fileTotalFixes = 0;

    // Find all <style> blocks
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let styleMatches = [...content.matchAll(styleRegex)];

    for (const match of styleMatches) {
      const originalStyle = match[0];
      const styleContent = match[1];

      const { fixed, fixCount } = fixStyleBlock(styleContent);

      if (fixCount > 0) {
        const newStyle = originalStyle.replace(styleContent, fixed);
        content = content.replace(originalStyle, newStyle);
        fileTotalFixes += fixCount;
      }
    }

    if (content !== originalContent) {
      filesWithMatches++;
      totalFixes += fileTotalFixes;
      fixedFiles.push({ file: filePath, fixes: fileTotalFixes });

      if (!DRY_RUN) {
        writeFileSync(fullPath, content, 'utf-8');
      }

      console.log(`📄 ${filePath} (${fileTotalFixes} fixes)`);
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

// Save report
writeFileSync(
  resolve('css-newline-semicolon-report.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), dryRun: DRY_RUN, filesProcessed, filesWithMatches, totalFixes, fixedFiles }, null, 2)
);

console.log(`📄 Report: css-newline-semicolon-report.json\n`);
