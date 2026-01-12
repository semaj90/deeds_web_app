#!/usr/bin/env node
/**
 * Phase 96: Fix $state Rune Misuse in TypeScript Files
 *
 * PROBLEM: $state is a Svelte 5 rune that only works in .svelte or .svelte.ts files.
 * It cannot be used in plain .ts files (services, workers, utilities).
 *
 * SOLUTION: Replace $state() with regular TypeScript property assignments
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

let fixedCount = 0;
let errorCount = 0;

/**
 * Fix $state misuse in a file
 * @param {string} filePath
 */
function fixStateInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;

    // Pattern 1: private isInitialized = $state(false) → private isInitialized = false
    content = content.replace(/(\s+)(private|public)(\s+)(\w+)(\s*)=(\s*)\$state\s*\(\s*(.+?)\s*\)/g,
      '$1$2$3$4$5=$6$7');

    // Pattern 2: let someVar = $state(value) → let someVar = value
    content = content.replace(/(\s+)(let|const|var)(\s+)(\w+)(\s*)=(\s*)\$state\s*\(\s*(.+?)\s*\)/g,
      '$1$2$3$4$5=$6$7');

    // Pattern 3: this.property = $state(value) → this.property = value
    content = content.replace(/(this\.\w+)(\s*)=(\s*)\$state\s*\(\s*(.+?)\s*\)/g,
      '$1$2=$3$4');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ Fixed: ${path.relative(srcDir, filePath)}`);
      fixedCount++;
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    errorCount++;
    return false;
  }
}

/**
 * Recursively find and fix files
 * @param {string} dir
 */
function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, .svelte-kit, etc.
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        processDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      // Only process .ts files (NOT .svelte.ts)
      if (entry.name.endsWith('.ts') && !entry.name.endsWith('.svelte.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.includes('$state(')) {
          fixStateInFile(fullPath);
        }
      }
    }
  }
}

console.log('🔧 Phase 96: Fixing $state Rune Misuse in TypeScript Files\n');
console.log('📂 Scanning:', srcDir);
console.log('');

processDirectory(srcDir);

console.log('');
console.log('📊 Summary:');
console.log(`  ✅ Files fixed: ${fixedCount}`);
console.log(`  ❌ Errors: ${errorCount}`);
console.log('');

if (fixedCount > 0) {
  console.log('✨ Success! $state rune misuse has been corrected.');
  console.log('   Run `npx tsc --noEmit` to verify TypeScript errors are reduced.');
} else {
  console.log('ℹ️  No files needed fixing.');
}

process.exit(errorCount > 0 ? 1 : 0);
