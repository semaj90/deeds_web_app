#!/usr/bin/env node
/**
 * Phase 34D: CSS Comma-to-Semicolon Repair
 * Fixes CSS properties using commas instead of semicolons in Svelte components
 * 
 * Pattern: position: absolute, top: 10px, right: 10px; → position: absolute; top: 10px; right: 10px;
 */

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';

const stats = {
  filesScanned: 0,
  filesFixed: 0,
  patternsFixed: 0,
  errors: []
};

console.log('\n🔧 Phase 34D: CSS Comma-to-Semicolon Repair');
console.log('='.repeat(70));

const startTime = Date.now();

// Find all Svelte files (where CSS lives in <style> blocks)
const files = await glob('sveltekit-frontend/src/**/*.svelte', {
  ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/build/**']
});

console.log(`\n📁 Found ${files.length} Svelte files to process\n`);

for (const file of files) {
  stats.filesScanned++;
  
  if (stats.filesScanned % 100 === 0) {
    process.stdout.write(`\r⏳ Progress: ${stats.filesScanned}/${files.length}...`);
  }
  
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (err) {
    stats.errors.push({ file, error: err.message });
    continue;
  }
  
  const originalContent = content;
  let fileFixed = false;
  let fileCount = 0;
  
  // Fix CSS in <style> blocks
  content = content.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (match, styleContent) => {
    let fixedStyle = styleContent;
    
    // Pattern 1: CSS property: value, property: value → property: value; property: value
    // Fix commas between CSS properties that should be semicolons
    fixedStyle = fixedStyle.replace(
      /([a-z-]+)\s*:\s*([^;,}]+),\s*([a-z-]+)\s*:/g,
      (m, prop1, val1, prop2) => {
        // Only fix if this looks like CSS properties, not function arguments
        if (!val1.includes('(') || val1.split('(').length === val1.split(')').length) {
          fileCount++;
          return `${prop1}: ${val1}; ${prop2}:`;
        }
        return m;
      }
    );
    
    // Pattern 2: Fix semicolon-comma combos (;, → ;)
    fixedStyle = fixedStyle.replace(/;\s*,\s*/g, '; ');
    
    // Pattern 3: Fix trailing commas before closing braces
    fixedStyle = fixedStyle.replace(/,(\s*})/g, '$1');
    
    if (fixedStyle !== styleContent) {
      fileFixed = true;
      return `<style${match.substring(6, match.indexOf('>'))}>${fixedStyle}</style>`;
    }
    return match;
  });
  
  if (fileFixed && content !== originalContent) {
    try {
      fs.writeFileSync(file, content, 'utf8');
      stats.filesFixed++;
      stats.patternsFixed += fileCount;
      
      const relativePath = path.relative(process.cwd(), file);
      console.log(`\r✅ Fixed ${fileCount} pattern(s) → ${relativePath}                    `);
    } catch (err) {
      console.error(`\n❌ Error writing ${file}: ${err.message}`);
      stats.errors.push({ file, error: err.message });
    }
  }
}

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n\n' + '='.repeat(70));
console.log('📊 Phase 34D Summary');
console.log('='.repeat(70));
console.log(`\nFiles scanned:       ${stats.filesScanned.toLocaleString()}`);
console.log(`Files fixed:         ${stats.filesFixed.toLocaleString()}`);
console.log(`Patterns repaired:   ${stats.patternsFixed.toLocaleString()}`);
console.log(`Processing time:     ${duration}s`);
console.log(`Errors:              ${stats.errors.length}`);

if (stats.errors.length > 0 && stats.errors.length <= 10) {
  console.log('\n⚠️  Errors:');
  stats.errors.forEach(e => console.log(`   ${e.file}: ${e.error}`));
}

console.log('\n' + '='.repeat(70));

if (stats.filesFixed > 0) {
  console.log('✅ CSS comma-to-semicolon repair complete!');
  console.log('\n📋 Next steps:');
  console.log('  1. npm run check:svelte (verify CSS syntax)');
  console.log('  2. npm run dev:gpu (test in browser)');
  console.log('  3. git diff (review changes)');
} else {
  console.log('✅ No CSS comma patterns found');
}

console.log('\n');

process.exit(stats.errors.length > 0 ? 1 : 0);
