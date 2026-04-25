/**
 * Phase 97: Fix hover, and focus, comma corruptions
 * Changes `hover,` to `hover:` in class attributes (but not in CSS pseudo-selectors)
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.svelte', { cwd: process.cwd() });

let totalFixed = 0;
let filesFixed = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  let modified = false;

  // Fix hover, to hover: in class strings (not in CSS)
  // Pattern: class="...hover, ..." but NOT in <style> blocks
  const styleBlockRegex = /<style[^>]*>[\s\S]*?<\/style>/g;
  const styleBlocks = content.match(styleBlockRegex) || [];

  // Temporarily replace style blocks with placeholders
  const placeholders = styleBlocks.map((block, i) => `__STYLE_BLOCK_${i}__`);
  let tempContent = content;
  styleBlocks.forEach((block, i) => {
    tempContent = tempContent.replace(block, placeholders[i]);
  });

  // Fix hover, to hover: in class attributes
  const fixCount = (tempContent.match(/hover,\s+/g) || []).length;
  if (fixCount > 0) {
    // Only fix hover, that should be hover: (followed by a property like bg-, text-, etc)
    tempContent = tempContent.replace(/hover,\s+(bg-|text-|border-|underline|shadow-|scale-|translate-|transform|opacity-|ring-|outline-)/g, 'hover:$1');

    // Also fix focus, to focus:
    tempContent = tempContent.replace(/focus,\s+(bg-|text-|border-|underline|shadow-|scale-|outline-|ring-)/g, 'focus:$1');

    // Restore style blocks
    placeholders.forEach((placeholder, i) => {
      tempContent = tempContent.replace(placeholder, styleBlocks[i]);
    });

    if (content !== tempContent) {
      modified = true;
      const newFixCount = content.length - tempContent.length;
      console.log(`✅ ${file}: Fixed patterns`);
      filesFixed++;
    }
  }

  if (modified) {
    writeFileSync(file, tempContent, 'utf-8');
    totalFixed += fixCount;
  }
}

console.log(`\n📊 Summary: Fixed ${totalFixed} occurrences in ${filesFixed} files`);
