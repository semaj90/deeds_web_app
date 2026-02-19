#!/usr/bin/env node
/**
 * Phase 43B — CSS Syntax Fixer
 * -----------------------------
 * Fixes CSS syntax errors introduced by Prettier
 * Target: ~30,000 errors (25% reduction)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'src');
const APPLY = process.argv.includes('--apply');

let stats = {
  filesScanned: 0,
  filesFixed: 0,
  fixTypes: {
    rgbaColons: 0,
    missingSemicolons: 0,
    invalidCommas: 0,
    otherCss: 0
  }
};

function* walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!/node_modules|\.git|backups/.test(entry)) {
        yield* walk(full);
      }
    } else if (/\.svelte$/.test(entry)) {
      yield full;
    }
  }
}

function fixCssSyntax(content) {
  let modified = false;
  let result = content;
  
  // Fix 1: rgba() with colons instead of commas
  const rgbaFixed = result.replace(
    /rgba\s*\(\s*(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*,\s*([^)]+)\)/g,
    (match, r, g, b, a) => {
      stats.fixTypes.rgbaColons++;
      modified = true;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  );
  result = rgbaFixed;
  
  // Fix 2: Missing semicolons in style blocks
  // Pattern: property value\n  next-property:
  const semicolonFixed = result.replace(
    /<style[^>]*>([\s\S]*?)<\/style>/g,
    (match, styleContent) => {
      const fixed = styleContent.replace(
        /([^;{}:\s])\s*\n(\s+)([a-z-]+\s*:)/g,
        (m, lastChar, indent, nextProp) => {
          stats.fixTypes.missingSemicolons++;
          modified = true;
          return `${lastChar};\n${indent}${nextProp}`;
        }
      );
      return `<style${match.slice(6, match.indexOf('>'))}>${fixed}</style>`;
    }
  );
  result = semicolonFixed;
  
  // Fix 3: Commas instead of semicolons in transform/box-shadow
  const commaFixed = result.replace(
    /(transform|box-shadow|text-shadow)\s*:\s*([^;{}<]+?),\s*0\s/g,
    (match, prop, value) => {
      // Only fix if it's clearly wrong (ends with comma before 0)
      if (!value.includes('(')) {
        stats.fixTypes.invalidCommas++;
        modified = true;
        return `${prop}: ${value} 0 `;
      }
      return match;
    }
  );
  result = commaFixed;
  
  return { content: result, modified };
}

console.log(`🔧 CSS Syntax Fixer ${APPLY ? '(APPLY)' : '(DRY RUN)'}\n`);

for (const file of walk(ROOT)) {
  stats.filesScanned++;
  
  const content = fs.readFileSync(file, 'utf8');
  const { content: fixed, modified } = fixCssSyntax(content);
  
  if (modified) {
    stats.filesFixed++;
    
    if (APPLY) {
      // Backup original
      fs.copyFileSync(file, `${file}.css-bak`);
      fs.writeFileSync(file, fixed, 'utf8');
      console.log(`✅ Fixed: ${path.relative(ROOT, file)}`);
    } else {
      console.log(`🔍 Would fix: ${path.relative(ROOT, file)}`);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 CSS SYNTAX FIX REPORT');
console.log('='.repeat(60));
console.log(`Files scanned:    ${stats.filesScanned}`);
console.log(`Files fixed:      ${stats.filesFixed}`);
console.log(`\nFixes by type:`);
console.log(`  rgba() colons:        ${stats.fixTypes.rgbaColons}`);
console.log(`  Missing semicolons:   ${stats.fixTypes.missingSemicolons}`);
console.log(`  Invalid commas:       ${stats.fixTypes.invalidCommas}`);
console.log(`  Other CSS:            ${stats.fixTypes.otherCss}`);

const totalFixes = Object.values(stats.fixTypes).reduce((a, b) => a + b, 0);
console.log(`\nTotal fixes:      ${totalFixes}`);

if (!APPLY) {
  console.log(`\n⚠️  DRY RUN — Run with --apply to make changes\n`);
} else {
  console.log(`\n✅ Changes applied\n`);
}

// Write report
fs.writeFileSync(
  path.resolve(__dirname, '..', 'css-fix-report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    ...stats
  }, null, 2)
);
