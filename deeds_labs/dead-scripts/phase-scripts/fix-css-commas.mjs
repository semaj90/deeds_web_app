#!/usr/bin/env node

/**
 * CSS Comma → Semicolon Fixer
 *
 * Fixes pattern: property: value, nextProperty: → property: value; nextProperty:
 * Only in CSS blocks (<style> tags and .css files)
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 CSS COMMA → SEMICOLON FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = false; // Set to true to preview changes

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE\n');
}

// Get all Svelte and CSS files
const gitFiles = execSync(
  'git ls-files "src/**/*.svelte" "src/**/*.css" | grep -v ".bak" | grep -v "_parked"',
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

    // Extract CSS blocks from Svelte files
    const isSvelte = filePath.endsWith('.svelte');
    const isCss = filePath.endsWith('.css');

    if (isSvelte) {
      // Match <style>...</style> blocks
      const styleBlockRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;

      content = content.replace(styleBlockRegex, (match, cssContent) => {
        let fixedCss = cssContent;
        let blockFixCount = 0;

        // Fix CSS property separator: property: value, nextProperty: → property: value; nextProperty:
        // Match: CSS property followed by comma followed by another property
        const cssPropertyPattern = /:\s*([^;{},]+?),\s+([a-zA-Z-]+):/g;

        fixedCss = fixedCss.replace(cssPropertyPattern, (m, value, nextProp) => {
          blockFixCount++;
          return `: ${value.trim()};\n\t\t${nextProp}:`;
        });

        fileFixCount += blockFixCount;
        return match.replace(cssContent, fixedCss);
      });
    } else if (isCss) {
      // Process entire file as CSS
      const cssPropertyPattern = /:\s*([^;{},]+?),\s+([a-zA-Z-]+):/g;

      content = content.replace(cssPropertyPattern, (m, value, nextProp) => {
        fileFixCount++;
        return `: ${value.trim()};\n\t${nextProp}:`;
      });
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
  resolve('css-comma-fixes-report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    filesProcessed,
    filesWithMatches,
    totalFixes,
    fixedFiles
  }, null, 2)
);

console.log(`📄 Report: css-comma-fixes-report.json\n`);
