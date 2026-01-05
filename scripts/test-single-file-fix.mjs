#!/usr/bin/env node
/**
 * Test fix on a single file
 */

import { readFileSync, writeFileSync } from 'fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node test-single-file-fix.mjs <filepath>');
  process.exit(1);
}

let content = readFileSync(filePath, 'utf-8');
const originalContent = content;
let fixes = [];

// Pattern 1: Leading semicolons at start of lines
const leadingSemicolonPattern = /^;\s+(export|import|const|let|var|function|class|interface|type|async|private|protected|public|readonly|static|abstract|if|for|while|return|throw|try|catch|this|super)/gm;
const leadingMatches = content.match(leadingSemicolonPattern);
if (leadingMatches) {
  content = content.replace(leadingSemicolonPattern, '$1');
  fixes.push(`Leading semicolons: ${leadingMatches.length}`);
}

// Pattern 2: Type annotations with comma instead of colon
const typeAnnotationPattern = /\b(const|let|var|private|protected|public|readonly)\s+(\w+),\s*([A-Z]\w*(?:<[^>]+>)?(?:\s*\|\s*\w+(?:<[^>]+>)?)*)\s*(;|=|\))/g;
const typeMatches = content.match(typeAnnotationPattern);
if (typeMatches) {
  content = content.replace(typeAnnotationPattern, '$1 $2: $3$4');
  fixes.push(`Type annotations: ${typeMatches.length}`);
}

// Pattern 3: Method return types with comma instead of colon
const methodReturnTypePattern = /(\w+)\s*\(\s*([^)]*)\s*\)\s*,\s*(void|Promise<[^>]+>|[A-Z]\w*(?:<[^>]+>)?)\s*\{/g;
const methodMatches = content.match(methodReturnTypePattern);
if (methodMatches) {
  content = content.replace(methodReturnTypePattern, '$1($2): $3 {');
  fixes.push(`Method return types: ${methodMatches.length}`);
}

// Pattern 4: Interface/type property with comma instead of colon
const interfacePropertyPattern = /^(\s*)(\w+)(\?)?(?:,)\s*([A-Z]\w*(?:<[^>]+>)?(?:\s*\|\s*\w+(?:<[^>]+>)?)*)\s*;/gm;
const interfaceMatches = content.match(interfacePropertyPattern);
if (interfaceMatches) {
  content = content.replace(interfacePropertyPattern, '$1$2$3: $4;');
  fixes.push(`Interface properties: ${interfaceMatches.length}`);
}

// Pattern 5: Object literal properties with comma instead of colon (hex values)
const objectPropertyPattern = /(\{[^}]*?)(\w+),\s*(0x[0-9a-fA-F]+|\d+|true|false|null|undefined|'[^']*'|"[^"]*")\s*([,}])/g;
const objectMatches = content.match(objectPropertyPattern);
if (objectMatches) {
  content = content.replace(objectPropertyPattern, '$1$2: $3$4');
  fixes.push(`Object properties: ${objectMatches.length}`);
}

// Pattern 6: Fix `[key, string]` in index signatures → `[key: string]`
const indexSignaturePattern = /\[(\w+),\s*(string|number|symbol)\]/g;
const indexMatches = content.match(indexSignaturePattern);
if (indexMatches) {
  content = content.replace(indexSignaturePattern, '[$1: $2]');
  fixes.push(`Index signatures: ${indexMatches.length}`);
}

console.log('Fixes applied:');
fixes.forEach(f => console.log(`  - ${f}`));

if (content !== originalContent) {
  writeFileSync(filePath, content, 'utf-8');
  console.log(`\nFile updated: ${filePath}`);
} else {
  console.log('\nNo changes made.');
}
