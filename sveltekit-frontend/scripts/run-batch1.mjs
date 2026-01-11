#!/usr/bin/env node
/**
 * Phase 90: Simple Batch 1 Executor
 * Process first 10 files from top-100-error-files.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { processFile } from './phase90-ast-fixer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Phase 90: Batch 1 Execution');
console.log('═'.repeat(70));

// Load top 100 files
const errorFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');
const errorFilesData = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));
const errorFiles = errorFilesData.track1Files || [];

// First 10 files
const batch1 = errorFiles.slice(0, 10).map(f => ({ path: f.file, ...f }));

console.log(`\n📋 Processing ${batch1.length} files (Batch 1)`);
console.log('═'.repeat(70));

const results = [];

for (const fileInfo of batch1) {
    try {
        const result = await processFile(fileInfo.path);
        results.push(result);

        console.log(`\n✅ ${path.basename(fileInfo.path)}: ${result.fixesApplied} fixes, ${result.errorsBefore} → ${result.errorsAfter} errors`);
    } catch (error) {
        console.error(`\n❌ ${fileInfo.path}: ${error.message}`);
        results.push({
            filePath: fileInfo.path,
            error: error.message,
            success: false,
        });
    }
}

// Summary
const successful = results.filter(r => r.success);
const totalFixes = results.reduce((sum, r) => sum + (r.fixesApplied || 0), 0);
const totalReduction = results.reduce((sum, r) => sum + ((r.errorsBefore || 0) - (r.errorsAfter || 0)), 0);

console.log(`\n\n📊 Batch 1 Summary:`);
console.log('═'.repeat(70));
console.log(`  ✅ Successful: ${successful.length}/${batch1.length}`);
console.log(`  🎯 Total fixes: ${totalFixes}`);
console.log(`  📉 Total error reduction: ${totalReduction}`);
console.log(`  🔮 Projected with 1.84x cascade: ~${Math.floor(totalReduction * 1.84)}`);

// Save results
const resultsPath = path.join(__dirname, '../reports/phase90-batch1-results.json');
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(`\n💾 Results saved: ${resultsPath}`);

console.log(`\n✅ Batch 1 complete!`);
