#!/usr/bin/env node
/**
 * Fix Malformed API Files
 * - Stray semicolons breaking function calls
 * - Missing closing braces
 * - Unbalanced parentheses
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Files with known issues
const BROKEN_FILES = [
  'src/routes/api/yorha/enhanced-rag/+server.ts',
  'src/routes/api/yorha/system/status/+server.ts'
];

function fixMalformedFile(filePath) {
  const fullPath = path.join(rootDir, filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`❌ Not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  const original = content;

  // Fix 1: Remove stray semicolons from function calls
  // Pattern: ")\n;" should be just ")"
  content = content.replace(/\)\s*;\s*\n\s*([a-z])/gi, (match, nextChar) => {
    return `)\n\t\t\t${nextChar}`;
  });

  // Fix 2: Remove standalone semicolons between parameters
  content = content.replace(/\n\s*;\s*\n/g, '\n');

  // Fix 3: Fix closing braces issues
  content = content.replace(/}[\s]*;[\s]*}/g, '}\n}');

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  } else {
    console.log(`⏭️  No changes: ${filePath}`);
    return false;
  }
}

console.log('🔧 Fixing Malformed API Files\n');

let fixed = 0;
for (const file of BROKEN_FILES) {
  if (fixMalformedFile(file)) {
    fixed++;
  }
}

console.log(`\n✨ Fixed ${fixed} files`);
console.log('\nNext: Run npm run check:ultra-fast');
