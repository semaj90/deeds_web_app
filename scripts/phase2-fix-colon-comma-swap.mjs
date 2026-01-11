#!/usr/bin/env node
/**
 * Phase 2 Task 2: Fix Colon-Comma Swap Errors
 *
 * Fixes patterns where commas were incorrectly used instead of colons:
 * 1. Type annotations: `variable, Type` → `variable: Type`
 * 2. Object properties: `key, value` → `key: value`
 * 3. Method return types: `method(), ReturnType` → `method(): ReturnType`
 * 4. Interface properties: `prop, Type;` → `prop: Type;`
 *
 * Also fixes leading semicolons: `;  export` → `export`
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const stats = {
  filesScanned: 0,
  filesModified: 0,
  leadingSemicolonFixes: 0,
  typeAnnotationFixes: 0,
  methodReturnTypeFixes: 0,
  interfacePropertyFixes: 0,
  objectPropertyFixes: 0,
  totalFixes: 0
};

/**
 * Get all TypeScript files recursively
 */
function getTypeScriptFiles(dir, files = []) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    // Skip node_modules, .svelte-kit, and other non-source directories
    if (entry === 'node_modules' || entry === '.svelte-kit' || entry === 'dist' ||
        entry === 'build' || entry.startsWith('.')) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      getTypeScriptFiles(fullPath, files);
    } else if (extname(entry) === '.ts' || extname(entry) === '.svelte') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Fix a single file
 */
function fixFile(filePath) {
  stats.filesScanned++;

  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}`);
    return false;
  }

  const originalContent = content;
  let fileFixCount = 0;

  // Pattern 1: Leading semicolons at start of lines
  // `;  export` → `export`
  // `;  import` → `import`
  const leadingSemicolonPattern = /^;\s+(export|import|const|let|var|function|class|interface|type|async|private|protected|public|readonly|static|abstract|if|for|while|return|throw|try|catch|this|super)/gm;
  const leadingSemicolonMatches = content.match(leadingSemicolonPattern);
  if (leadingSemicolonMatches) {
    content = content.replace(leadingSemicolonPattern, '$1');
    stats.leadingSemicolonFixes += leadingSemicolonMatches.length;
    fileFixCount += leadingSemicolonMatches.length;
  }

  // Pattern 2: Type annotations with comma instead of colon
  // `protected hybridStyle, NESYoRHaHybridStyle;` → `protected hybridStyle: NESYoRHaHybridStyle;`
  // `const width, number = 5;` → `const width: number = 5;`
  const typeAnnotationPattern = /\b(const|let|var|private|protected|public|readonly)\s+(\w+),\s*([A-Z]\w*(?:<[^>]+>)?(?:\s*\|\s*\w+(?:<[^>]+>)?)*)\s*(;|=|\))/g;
  let match;
  let typeAnnotationFixes = 0;
  while ((match = typeAnnotationPattern.exec(originalContent)) !== null) {
    typeAnnotationFixes++;
  }
  if (typeAnnotationFixes > 0) {
    content = content.replace(typeAnnotationPattern, '$1 $2: $3$4');
    stats.typeAnnotationFixes += typeAnnotationFixes;
    fileFixCount += typeAnnotationFixes;
  }

  // Pattern 3: Method return types with comma instead of colon
  // `private initializeHybridSystem(), void {` → `private initializeHybridSystem(): void {`
  const methodReturnTypePattern = /(\w+)\s*\(\s*([^)]*)\s*\)\s*,\s*(void|Promise<[^>]+>|[A-Z]\w*(?:<[^>]+>)?)\s*\{/g;
  const methodMatches = content.match(methodReturnTypePattern);
  if (methodMatches) {
    content = content.replace(methodReturnTypePattern, '$1($2): $3 {');
    stats.methodReturnTypeFixes += methodMatches.length;
    fileFixCount += methodMatches.length;
  }

  // Pattern 4: Interface/type property with comma instead of colon
  // `prop, Type;` → `prop: Type;`
  // `prop?, Type;` → `prop?: Type;`
  const interfacePropertyPattern = /^(\s*)(\w+)(\?)?(?:,)\s*([A-Z]\w*(?:<[^>]+>)?(?:\s*\|\s*\w+(?:<[^>]+>)?)*)\s*;/gm;
  const interfaceMatches = content.match(interfacePropertyPattern);
  if (interfaceMatches) {
    content = content.replace(interfacePropertyPattern, '$1$2$3: $4;');
    stats.interfacePropertyFixes += interfaceMatches.length;
    fileFixCount += interfaceMatches.length;
  }

  // Pattern 5: Object literal properties with comma instead of colon
  // `{ key, value, anotherKey, anotherValue }` → `{ key: value, anotherKey: anotherValue }`
  // This is tricky - we need to be careful not to break destructuring
  // Only fix when the "value" looks like a type or literal, not a variable
  const objectPropertyPattern = /(\{[^}]*?)(\w+),\s*(0x[0-9a-fA-F]+|\d+|true|false|null|undefined|'[^']*'|"[^"]*")\s*([,}])/g;
  const objectMatches = content.match(objectPropertyPattern);
  if (objectMatches) {
    content = content.replace(objectPropertyPattern, '$1$2: $3$4');
    stats.objectPropertyFixes += objectMatches.length;
    fileFixCount += objectMatches.length;
  }

  // Pattern 6: Specific pattern for NES_YORHA_PALETTE style objects
  // `nesBlack: 0x0f0f0f, nesWhite: 0xfcfcfc,;` - fix trailing comma-semicolon
  const trailingCommaSemicolon = /,\s*;(\s*\n)/g;
  const trailingMatches = content.match(trailingCommaSemicolon);
  if (trailingMatches) {
    content = content.replace(trailingCommaSemicolon, ',$1');
    fileFixCount += trailingMatches.length;
  }

  // Pattern 7: Fix `[key, string]` in index signatures → `[key: string]`
  const indexSignaturePattern = /\[(\w+),\s*(string|number|symbol)\]/g;
  const indexMatches = content.match(indexSignaturePattern);
  if (indexMatches) {
    content = content.replace(indexSignaturePattern, '[$1: $2]');
    fileFixCount += indexMatches.length;
  }

  if (content !== originalContent) {
    stats.filesModified++;
    stats.totalFixes += fileFixCount;

    if (VERBOSE) {
      console.log(`[FIX] ${filePath} (${fileFixCount} fixes)`);
    }

    if (!DRY_RUN) {
      try {
        writeFileSync(filePath, content, 'utf-8');
      } catch (err) {
        console.error(`Error writing ${filePath}: ${err.message}`);
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Main execution
 */
function main() {
  console.log('='.repeat(60));
  console.log('Phase 2 Task 2: Fix Colon-Comma Swap Errors');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY FIXES'}`);
  console.log('');

  const srcDir = './src';
  console.log(`Scanning ${srcDir}...`);

  const files = getTypeScriptFiles(srcDir);
  console.log(`Found ${files.length} TypeScript/Svelte files`);
  console.log('');

  const startTime = Date.now();

  for (const file of files) {
    fixFile(file);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('');
  console.log('='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`Files scanned:           ${stats.filesScanned}`);
  console.log(`Files modified:          ${stats.filesModified}`);
  console.log(`Leading semicolon fixes: ${stats.leadingSemicolonFixes}`);
  console.log(`Type annotation fixes:   ${stats.typeAnnotationFixes}`);
  console.log(`Method return type fixes:${stats.methodReturnTypeFixes}`);
  console.log(`Interface property fixes:${stats.interfacePropertyFixes}`);
  console.log(`Object property fixes:   ${stats.objectPropertyFixes}`);
  console.log(`Total fixes:             ${stats.totalFixes}`);
  console.log(`Duration:                ${duration}s`);
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('');
    console.log('This was a DRY RUN. No files were modified.');
    console.log('Run without --dry-run to apply fixes.');
  }
}

main();
