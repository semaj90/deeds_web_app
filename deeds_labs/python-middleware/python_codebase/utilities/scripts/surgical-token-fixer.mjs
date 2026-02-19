#!/usr/bin/env node
/**
 * Surgical Token Fixer
 * Targets specific comma/semicolon corruption patterns that TypeScript can't parse
 *
 * Patterns fixed:
 * - {, ... → { ...        (stray comma after opening brace)
 * - await, ... → await ...  (stray comma after await)
 * - const; ... → const ...  (semicolon after const keyword)
 * - case, '... → case '...  (comma before string literal in switch)
 * - data: {, ... → data: { ... (comma after colon before brace)
 * - return: null → return null (colon should be null)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..', 'sveltekit-frontend', 'src');

let totalFiles = 0;
let fixedFiles = 0;
let totalFixes = 0;

const surgicalPatterns = [
  // Pattern 1: Stray comma after opening brace in objects
  {
    name: 'Comma after opening brace {,',
    regex: /\{\s*,\s+/g,
    replace: '{ ',
    description: 'data: {, value } → data: { value }'
  },
  // Pattern 2: Stray comma after await keyword
  {
    name: 'Comma after await',
    regex: /\bawait\s*,\s+/g,
    replace: 'await ',
    description: 'await, func() → await func()'
  },
  // Pattern 3: Semicolon after const keyword
  {
    name: 'Semicolon after const',
    regex: /\bconst\s*;\s+/g,
    replace: 'const ',
    description: 'const; x → const x'
  },
  // Pattern 4: Comma before string literal in case statements
  {
    name: 'Comma before string in case',
    regex: /case\s*,\s*(['"'])/g,
    replace: "case $1",
    description: "case, 'value' → case 'value'"
  },
  // Pattern 5: Semicolon-comma sequence
  {
    name: 'Semicolon-comma sequence',
    regex: /;\s*,\s+/g,
    replace: '; ',
    description: ';, x → ; x'
  },
  // Pattern 6: Trailing comma before closing brace in single-line
  {
    name: 'Comma before closing brace in object literal',
    regex: /:\s+([^,\n}]+)\s*,\s*\}/g,
    replace: ': $1 }',
    description: 'key: value, } → key: value }'
  },
  // Pattern 7: Double commas
  {
    name: 'Double comma cleanup',
    regex: /,\s*,\s*/g,
    replace: ', ',
    description: ',, → ,'
  },
  // Pattern 8: Stray comma after type annotation colon
  {
    name: 'Comma after type colon',
    regex: /:\s+([A-Za-z_$<>[\]|&]+)\s*,\s*([}\)\n])/g,
    replace: ': $1$2',
    description: 'prop: Type, } → prop: Type }'
  },
  // Pattern 9: Stray colon after property name (colon used instead of comma)
  {
    name: 'Colon instead of comma in objects',
    regex: /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([a-zA-Z_$'"`{[0-9])/g,
    replace: '$1: $2',
    description: 'key: value → key: value (normalize spacing)'
  },
  // Pattern 10: Stray semicolon in template literals (very specific)
  {
    name: 'Semicolon in template literal',
    regex: /`([^`]*?);\s*,\s*type:\s*\$\{/g,
    replace: '`$1 type: ${',
    description: 'Remove `;,` before type in template'
  },
  // Pattern 11: return: null pattern
  {
    name: 'Return colon null',
    regex: /\breturn\s*:\s+null\b/g,
    replace: 'return null',
    description: 'return: null → return null'
  },
  // Pattern 12: Multiple spaces cleanup after fixing
  {
    name: 'Multiple spaces normalization',
    regex: /\s{2,}/g,
    replace: ' ',
    description: 'Normalize multiple spaces to single'
  }
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
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.mjs')) {
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
    const fixes = [];

    for (const pattern of surgicalPatterns) {
      const before = content;
      const matches = (content.match(pattern.regex) || []).length;

      if (matches > 0) {
        content = content.replace(pattern.regex, pattern.replace);
        fileFixed += matches;
        fixes.push(`  ${pattern.name}: ${matches}`);
      }
    }

    if (fileFixed > 0) {
      fs.writeFileSync(filePath, content, 'utf-8');
      fixedFiles++;
      totalFixes += fileFixed;
      const relative = path.relative(SRC_ROOT, filePath);
      console.log(`✅ ${relative}: ${fileFixed} fixes`);
      if (fixes.length > 0 && fixedFiles <= 10) {
        fixes.forEach(f => console.log(f));
      }
    }
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
  }
}

console.log('🔧 Surgical Token Fixer');
console.log('=====================================');
console.log('Targets: comma/semicolon corruption in:');
console.log('  - Object literals');
console.log('  - Function calls (await)');
console.log('  - Type annotations');
console.log('  - Switch cases');
console.log('  - Template literals\n');

console.log(`📁 Processing: ${SRC_ROOT}\n`);

walkDirectory(SRC_ROOT);

console.log('\n=====================================');
console.log(`📊 Results:`);
console.log(`   Files scanned: ${totalFiles}`);
console.log(`   Files fixed: ${fixedFiles}`);
console.log(`   Total token fixes applied: ${totalFixes}`);
console.log('=====================================\n');

if (totalFixes > 0) {
  console.log('✅ Token repairs complete!\n');
  console.log('Next steps:');
  console.log('  1. npm run check:typescript');
  console.log('  2. Verify error count reduction');
  console.log('  3. Address remaining semantic errors\n');
} else {
  console.log('✨ No token corruption found - codebase is clean!\n');
}
