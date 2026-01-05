#!/usr/bin/env node

/**
 * Test TS1005 fix script on specific files with known errors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
  'sveltekit-frontend/src/app.d.ts',
  'sveltekit-frontend/src/lib/3d/memory-palace-engine.ts',
  'sveltekit-frontend/src/lib/actors/xstate-actor-wrapper.ts',
];

console.log('🧪 Testing TS1005 Fix Script');
console.log('============================\n');

for (const file of testFiles) {
  const filePath = path.join(__dirname, '..', file);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${file}\n`);
    continue;
  }

  console.log(`📄 Testing: ${file}`);

  const content = fs.readFileSync(filePath, 'utf8');
  let modified = content;
  let changes = [];

  // Pattern 1: Import type with colon
  const importTypePattern = /import\s+type\s+\{\s*(\w+):\s*\1\s*\}/g;
  const importMatches = [...content.matchAll(importTypePattern)];
  if (importMatches.length > 0) {
    modified = modified.replace(importTypePattern, 'import type { $1 }');
    changes.push(`  ✓ Fixed ${importMatches.length} import type syntax error(s)`);
  }

  // Pattern 2: Object shorthand with comma
  const objectShorthandPattern = /(\w+),\s*(\w+\.\w+|\w+)\s*(\|\||&&|\?)/g;
  const shorthandMatches = [...content.matchAll(objectShorthandPattern)];
  if (shorthandMatches.length > 0) {
    modified = modified.replace(objectShorthandPattern, '$1: $2 $3');
    changes.push(`  ✓ Fixed ${shorthandMatches.length} object shorthand comma error(s)`);
  }

  // Pattern 3: Expression with comma
  const expressionCommaPattern = /(\w+\(\))\s*-,\s*(\w+)/g;
  const expressionMatches = [...modified.matchAll(expressionCommaPattern)];
  if (expressionMatches.length > 0) {
    modified = modified.replace(expressionCommaPattern, '$1 - $2');
    changes.push(`  ✓ Fixed ${expressionMatches.length} expression comma error(s)`);
  }

  if (changes.length > 0) {
    console.log('  Changes detected:');
    changes.forEach(c => console.log(c));

    // Show before/after for first change
    const lines = content.split('\n');
    const modifiedLines = modified.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== modifiedLines[i]) {
        console.log(`\n  Line ${i + 1}:`);
        console.log(`    Before: ${lines[i].trim()}`);
        console.log(`    After:  ${modifiedLines[i].trim()}`);
        break;
      }
    }
  } else {
    console.log('  ℹ️  No changes needed');
  }

  console.log('');
}

console.log('✅ Test complete\n');
console.log('To apply fixes, run:');
console.log('  node scripts/phase2-fix-ts1005-comma-errors.mjs --dry-run');
console.log('  node scripts/phase2-fix-ts1005-comma-errors.mjs');
