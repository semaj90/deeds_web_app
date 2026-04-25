#!/usr/bin/env node
/**
 * Extended Batch Fixer - Process ALL top 1000 files
 * Continues from Phase 40 analysis, processes all identified files
 */

import fs from 'fs/promises';
import path from 'path';

// Enhanced error fixes with more patterns
const ENHANCED_FIXES = {
  TS1005: [
    { pattern: /(\w+)\s*;\s*:/g, replacement: '$1:' },
    { pattern: /(\w+)\s*,\s*:/g, replacement: '$1:' },
    { pattern: /:\s*,/g, replacement: ':' },
    { pattern: /,\s*,+/g, replacement: ',' },
    { pattern: /{\s*,/g, replacement: '{' },
    { pattern: /,\s*}/g, replacement: '}' },
  ],
  
  TS1128: [
    { pattern: /}\s*;?\s*{/g, replacement: '}\n{' },
    { pattern: /^\s*;+\s*$/gm, replacement: '' },
    { pattern: /}\s*\)/g, replacement: '}' },
    { pattern: /\)\s*{/g, replacement: ') {' },
  ],
  
  TS1109: [
    { pattern: /\(\s*,/g, replacement: '(' },
    { pattern: /,\s*\)/g, replacement: ')' },
    { pattern: /\[\s*,/g, replacement: '[' },
    { pattern: /,\s*\]/g, replacement: ']' },
    { pattern: /=\s*,/g, replacement: '=' },
  ],
  
  TS1131: [
    { pattern: /(\w+)\s*,\s*(\d+|true|false|null)/g, replacement: '$1: $2' },
    { pattern: /(\w+)\s*,\s*(['"`])/g, replacement: '$1: $2' },
    { pattern: /(\w+)\s*,\s*\[/g, replacement: '$1: [' },
    { pattern: /(\w+)\s*,\s*\{/g, replacement: '$1: {' },
  ],
  
  TS1434: [
    { pattern: /\s+(\w+)\s+(\w+)\s*:/g, replacement: ' $2:' },
    { pattern: /}\s*(\w+)\s*{/g, replacement: '}\n$1 {' },
  ],
  
  TS1003: [
    { pattern: /\.\s*,/g, replacement: '.' },
    { pattern: /\.\s*;/g, replacement: '.' },
    { pattern: /\s+\./g, replacement: '.' },
  ],
  
  TS1011: [
    { pattern: /\[\s*\]/g, replacement: '[0]' },
    { pattern: /\[\s*,\s*\]/g, replacement: '[0]' },
  ],
  
  TS1136: [
    { pattern: /(\w+)\s*;/g, replacement: '$1' },
    { pattern: /(\w+)\s*,\s*;/g, replacement: '$1;' },
  ],
  
  TS1472: [
    { pattern: /try\s*{([^}]*)}\s*$/gm, replacement: 'try {$1} catch (e) {}' },
    { pattern: /catch\s*\(/g, replacement: 'catch (error) (' },
  ],
};

async function loadAllErrors() {
  const data = await fs.readFile('error-analysis-report.json', 'utf-8');
  const analysis = JSON.parse(data);
  return analysis.topFiles.slice(0, 1000);  // Top 1000
}

async function fixFile(filePath, errorCodes) {
  try {
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      return { success: false, error: 'File not found', file: filePath };
    }
    
    let content = await fs.readFile(filePath, 'utf-8');
    const original = content;
    let fixCount = 0;
    
    for (const code of errorCodes) {
      const fixes = ENHANCED_FIXES[code];
      if (!fixes) continue;
      
      for (const { pattern, replacement } of fixes) {
        const newContent = content.replace(pattern, replacement);
        if (newContent !== content) {
          content = newContent;
          fixCount++;
        }
      }
    }
    
    if (content !== original && fixCount > 0) {
      const backupPath = `${filePath}.batch1000-backup`;
      await fs.writeFile(backupPath, original);
      await fs.writeFile(filePath, content);
      return { success: true, fixCount, file: filePath };
    }
    
    return { success: true, fixCount: 0, file: filePath, skipped: true };
    
  } catch (error) {
    return { success: false, error: error.message, file: filePath };
  }
}

async function processBatch(files, batchNum, size = 100) {
  console.log(`\n📦 Batch ${batchNum}: ${files.length} files`);
  
  const results = { fixed: 0, skipped: 0, failed: 0, totalFixes: 0 };
  
  for (const fileInfo of files) {
    const result = await fixFile(fileInfo.file, fileInfo.errorCodes);
    
    if (result.success) {
      if (result.skipped) {
        results.skipped++;
      } else {
        results.fixed++;
        results.totalFixes += result.fixCount;
        if (result.fixCount > 5) {
          console.log(`  ✅ ${path.basename(fileInfo.file)}: ${result.fixCount} fixes`);
        }
      }
    } else {
      results.failed++;
    }
    
    if ((results.fixed + results.skipped + results.failed) % 20 === 0) {
      process.stdout.write('.');
    }
  }
  
  console.log('\n');
  return results;
}

async function main() {
  console.log('🚀 Extended Batch Fixer - Top 1000 Files\n');
  
  const allFiles = await loadAllErrors();
  console.log(`📊 Loaded ${allFiles.length} files to process\n`);
  
  const batchSize = 100;
  const totalBatches = Math.ceil(allFiles.length / batchSize);
  
  const overall = { fixed: 0, skipped: 0, failed: 0, totalFixes: 0 };
  
  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, allFiles.length);
    const batch = allFiles.slice(start, end);
    
    const results = await processBatch(batch, i + 1, batchSize);
    
    overall.fixed += results.fixed;
    overall.skipped += results.skipped;
    overall.failed += results.failed;
    overall.totalFixes += results.totalFixes;
    
    console.log(`  Batch ${i+1}: ${results.fixed} fixed, ${results.skipped} skipped, ${results.failed} failed`);
  }
  
  console.log('\n📊 Final Results:');
  console.log(`  ✅ Fixed: ${overall.fixed} files`);
  console.log(`  ⏭️  Skipped: ${overall.skipped} files`);
  console.log(`  ❌ Failed: ${overall.failed} files`);
  console.log(`  🔧 Total Fixes: ${overall.totalFixes}`);
  
  const report = {
    timestamp: new Date().toISOString(),
    filesProcessed: allFiles.length,
    results: overall,
    batches: totalBatches
  };
  
  await fs.writeFile('batch-1000-results.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Saved to batch-1000-results.json');
}

main().catch(console.error);
