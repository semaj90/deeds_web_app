#!/usr/bin/env node
/**
 * Phase 81: Semicolon-then-Comma Fixer
 *
 * Fixes corruption pattern: field: type;, nextfield: type;,
 * Should be: field: type, nextfield: type,
 *
 * This is highly targeted at the qlora-rl-langextract-integration.ts pattern
 */

import fs from 'fs';
import path from 'path';

const pattern = /:\s*[^;,]+;,\s+/g; // Match `: type;, ` and replace with `, `
const filePatterns = process.argv.slice(2);

if (!filePatterns.length) {
  console.error('Usage: node phase81-fix-semicolon-comma.mjs <file1> <file2> ...');
  process.exit(1);
}

let totalFixed = 0;
let filesModified = 0;

for (const pattern of filePatterns) {
  const files = fs.readdirSync(path.dirname(pattern))
    .filter(f => f.includes(path.basename(pattern)));

  for (const file of files) {
    const filePath = path.join(path.dirname(pattern), file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;

    // Fix: field: type;, nextfield → field: type, nextfield
    content = content.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([^;,]+);,\s+/g, '$1: $2, ');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8');
      const count = (original.match(/;\s*,/g) || []).length;
      console.log(`✅ ${filePath}: ${count} fixes`);
      totalFixed += count;
      filesModified++;
    }
  }
}

console.log(`\n✅ Total: ${filesModified} files modified, ${totalFixed} fixes applied`);
