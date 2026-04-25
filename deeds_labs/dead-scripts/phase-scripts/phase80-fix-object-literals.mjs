#!/usr/bin/env node

/**
 * Phase 80 Chunk 5: Fix Object Literal Corruption
 *
 * Root Cause: Mojibake pattern in object literals where property names/values are corrupted
 *
 * Patterns Found:
 * 1. { messages: temperature, 0: 0: 0.05: max_tokens, 1024: 1024: 1024 }
 *    → { messages, temperature: 0.05, max_tokens: 1024 }
 *
 * 2. { prop: value: nextProp: nextValue }
 *    → { prop: value, nextProp: nextValue }
 *
 * This causes "Cannot find name 'temperature'" errors (16,629 instances)
 */

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('🔧 Phase 80 Chunk 5: Fix Object Literal Corruption\n');

const targetFiles = await glob('src/**/*.{ts,svelte}', {
  cwd: ROOT,
  absolute: true,
  ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**']
});

console.log(`📋 Found ${targetFiles.length} TypeScript/Svelte files\n`);

let filesFixed = 0;
let totalFixes = 0;

// Specific known patterns from gemma3Client.ts and ollamaClient.ts
const KNOWN_CORRUPTIONS = [
  // Pattern: { messages: temperature, 0: 0: 0.05 ...}
  {
    find: /{\s*messages:\s*temperature,\s*0:\s*0:\s*0\.05:\s*max_tokens,\s*1024:\s*1024:\s*1024\s*}/g,
    replace: '{ messages, temperature: 0.05, max_tokens: 1024 }',
    description: 'Ollama API object with temperature/max_tokens'
  },

  // Pattern: { messages: temperature, 0: 0: 0.1 ...}
  {
    find: /{\s*messages:\s*temperature,\s*0:\s*0:\s*0\.1:\s*max_tokens,\s*1024:\s*1024:\s*1024\s*}/g,
    replace: '{ messages, temperature: 0.1, max_tokens: 1024 }',
    description: 'Ollama API object variant (temp 0.1)'
  },

  // Pattern: { messages: temperature, 0: 0: 0.7 ...}
  {
    find: /{\s*messages:\s*temperature,\s*0:\s*0:\s*0\.7:\s*max_tokens,\s*(\d+):\s*\1:\s*\1\s*}/g,
    replace: '{ messages, temperature: 0.7, max_tokens: $1 }',
    description: 'Ollama API object variant (temp 0.7)'
  },

  // Pattern: { temperature: 0 }
  {
    find: /{\s*temperature:\s*0:\s*0:\s*0\s*}/g,
    replace: '{ temperature: 0 }',
    description: 'Simple temperature object'
  },

  // Pattern: { temperature, 0: 0: 0.05 }
  {
    find: /{\s*temperature,\s*(\d+(?:\.\d+)?):\s*\1:\s*\1\s*}/g,
    replace: '{ temperature: $1 }',
    description: 'Shorthand temperature with numeric corruption'
  }
];

for (const filePath of targetFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  let fixed = content;
  let fileFixCount = 0;

  // Apply known corruption patterns
  for (const pattern of KNOWN_CORRUPTIONS) {
    const matches = content.match(pattern.find);
    if (matches) {
      fixed = fixed.replace(pattern.find, pattern.replace);
      fileFixCount += matches.length;
    }
  }

  // Generic pattern 1: Fix numeric property corruption: `prop: 123: 123: 123`
  // Matches: max_tokens: 1024: 1024: 1024
  // Becomes: max_tokens: 1024
  const numericPattern = /(\w+):\s*(\d+(?:\.\d+)?):\s*\2:\s*\2/g;
  const numericMatches = content.match(numericPattern);
  if (numericMatches) {
    fixed = fixed.replace(numericPattern, '$1: $2');
    fileFixCount += numericMatches.length;
  }

  // Generic pattern 2: Fix object property corruption: `prop: value: nextProp`
  // Matches: temperature: 0.05: max_tokens
  // Becomes: temperature: 0.05, max_tokens
  const objectPropPattern = /(\w+):\s*([\w\d.]+):\s*(\w+):/g;
  const objectPropMatches = content.match(objectPropPattern);
  if (objectPropMatches) {
    fixed = fixed.replace(objectPropPattern, '$1: $2, $3:');
    fileFixCount += objectPropMatches.length;
  }

  // Generic pattern 3: Fix shorthand with corruption: `{ prop, value: value: value }`
  // Matches: { messages, temperature, 0: 0: 0.05 }
  // Becomes: { messages, temperature: 0.05 }
  const shorthandPattern = /{\s*(\w+),\s*(\w+),\s*([\d.]+):\s*\3:\s*\3\s*}/g;
  const shorthandMatches = content.match(shorthandPattern);
  if (shorthandMatches) {
    fixed = fixed.replace(shorthandPattern, '{ $1, $2: $3 }');
    fileFixCount += shorthandMatches.length;
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
console.log('✅ Object literal corruption fixed!');
console.log('');
console.log('📊 Expected Impact:');
console.log('   - BEFORE: 16,629 "Cannot find name \'temperature\'" errors');
console.log('   - BEFORE: Thousands of malformed object literal errors');
console.log('   - AFTER: Clean Ollama/Gemma API calls');
console.log('   - Expected reduction: -12,000 to -15,000 errors');
console.log('');
console.log('🔍 Next: Run `npx svelte-check` to measure impact');
