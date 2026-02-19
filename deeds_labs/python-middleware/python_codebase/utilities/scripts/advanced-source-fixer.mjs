#!/usr/bin/env node
/**
 * Advanced TypeScript Source Fixer
 * Targets systematic corruption across all source files
 * Fixes stray commas, malformed objects, broken syntax
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..', 'sveltekit-frontend', 'src');

let totalFiles = 0;
let fixedFiles = 0;
let totalFixes = 0;

const patterns = [
  // Pattern 1: Stray comma after opening brace: {,
  { name: 'Stray brace comma', regex: /(\{)\s*,\s+/g, replace: '$1 ' },
  // Pattern 2: Stray comma after colon in object: property:,
  { name: 'Stray colon comma', regex: /:\s*,\s*/g, replace: ': ' },
  // Pattern 3: Stray comma after semicolon: ;,
  { name: 'Stray semicolon comma', regex: /;\s*,\s*/g, replace: '; ' },
  // Pattern 4: Double commas: ,,
  { name: 'Double comma', regex: /,\s*,/g, replace: ',' },
  // Pattern 5: Comma before closing brace: {value,}
  { name: 'Trailing comma before }', regex: /,\s*(\})/g, replace: '$1' },
  // Pattern 6: Comma before closing bracket: [value,]
  { name: 'Trailing comma before ]', regex: /,\s*(\])/g, replace: '$1' },
  // Pattern 7: Comma before closing paren: (value,)
  { name: 'Trailing comma before )', regex: /,\s*(\))/g, replace: '$1' },
  // Pattern 8: Stray comma after 'export': export const,
  { name: 'Export comma', regex: /(export\s+(?:default|const|function|interface|type|class))\s*,\s*/g, replace: '$1 ' },
  // Pattern 9: Stray comma after 'from': from 'module',
  { name: 'From comma', regex: /(from\s+['"`][^'"`]*['"`])\s*,\s*/g, replace: '$1' },
  // Pattern 10: Comma before type: property: type,
  { name: 'Comma before type', regex: /:\s+([A-Za-z_$][A-Za-z0-9_$<>[\]]*)\s*,\s*$/gm, replace: ': $1;' },
  // Pattern 11: Stray leading comma: ,property
  { name: 'Leading comma', regex: /([{,\[\(])\s*,\s*(?=[a-zA-Z_$])/g, replace: '$1 ' },
  // Pattern 12: Comma instead of colon: property, value
  { name: 'Comma instead of colon (conservative)', regex: /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s+([a-zA-Z_$][a-zA-Z0-9_$]*(?:\s*:|\s*=))/g, replace: '$1: $2' },
  // Pattern 13: Multiple spaces after comma
  { name: 'Multiple spaces after comma', regex: /,\s{2,}/g, replace: ', ' },
];

function walkDirectory(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith('.') || file === 'node_modules' || file === '__pycache__') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkDirectory(fullPath);
      } else if (
        file.endsWith('.ts') ||
        file.endsWith('.tsx') ||
        file.endsWith('.js') ||
        file.endsWith('.mjs')
      ) {
        processFile(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error walking ${dir}:`, err.message);
  }
}

function processFile(filePath) {
  try {
    totalFiles++;
    const original = fs.readFileSync(filePath, 'utf-8');
    let content = original;
    let fileFixed = 0;

    for (const pattern of patterns) {
      const matches = (content.match(pattern.regex) || []).length;
      if (matches > 0) {
        content = content.replace(pattern.regex, pattern.replace);
        fileFixed += matches;
      }
    }

    if (fileFixed > 0) {
      fs.writeFileSync(filePath, content, 'utf-8');
      fixedFiles++;
      totalFixes += fileFixed;
      const relative = path.relative(SRC_ROOT, filePath);
      console.log(`✅ ${relative}: ${fileFixed} fixes`);
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
  }
}

console.log('🔧 Advanced TypeScript Source Fixer');
console.log('=====================================\n');
console.log(`📁 Processing: ${SRC_ROOT}\n`);

walkDirectory(SRC_ROOT);

console.log('\n=====================================');
console.log(`📊 Results:`);
console.log(`   Files scanned: ${totalFiles}`);
console.log(`   Files fixed: ${fixedFiles}`);
console.log(`   Total fixes applied: ${totalFixes}`);
console.log(`   Average fixes per file: ${fixedFiles > 0 ? (totalFixes / fixedFiles).toFixed(1) : 0}`);
console.log('=====================================\n');

if (totalFixes > 0) {
  console.log('✅ Fixes applied! Run: npm run check:ultra-fast');
} else {
  console.log('✨ No fixes needed - codebase is clean!');
}
