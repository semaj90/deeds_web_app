#!/usr/bin/env node
/**
 * Identify Clean Files for Phase 72 KAG Testing
 * Finds files with 0 TypeScript errors to create subset for KAG population
 */

import { readFileSync, writeFileSync } from 'fs';

console.log('🔍 Analyzing errors.jsonl to identify clean files...\n');

// Read errors
const errorsJsonl = readFileSync('errors.jsonl', 'utf-8');
const errorLines = errorsJsonl.trim().split('\n').filter(line => line.trim());
const errors = errorLines.map(line => JSON.parse(line));

console.log(`📊 Total errors loaded: ${errors.length}`);

// Group by file
const fileErrorCounts = new Map();
for (const error of errors) {
  const count = fileErrorCounts.get(error.file) || 0;
  fileErrorCounts.set(error.file, count + 1);
}

console.log(`📁 Total files with errors: ${fileErrorCounts.size}\n`);

// Find all TypeScript files in src/
import { execSync } from 'child_process';
const allFilesOutput = execSync('git ls-files "src/**/*.ts" "src/**/*.svelte"', { encoding: 'utf-8' });
const allFiles = allFilesOutput.trim().split('\n').filter(f => f);

console.log(`📂 Total TypeScript/Svelte files in src/: ${allFiles.length}`);

// Find clean files (0 errors) - normalize paths
const normalizedErrors = new Set(
  Array.from(fileErrorCounts.keys()).map(f => f.replace(/\\/g, '/'))
);
const cleanFiles = allFiles.filter(file => {
  const normalized = file.replace(/\\/g, '/');
  return !normalizedErrors.has(normalized);
});

console.log(`✅ Clean files found: ${cleanFiles.length}\n`);

if (cleanFiles.length === 0) {
  console.log('❌ No clean files found. All files have errors.');
  console.log('💡 Suggestion: Run corruption fixer first to create clean files.');
  process.exit(1);
}

// Categorize clean files
const categories = {
  routes: [],
  lib: [],
  components: [],
  stores: [],
  utils: [],
  types: [],
  other: []
};

for (const file of cleanFiles) {
  if (file.startsWith('src/routes/')) categories.routes.push(file);
  else if (file.includes('/components/')) categories.components.push(file);
  else if (file.includes('/stores/')) categories.stores.push(file);
  else if (file.includes('/utils/')) categories.utils.push(file);
  else if (file.includes('/types/') || file.endsWith('.d.ts')) categories.types.push(file);
  else if (file.startsWith('src/lib/')) categories.lib.push(file);
  else categories.other.push(file);
}

// Print categorized results
console.log('📋 Clean Files by Category:');
console.log('═'.repeat(60));
for (const [category, files] of Object.entries(categories)) {
  if (files.length > 0) {
    console.log(`\n${category.toUpperCase()} (${files.length} files):`);
    files.slice(0, 10).forEach(f => console.log(`  ✓ ${f}`));
    if (files.length > 10) {
      console.log(`  ... and ${files.length - 10} more`);
    }
  }
}

// Generate tsconfig.subset.json for clean files (ULTRA-MINIMAL - auto-generated route types)
const isolatedFiles = cleanFiles.filter((file) => {
  // Only SvelteKit auto-generated $types.d.ts files (no custom code dependencies)
  return file.includes('/$types.d.ts') && !file.includes('__tests__');
});

const subsetConfig = {
  extends: './tsconfig.json',
  include: isolatedFiles.slice(0, Math.min(50, isolatedFiles.length)), // Limit to 50 isolated files
  compilerOptions: {
    noEmit: true,
    skipLibCheck: true
  }
};

writeFileSync('tsconfig.kag-subset.json', JSON.stringify(subsetConfig, null, 2));
console.log('\n✅ Created tsconfig.kag-subset.json with', subsetConfig.include.length, 'auto-generated route types (no custom dependencies)');

// Save clean files list
const cleanFilesList = {
  timestamp: new Date().toISOString(),
  totalCleanFiles: cleanFiles.length,
  subset: cleanFiles.slice(0, 50),
  categories: Object.fromEntries(
    Object.entries(categories).map(([k, v]) => [k, v.length])
  )
};

writeFileSync('reports/clean-files-subset.json', JSON.stringify(cleanFilesList, null, 2));
console.log('✅ Saved clean files list to reports/clean-files-subset.json');

console.log('\n🎯 NEXT STEPS:');
console.log('   1. Test TypeScript on subset: npx tsc --noEmit -p tsconfig.kag-subset.json');
console.log('   2. If passes, use for KAG population');
console.log('   3. Gradually expand subset as more files are fixed\n');
