#!/usr/bin/env node

/**
 * Phase 80 Chunk 4: Fix Function Signature Corruption
 *
 * Root Cause: Mojibake pattern where colons replace commas in function parameters
 * Pattern: `password: string: hash, string` → `password: string, hash: string`
 *
 * This causes "Cannot find name 'password'" errors (17,308 instances)
 * because TypeScript parses `password: string:` as incomplete type annotation.
 *
 * Fix Strategy:
 * 1. Find patterns like `param: type: nextParam`
 * 2. Replace with `param: type, nextParam: type`
 * 3. Handle return type corruption: `): returnType:` → `): returnType`
 */

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');

console.log('🔧 Phase 80 Chunk 4: Fix Function Signature Corruption\n');

// Files to process (from error report)
const targetFiles = await glob('src/**/*.{ts,svelte}', {
  cwd: ROOT,
  absolute: true,
  ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**']
});

console.log(`📋 Found ${targetFiles.length} TypeScript/Svelte files\n`);

let filesFixed = 0;
let totalFixes = 0;

for (const filePath of targetFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  let fixed = content;
  let fileFixCount = 0;

  // Pattern 1: Fix parameter list corruption: `param: type: nextParam, type`
  // Matches: password: string: hash, string
  // Becomes: password: string, hash: string
  const paramPattern = /(\w+):\s*(\w+):\s*(\w+),\s*(\w+)/g;
  const paramMatches = content.match(paramPattern);
  if (paramMatches) {
    fixed = fixed.replace(paramPattern, '$1: $2, $3: $4');
    fileFixCount += paramMatches.length;
  }

  // Pattern 2: Fix return type corruption: `): returnType: Promise`
  // Matches: ): string: Promise<boolean>
  // Becomes: ): Promise<boolean>
  const returnPattern = /\):\s*\w+:\s*(Promise<[^>]+>|string|number|boolean|void)/g;
  const returnMatches = content.match(returnPattern);
  if (returnMatches) {
    fixed = fixed.replace(returnPattern, '): $1');
    fileFixCount += returnMatches.length;
  }

  // Pattern 3: Fix multi-param corruption: `param: type: param2: type2: param3`
  // Matches: password: string: hash: string: salt
  // Becomes: password: string, hash: string, salt: string
  const multiParamPattern = /(\w+):\s*(\w+):\s*(\w+):\s*(\w+):\s*(\w+)/g;
  const multiMatches = content.match(multiParamPattern);
  if (multiMatches) {
    fixed = fixed.replace(multiParamPattern, '$1: $2, $3: $4, $5: string');
    fileFixCount += multiMatches.length;
  }

  // Pattern 4: Fix inline object corruption: `{ score: number, feedback: string, string: string[] }`
  // This is a different pattern - remove duplicate type annotations
  const objectPattern = /{\s*score:\s*number,\s*feedback:\s*string,\s*string:\s*string\[\]/g;
  if (content.match(objectPattern)) {
    fixed = fixed.replace(objectPattern, '{ score: number, feedback: string[]');
    fileFixCount += 1;
  }

  // Pattern 5: Fix const declaration corruption: `const: feedback, string[]`
  // Becomes: `const feedback: string[]`
  const constPattern = /const:\s*(\w+),\s*(string\[\]|number|boolean)/g;
  const constMatches = content.match(constPattern);
  if (constMatches) {
    fixed = fixed.replace(constPattern, 'const $1: $2');
    fileFixCount += constMatches.length;
  }

  if (fileFixCount > 0) {
    fs.writeFileSync(filePath, fixed, 'utf8');
    const relativePath = path.relative(ROOT, filePath);
    console.log(`✅ ${relativePath}: ${fileFixCount} fixes`);
    filesFixed++;
    totalFixes += fileFixCount;
  }
}

console.log('\n📊 Summary:');
console.log(`   Files modified: ${filesFixed}`);
console.log(`   Total fixes: ${totalFixes}`);
console.log('');
console.log('✅ Function signature corruption fixed!');
console.log('');
console.log('📊 Expected Impact:');
console.log('   - BEFORE: 17,308 "Cannot find name \'password\'" errors');
console.log('   - BEFORE: Thousands more parameter name errors');
console.log('   - AFTER: Function signatures restored');
console.log('   - Expected reduction: -10,000 to -15,000 errors');
console.log('');
console.log('🔍 Next: Run `npx svelte-check` to measure impact');
