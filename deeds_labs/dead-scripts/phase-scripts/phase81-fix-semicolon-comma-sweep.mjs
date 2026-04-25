#!/usr/bin/env node
/**
 * Phase 81: Semicolon-Comma Fixer (Full Sweep)
 *
 * Process all .ts files in src/ recursively
 */

import fs from 'fs';
import { globSync } from 'glob';
import path from 'path';

const srcDir = './src';
const files = globSync('**/*.ts', { cwd: srcDir }).filter(f => !f.includes('node_modules'));

console.log(`📁 Found ${files.length} TypeScript files\n`);

let totalFixed = 0;
let filesModified = 0;
const modifiedList = [];

for (const file of files) {
  const filePath = path.join(srcDir, file);

  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Fix: field: type;, nextfield → field: type, nextfield
  content = content.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([^;,]+);,\s+/g, '$1: $2, ');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    const count = (original.match(/;\s*,/g) || []).length;
    totalFixed += count;
    filesModified++;
    modifiedList.push({ file, count });
  }
}

if (filesModified > 0) {
  console.log(`✅ Top 15 files modified:\n`);
  modifiedList.sort((a, b) => b.count - a.count).slice(0, 15).forEach(m => {
    console.log(`  ${m.count.toString().padStart(3)}x  ${m.file}`);
  });
  console.log(`\n✅ Total: ${filesModified} files modified, ${totalFixed} fixes applied`);
} else {
  console.log('ℹ️  No files modified (pattern already applied)');
}
