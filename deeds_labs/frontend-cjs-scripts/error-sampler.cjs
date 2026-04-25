#!/usr/bin/env node

/**
 * Error Sampling Script - Quick analysis of svelte-check errors
 * Samples errors from different directories to understand patterns
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔍 Sampling errors from different parts of the codebase...\n');

// Sample different directories to understand error distribution
const samplePaths = [
  'src/lib/components/',
  'src/lib/server/',
  'src/routes/',
  'src/lib/ai/',
  'src/lib/stores/',
];

const errorPatterns = new Map();
let totalSampled = 0;

for (const path of samplePaths) {
  if (fs.existsSync(path)) {
    try {
      console.log(`📂 Checking ${path}...`);
      const cmd = `timeout 10s npx svelte-check --output machine ${path} 2>&1 || true`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 12000 });

      // Parse errors and count patterns
      const lines = output
        .split('\n')
        .filter((line) => line.includes('error') && line.includes(':'));

      lines.slice(0, 5).forEach((line) => {
        // Extract error type/pattern
        const match = line.match(/error\s+(TS\d+|svelte\(\d+\)):\s*(.+)/);
        if (match) {
          const errorCode = match[1];
          const errorMsg = match[2].substring(0, 60) + '...';
          const key = `${errorCode}: ${errorMsg}`;

          errorPatterns.set(key, (errorPatterns.get(key) || 0) + 1);
          totalSampled++;
        }
      });

      console.log(`   Found ${lines.length} errors (sampled ${Math.min(5, lines.length)})`);
    } catch (error) {
      console.log(`   ❌ Failed to check ${path}: ${error.message}`);
    }
  }
}

console.log('\n📊 Top Error Patterns Found:');
console.log('=' + '='.repeat(60));

// Sort by frequency and show top 10
const sortedErrors = [...errorPatterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

sortedErrors.forEach(([pattern, count]) => {
  console.log(`${count.toString().padStart(3)} × ${pattern}`);
});

console.log(`\n📈 Total errors sampled: ${totalSampled}`);
console.log('📋 Recommended fixes:');

// Suggest fixes based on common patterns
if (sortedErrors.some(([pattern]) => pattern.includes('Cannot find module'))) {
  console.log('   1. Fix import paths and add .js extensions');
}
if (sortedErrors.some(([pattern]) => pattern.includes('export let'))) {
  console.log('   2. Migrate Svelte 4 → 5 (export let → $state)');
}
if (
  sortedErrors.some(
    ([pattern]) => pattern.includes('Property') && pattern.includes('does not exist')
  )
) {
  console.log('   3. Update type definitions and interfaces');
}

console.log('\n✅ Use these patterns to create targeted fixes.');
