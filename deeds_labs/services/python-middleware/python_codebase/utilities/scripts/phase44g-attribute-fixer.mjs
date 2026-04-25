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

function fixAttributeCorruption(content) {
  let fixed = content;
  let count = 0;

  // Fix stray commas at end of attribute values before newline/quote
  // class="value," → class="value"
  if (/class="[^"]*,\s*"/.test(fixed)) {
    const before = fixed;
    fixed = fixed.replace(/class="([^"]*),["\s]+/g, 'class="$1" ');
    if (fixed !== before) count++;
  }

  // Fix incomplete class attributes that got split
  // class="...md:grid-cols-2," → class="...md:grid-cols-2"
  if (/class="[^"]*,\s*$/.test(fixed)) {
    const before = fixed;
    fixed = fixed.replace(/class="([^"]*),\s*$/gm, 'class="$1"');
    if (fixed !== before) count++;
  }

  // Fix stray commas before closing quotes
  fixed = fixed.replace(/([a-z\-]+)="([^"]*),"/g, (match, attr, val) => {
    count++;
    return `${attr}="${val}"`;
  });

  // Fix attributes split across lines with stray comma
  // md:grid-cols-2," <newline> lg:grid-cols-3 gap-4"
  fixed = fixed.replace(/([a-z\-]+)\s*,\s*\n\s+([a-z])/g, (match, firstPart, secondChar) => {
    count++;
    return `${firstPart} ${secondChar}`;
  });

  return { fixed, count };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    stats.filesProcessed++;

    const result = fixAttributeCorruption(content);

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

console.log('🚀 Phase 44G: Attribute Corruption Fixer');
console.log('='.repeat(60));

walkDir(srcDir);

console.log('\n' + '='.repeat(60));
console.log('✅ Phase 44G Complete!');
console.log(`Files processed: ${stats.filesProcessed}`);
console.log(`Files fixed: ${stats.filesFixed}`);
console.log(`Issues fixed: ${stats.issuesFixed}`);
