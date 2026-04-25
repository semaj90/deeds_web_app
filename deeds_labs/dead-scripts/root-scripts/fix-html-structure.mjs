#!/usr/bin/env node

// Frontend Consolidation Script - Fix HTML Structure Errors
// Week 2, Day 6-7: Systematic error resolution

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const FRONTEND_DIR = 'src';

// Common error patterns to fix
const FIXES = [
  // Fix button closing tags - Convert </button> to </Button>
  {
    pattern: /<Button([^>]*)>\s*([\s\S]*?)\s*<\/button>/g,
    replacement: '<Button$1>\n$2\n</Button>',
    description: 'Fix Button component closing tags',
  },

  // Fix missing parentheses in async functions
  {
    pattern: /setTimeout\(resolve,\s*(\d+)\);/g,
    replacement: 'setTimeout(resolve, $1));',
    description: 'Fix missing parentheses in setTimeout',
  },

  // Fix mixed Card component tags
  {
    pattern: /<\/Card\.(\w+)>/g,
    replacement: '</div.$1>',
    description: 'Fix inconsistent Card component closing tags',
  },

  // Fix duplicate role attributes
  {
    pattern: /role="[^"]*"\s+([^>]*)\s+role="[^"]*"/g,
    replacement: 'role="button" $1',
    description: 'Remove duplicate role attributes',
  },

  // Fix unexpected block closing tags
  {
    pattern: /\{\s*\/if\s*\}\s*\{\s*\/if\s*\}/g,
    replacement: '{/if}',
    description: 'Remove duplicate if block closing tags',
  },
];

function processFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  let modified = false;

  for (const fix of FIXES) {
    const originalContent = content;
    content = content.replace(fix.pattern, fix.replacement);

    if (content !== originalContent) {
      modified = true;
      console.log(`✅ Applied: ${fix.description} in ${filePath}`);
    }
  }

  if (modified) {
    writeFileSync(filePath, content, 'utf8');
    return true;
  }

  return false;
}

function walkDirectory(dir) {
  const items = readdirSync(dir);
  let totalFixed = 0;

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      totalFixed += walkDirectory(fullPath);
    } else if (extname(item) === '.svelte') {
      if (processFile(fullPath)) {
        totalFixed++;
      }
    }
  }

  return totalFixed;
}

// Run the fixes
console.log('🚀 Starting Frontend HTML Structure Consolidation...');
console.log('📁 Processing directory:', FRONTEND_DIR);

const fixedFiles = walkDirectory(FRONTEND_DIR);

console.log(`\n✅ Consolidation Complete!`);
console.log(`📊 Files modified: ${fixedFiles}`);
console.log(`🎯 Next: Run 'npm run check:svelte:fast' to verify fixes`);
