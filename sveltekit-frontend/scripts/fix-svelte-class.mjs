/**
 * Fix "class, name" corruption in Svelte files
 * Converts `class, name={...}` to `class:name={...}`
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.svelte', { cwd: process.cwd() });
let totalFixed = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  // Regex to find "class, word=" pattern
  // Note: space after comma is variable
  const fixed = content.replace(/class\s*,\s*([a-zA-Z0-9_-]+)\s*=/g, 'class:$1=');

  if (fixed !== content) {
    writeFileSync(file, fixed, 'utf-8');
    console.log(`Fixed class directive corruption in ${file}`);
    totalFixed++;
  }
}

console.log(`Total files fixed: ${totalFixed}`);
