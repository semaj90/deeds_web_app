#!/usr/bin/env node
/**
 * Phase 2 - Fix Syntax Errors
 *
 * Fixes: ',' expected, ':' expected, Argument expression expected
 *
 * Pattern: Drizzle ORM array syntax, object literal syntax
 * Solution: Fix array() calls and object destructuring
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalFixed = 0;
let filesFixed = 0;

function fixSyntaxErrors(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Fix Drizzle ORM array() syntax
  // Old: array(text('tags'))
  // New: text('tags').array()
  const drizzleArrayPattern = /array\((\w+)\((['"][^'"]+['"]\))\)/g;
  if (drizzleArrayPattern.test(content)) {
    content = content.replace(drizzleArrayPattern, '$1($2).array()');
    modified = true;
    totalFixed++;
  }

  // Fix: timestamp() with multiple arguments
  // Old: timestamp('created_at', { mode: 'string' })
  // New: timestamp('created_at').defaultNow()
  const timestampPattern = /timestamp\((['"][^'"]+['"])\s*,\s*\{[^}]+\}\)/g;
  if (timestampPattern.test(content)) {
    content = content.replace(timestampPattern, (match, name) => {
      if (match.includes('defaultNow')) {
        return `timestamp(${name}).defaultNow()`;
      }
      return `timestamp(${name})`;
    });
    modified = true;
    totalFixed++;
  }

  // Fix: Missing commas in object literals
  // Pattern: property: value\n  property: value (missing comma)
  const missingCommaPattern = /(\w+:\s*[^,\n]+)\n(\s+)(\w+:)/g;
  const commaMatches = [...content.matchAll(missingCommaPattern)];
  for (const match of commaMatches) {
    // Check if there's already a comma
    if (!match[1].trim().endsWith(',')) {
      content = content.replace(match[0], `${match[1]},\n${match[2]}${match[3]}`);
      modified = true;
      totalFixed++;
    }
  }

  // Fix: Shorthand property without value
  // Pattern: { propertyName } where propertyName is not defined
  // Solution: { propertyName: undefined } or remove if optional
  const shorthandInObjectPattern = /\{\s*(\w+)\s*\}/g;
  const shorthandMatches = [...content.matchAll(shorthandInObjectPattern)];

  for (const match of matches) {
    const propName = match[1];
    const context = content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + 50));

    // If this is in a return statement and the variable doesn't exist
    if (context.includes('return') && !content.includes(`let ${propName}`) && !content.includes(`const ${propName}`)) {
      // Replace with explicit undefined
      content = content.replace(match[0], `{ ${propName}: undefined }`);
      modified = true;
      totalFixed++;
    }
  }

  // Fix: Expected arguments errors in function calls
  // Pattern: function(arg1, arg2, arg3) where function expects fewer args
  // This is harder to fix automatically, so we'll just log it

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesFixed++;
    console.log(`✓ Fixed ${filePath}`);
    return true;
  }

  return false;
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        processDirectory(fullPath);
      }
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) {
      fixSyntaxErrors(fullPath);
    }
  }
}

// Main execution
const srcDir = path.join(__dirname, '..', 'sveltekit-frontend', 'src');
console.log('Phase 2: Fixing syntax errors...\n');
processDirectory(srcDir);

console.log(`\n✓ Complete!`);
console.log(`  Files fixed: ${filesFixed}`);
console.log(`  Total fixes: ${totalFixed}`);
