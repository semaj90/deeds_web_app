/**
 * Fix import syntax corruption: "import { a: b } from ..." -> "import { a, b } from ..."
 * Replaces colons with commas inside import braces.
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.{ts,svelte,js}', { cwd: process.cwd() });
let totalFixed = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  let originalContent = content;

  // Find all import statements with braces
  content = content.replace(/import\s*\{([^}]+)\}\s*from/g, (match, importList) => {
    if (importList.includes(':')) {
      const fixedList = importList.replace(/:/g, ',');
      return match.replace(importList, fixedList);
    }
    return match;
  });

  if (content !== originalContent) {
    writeFileSync(file, content, 'utf-8');
    console.log(`Fixed import corruption in ${file}`);
    totalFixed++;
  }
}

console.log(`Total files fixed: ${totalFixed}`);
