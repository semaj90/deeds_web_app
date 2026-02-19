#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../sveltekit-frontend/src');
let stats = {
  filesProcessed: 0,
  filesFixed: 0,
  issuesFixed: 0
};

/**
 * PHASE 44E: Aggressive CSS/Tailwind Corruption Fixer
 * Targets: All pseudo-selector corruption patterns
 */

function fixCSSCorruption(content) {
  let fixed = content;
  let count = 0;

  // Pattern 1: :focusring/border/text as separate tokens
  // Convert: :focusring-blue-500 :focusborder-blue-500" → :focus:ring-blue-500 :focus:border-blue-500
  fixed = fixed.replace(/:focus([a-z\-]+)/g, ':focus:$1');
  if (fixed !== content) count++;

  // Pattern 2: :hover/active appearing in class attribute without colon prefix
  // :hoverbg-blue-700 → hover:bg-blue-700
  fixed = fixed.replace(/:([a-z]+)(bg|text|border|ring|shadow|scale|opacity|rotate|translate)[\-\w]*/g, (match, pseudo, prop) => {
    count++;
    return `${pseudo}:${prop}${match.slice(pseudo.length + prop.length + 1)}`;
  });

  // Pattern 3: Stray pseudo-selectors in class names
  // class="... :focusoutline-none" → class="... focus:outline-none"
  fixed = fixed.replace(/class="([^"]*):([a-z]+)(outline|ring|shadow|border|text|bg)[\-\w]*"/, (match, before, pseudo, prop) => {
    count++;
    return `class="${before} ${pseudo}:${prop}${match.slice(before.length + pseudo.length + prop.length + 9)}"`;
  });

  // Pattern 4: Double pseudo-selectors like :focusoutline and :focusborder on same line
  // These usually need to be separate class attributes
  if (fixed.includes(':focusoutline') || fixed.includes(':focusborder') || fixed.includes(':focusring')) {
    // Look for attributes like: class="...something" :focusX-Y"
    fixed = fixed.replace(/class="([^"]*)"[\s\n]*:([a-z]+)([a-z\-]+)"/g, (match, classes, pseudo, rest) => {
      count++;
      // Convert loose pseudo to proper class attribute
      return `class="${classes}" class="${pseudo}:${rest}"`;
    });
  }

  // Pattern 5: Malformed Tailwind variants
  // lg-cols-4 → lg:cols-4
  fixed = fixed.replace(/\b(lg|md|sm|xl|2xl)-(cols|items|gap|text|bg|border|rounded|shadow|w|h|px|py|m|p)(?=[\-\w]*)/g, (match, breakpoint, prop) => {
    count++;
    return `${breakpoint}:${prop}`;
  });

  // Pattern 6: Fix attributes that got split across lines incorrectly
  // Regex to find multiline attribute disasters
  fixed = fixed.replace(/([a-z\-]+)="([^"]*)"\s+([:|:][a-z]+)([\-\w]*)"([^>]*)/g, (match, attr1, val1, pseudo, rest, trailing) => {
    // This is a split attribute - need to merge
    count++;
    // Reconstruct as single class attribute with proper formatting
    if (attr1 === 'class' && pseudo.startsWith(':')) {
      return `class="${val1} ${pseudo.slice(1)}${rest}"${trailing}`;
    }
    return match;
  });

  return { fixed, count };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    stats.filesProcessed++;

    const result = fixCSSCorruption(content);

    if (result.count > 0) {
      fs.writeFileSync(filePath, result.fixed, 'utf-8');
      stats.filesFixed++;
      stats.issuesFixed += result.count;
      const relPath = path.relative(srcDir, filePath);
      console.log(`✅ Fixed: ${relPath} (${result.count} issues)`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.svelte')) {
      processFile(filePath);
    }
  }
}

console.log('🚀 Phase 44E: Aggressive CSS/Tailwind Corruption Fixer');
console.log('='.repeat(60));
console.log(`Scanning: ${srcDir}`);
console.log('');

walkDir(srcDir);

console.log('\n' + '='.repeat(60));
console.log('✅ Phase 44E Complete!');
console.log(`Files processed: ${stats.filesProcessed}`);
console.log(`Files fixed: ${stats.filesFixed}`);
console.log(`Issues fixed: ${stats.issuesFixed}`);
