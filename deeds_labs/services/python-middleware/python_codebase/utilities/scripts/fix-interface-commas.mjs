#!/usr/bin/env node
/**
 * Fix stray commas after interface/type opening braces
 * Targets pattern like: interface Name {, field:
 */

import fs from 'fs';
import path from 'path';

const FILE = process.argv[2] || 'sveltekit-frontend/src/lib/types/langchain-ollama-types.ts';

console.log(`🔧 Fixing stray commas in: ${FILE}\n`);

const fullPath = path.join(process.cwd(), FILE);
let content = fs.readFileSync(fullPath, 'utf-8');
let originalContent = content;

// Count fixes
let fixCount = 0;

// Fix pattern 1: interface Name {, field:
content = content.replace(/(\{),\s+([a-zA-Z_$])/g, (match, brace, field) => {
  fixCount++;
  return brace + ' ' + field;
});

// Fix pattern 2: { id: string;, name:
content = content.replace(/;,\s+([a-zA-Z_$])/g, (match, field) => {
  fixCount++;
  return '; ' + field;
});

// Fix pattern 3: , temperature: (leading comma)
content = content.replace(/\n\s*,\s+([a-zA-Z_$])/g, (match, field) => {
  fixCount++;
  return '\n  ' + field;
});

if (content === originalContent) {
  console.log('✅ No stray commas found - file is clean');
} else {
  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log(`✅ Fixed ${fixCount} stray comma patterns`);
  console.log(`✅ File saved: ${fullPath}\n`);
}
