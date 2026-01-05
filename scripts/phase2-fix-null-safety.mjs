#!/usr/bin/env node
/**
 * Phase 2 - Fix Null Safety Issues
 *
 * Fixes: Cannot find name 'variableName'
 *
 * Pattern: Variables used before declaration or destructuring issues
 * Solution: Add proper declarations with $state() or fix destructuring
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalFixed = 0;
let filesFixed = 0;

function fixNullSafety(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Fix: No value exists in scope for the shorthand property
  // Pattern: { propertyName } without declaration
  const shorthandPattern = /\{\s*(\w+)\s*\}/g;
  const matches = [...content.matchAll(shorthandPattern)];

  for (const match of matches) {
    const propName = match[1];

    // Check if this is in an object literal context and the variable doesn't exist
    const beforeMatch = content.substring(Math.max(0, match.index - 100), match.index);
    const afterMatch = content.substring(match.index, Math.min(content.length, match.index + 100));

    // If it's in a return statement or object literal, and looks like shorthand
    if ((beforeMatch.includes('return') || beforeMatch.includes(':')) &&
        !content.includes(`let ${propName}`) &&
        !content.includes(`const ${propName}`) &&
        !content.includes(`$state(${propName})`)) {

      // This is likely a shorthand property that needs the full form
      // Replace { propName } with { propName: propName }
      const fullContext = content.substring(match.index - 20, match.index + match[0].length + 20);

      // Only fix if it's clearly an object literal shorthand
      if (fullContext.match(/[\{,]\s*\w+\s*[\},]/)) {
        content = content.replace(match[0], `{ ${propName}: ${propName} }`);
        modified = true;
        totalFixed++;
      }
    }
  }

  // Fix: Cannot find name in Svelte 5 runes context
  // Look for variables used in markup but not declared
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const markupContent = content.substring(scriptMatch.index + scriptMatch[0].length);

    // Find variables used in markup
    const usedVars = new Set();
    const varPattern = /\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g;
    let varMatch;
    while ((varMatch = varPattern.exec(markupContent)) !== null) {
      usedVars.add(varMatch[1]);
    }

    // Check which ones are not declared
    const undeclaredVars = [];
    for (const varName of usedVars) {
      if (!scriptContent.includes(`let ${varName}`) &&
          !scriptContent.includes(`const ${varName}`) &&
          !scriptContent.includes(`$state(${varName})`) &&
          !scriptContent.includes(`$derived(${varName})`) &&
          !scriptContent.includes(`function ${varName}`) &&
          !scriptContent.includes(`${varName}:`)) {
        undeclaredVars.push(varName);
      }
    }

    // Add declarations for undeclared variables
    if (undeclaredVars.length > 0) {
      const declarations = undeclaredVars
        .map(v => `\tlet ${v} = $state<any>(undefined);`)
        .join('\n');

      // Insert after script tag
      const insertPos = scriptMatch.index + scriptMatch[0].indexOf('>') + 1;
      content = content.slice(0, insertPos) + '\n' + declarations + '\n' + content.slice(insertPos);
      modified = true;
      totalFixed += undeclaredVars.length;
    }
  }

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
    } else if (entry.name.endsWith('.svelte') || entry.name.endsWith('.ts')) {
      fixNullSafety(fullPath);
    }
  }
}

// Main execution
const srcDir = path.join(__dirname, '..', 'sveltekit-frontend', 'src');
console.log('Phase 2: Fixing null safety issues...\n');
processDirectory(srcDir);

console.log(`\n✓ Complete!`);
console.log(`  Files fixed: ${filesFixed}`);
console.log(`  Total fixes: ${totalFixed}`);
