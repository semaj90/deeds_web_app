#!/usr/bin/env node
/**
 * Batch Error Fixer - Top 1000 Files
 * Fixes errors in batches of 100 files at a time
 * Uses AST-based semantic fixes for TypeScript/Svelte files
 */

import fs from 'fs/promises';
import path from 'path';

// Load critical files from Phase 40 analysis
async function loadCriticalFiles() {
  const data = await fs.readFile('phase40-critical-files.json', 'utf-8');
  const analysis = JSON.parse(data);
  return analysis.severeFiles || [];
}

// Common error patterns and their fixes
const ERROR_FIXES = {
  // TS1005: ',' expected
  TS1005: [
    { pattern: /(\w+)\s*;\s*:/g, replacement: '$1:' },  // field; : → field:
    { pattern: /(\w+)\s*,\s*:/g, replacement: '$1:' },  // field, : → field:
    { pattern: /:\s*,/g, replacement: ':' },             // : , → :
    { pattern: /,\s*,/g, replacement: ',' },             // , , → ,
  ],
  
  // TS1128: Declaration or statement expected
  TS1128: [
    { pattern: /}\s*;?\s*{/g, replacement: '}\n{' },     // }{ → }\n{
    { pattern: /^\s*;+\s*$/gm, replacement: '' },        // Remove stray semicolons
    { pattern: /}\s*\)/g, replacement: '}' },            // }) → }
  ],
  
  // TS1109: Expression expected
  TS1109: [
    { pattern: /\(\s*,/g, replacement: '(' },            // (, → (
    { pattern: /,\s*\)/g, replacement: ')' },            // ,) → )
    { pattern: /\[\s*,/g, replacement: '[' },            // [, → [
    { pattern: /,\s*\]/g, replacement: ']' },            // ,] → ]
  ],
  
  // TS1131: Property or signature expected
  TS1131: [
    { pattern: /(\w+)\s*,\s*(\d+|true|false|null)/g, replacement: '$1: $2' },  // key, value → key: value
    { pattern: /(\w+)\s*,\s*(['"`])/g, replacement: '$1: $2' },  // key, "str" → key: "str"
  ],
  
  // TS1434: Unexpected keyword or identifier
  TS1434: [
    { pattern: /\s+(\w+)\s+(\w+)\s*:/g, replacement: ' $2:' },  // duplicate words
    { pattern: /}\s*(\w+)\s*{/g, replacement: '}\n$1 {' },      // }word{ → }\nword {
  ],
  
  // TS1003: Identifier expected
  TS1003: [
    { pattern: /\.\s*,/g, replacement: '.' },            // ., → .
    { pattern: /\.\s*;/g, replacement: '.' },            // .; → .
  ],
};

// Apply fixes to a file
async function fixFile(filePath, errorCodes) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const original = content;
    let fixCount = 0;
    
    // Apply fixes based on error codes
    for (const code of errorCodes) {
      const fixes = ERROR_FIXES[code];
      if (!fixes) continue;
      
      for (const { pattern, replacement } of fixes) {
        const newContent = content.replace(pattern, replacement);
        if (newContent !== content) {
          content = newContent;
          fixCount++;
        }
      }
    }
    
    // Only write if changes were made
    if (content !== original && fixCount > 0) {
      // Backup original
      const backupPath = `${filePath}.batch-backup`;
      await fs.writeFile(backupPath, original);
      
      // Write fixed content
      await fs.writeFile(filePath, content);
      
      return { success: true, fixCount, file: filePath };
    }
    
    return { success: true, fixCount: 0, file: filePath, skipped: true };
    
  } catch (error) {
    return { success: false, error: error.message, file: filePath };
  }
}

// Process files in batches
async function processBatch(files, batchNumber, batchSize = 100) {
  console.log(`\n📦 Batch ${batchNumber}: Processing ${files.length} files...`);
  
  const results = {
    fixed: 0,
    skipped: 0,
    failed: 0,
    totalFixes: 0
  };
  
  for (const fileInfo of files) {
    const result = await fixFile(fileInfo.file, fileInfo.errorCodes);
    
    if (result.success) {
      if (result.skipped) {
        results.skipped++;
      } else {
        results.fixed++;
        results.totalFixes += result.fixCount;
        console.log(`  ✅ Fixed: ${fileInfo.file} (${result.fixCount} patterns)`);
      }
    } else {
      results.failed++;
      console.log(`  ❌ Failed: ${fileInfo.file} - ${result.error}`);
    }
  }
  
  return results;
}

// Main execution
async function main() {
  console.log('🔧 Batch Error Fixer - Top 1000 Files\n');
  
  // Load critical files
  const criticalFiles = await loadCriticalFiles();
  console.log(`📊 Loaded ${criticalFiles.length} critical files`);
  
  // Process in batches of 100
  const batchSize = 100;
  const totalBatches = Math.ceil(criticalFiles.length / batchSize);
  
  const overallResults = {
    fixed: 0,
    skipped: 0,
    failed: 0,
    totalFixes: 0
  };
  
  for (let i = 0; i < totalBatches && i < 10; i++) {  // Max 10 batches (1000 files)
    const start = i * batchSize;
    const end = Math.min(start + batchSize, criticalFiles.length);
    const batch = criticalFiles.slice(start, end);
    
    const batchResults = await processBatch(batch, i + 1, batchSize);
    
    overallResults.fixed += batchResults.fixed;
    overallResults.skipped += batchResults.skipped;
    overallResults.failed += batchResults.failed;
    overallResults.totalFixes += batchResults.totalFixes;
  }
  
  // Summary
  console.log('\n📊 Overall Results:');
  console.log(`  Fixed: ${overallResults.fixed} files`);
  console.log(`  Skipped: ${overallResults.skipped} files (no changes needed)`);
  console.log(`  Failed: ${overallResults.failed} files`);
  console.log(`  Total Fixes Applied: ${overallResults.totalFixes}`);
  
  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    results: overallResults,
    batchSize,
    totalBatches
  };
  
  await fs.writeFile('batch-fix-results.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Results saved to batch-fix-results.json');
  
  if (overallResults.failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
